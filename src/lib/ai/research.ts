import {
  RESEARCH_BUILD_NEEDS,
  RESEARCH_GAP_QUERIES,
  RESEARCH_MAX_RESULTS,
  RESEARCH_MAX_SEARCHES,
  RESEARCH_PAGES,
  RESEARCH_QUERIES,
  RESEARCH_RESULTS_PER_QUERY,
} from "./config";
import { RESEARCH_PLANNER_SYSTEM } from "./prompt";
import { getProvider, models } from "./providers";
import { webSearch } from "./web-search";
import type { ToolCitation, WebResult } from "./types";
import { coercePlan, fallbackPlan, type ResearchKind, type ResearchPlan } from "./deep-research/kinds";
import { researchCatalogue, type BuildSlot } from "./deep-research/catalogue";
import { gapQueries } from "./deep-research/gaps";
import { hostOf, poolResults, rankForReading } from "./deep-research/pool";
import { fetchPageText } from "./deep-research/fetch-page";
import type { SummaryInput } from "@/lib/compare/intelligence/summary";

/*
  Deep research, premium only (D51), v2 since 2026-11-04 (phase DR, D231).

  v1 planned four searches and read their snippets: barely more than a normal
  web search. v2 does what neither web search nor catalogue search can alone:

    1. Plan: what kind of question (choose a tool, or build a project), the
       angles to search, and for a build the stack slots to fill.
    2. Catalogue: the Tool & Model engine, wider than a normal answer, and for
       a build once per slot; then the Compare engine over the candidates,
       which knows prices, plans and benchmarks with sources, and what is NOT
       recorded.
    3. Web: the planned angles, then follow ups aimed at exactly what the
       catalogue is missing, and each build pick's own setup guide. At most
       RESEARCH_MAX_SEARCHES Serper calls, the only paid step.
    4. Read: the best pages opened in full (official sites first), not just
       their snippets.

  The planner is a model call that may fail; a local plan sits behind it. Every
  web result and page stays untrusted: this module returns data only, and the
  prompt builder places it below the safety rules.
*/

export type ResearchProgress = (label: string) => void;

export type ResearchPage = WebResult & { text: string | null };

export type ResearchResult = {
  kind: ResearchKind;
  queries: string[];
  /* Pooled results, the read ones carrying page text. */
  web: ResearchPage[];
  /* The wider catalogue pool the report draws on (cards stay the normal six). */
  tools: ToolCitation[];
  slots: BuildSlot[];
  evidence: SummaryInput | null;
  searches: number;
  pagesRead: number;
  compared: number;
};

async function planResearch(question: string, topic: string): Promise<ResearchPlan> {
  const limits = { queries: RESEARCH_QUERIES, needs: RESEARCH_BUILD_NEEDS };
  const { fast } = models();
  try {
    const result = await getProvider().generate({
      feature: "ask",
      system: RESEARCH_PLANNER_SYSTEM,
      // The question only. Conversation history in a planner is a lever for
      // steering searches somewhere the scope gate already decided about.
      messages: [{ role: "user", content: question }],
      model: fast,
      maxOutputTokens: 400,
      temperature: 0,
      /* Thinking eats the cap on a reasoning model and returns an empty body
         (observed 2026-09-13). */
      thinking: "off",
    });
    const plan = coercePlan(result.text, question, limits);
    if (plan) return plan;
    console.warn("[ai] research planner returned unusable output, using the local plan");
  } catch (err) {
    console.error("[ai] research planner failed", err);
  }
  return fallbackPlan(question, topic, limits);
}

export async function runDeepResearch(opts: {
  question: string;
  topic: string;
  viewerId?: string | null;
  onStep: ResearchProgress;
  signal?: AbortSignal;
}): Promise<ResearchResult> {
  /*
    Live activity (founder 2026-11-04): every step is reported as it happens,
    each search with its query and result count and each page as it is read,
    so the wait shows the work. The same lines are saved as the research trail
    shown under "View research" afterwards.
  */
  opts.onStep("Planning the research");
  const plan = await planResearch(opts.question, opts.topic);
  const planned = plan.queries.slice(0, RESEARCH_MAX_SEARCHES);
  opts.onStep(
    plan.kind === "build"
      ? `Planned a roadmap: ${plan.needs.length} parts of the project, ${planned.length} searches`
      : `Planned ${planned.length} searches`,
  );

  opts.onStep(plan.kind === "build" ? "Choosing a tool for each part of the project" : "Searching the Celpare catalogue");
  const searchOne = (q: string, label: string) =>
    webSearch(q, { limit: RESEARCH_RESULTS_PER_QUERY, signal: opts.signal }).then((r) => {
      opts.onStep(`${label} "${q}", ${r.length} ${r.length === 1 ? "result" : "results"}`);
      return r;
    });
  const [catalogue, firstBatches] = await Promise.all([
    researchCatalogue({ kind: plan.kind, question: opts.question, needs: plan.needs, viewerId: opts.viewerId ?? null }),
    Promise.all(planned.map((q) => searchOne(q, "Searched"))),
  ]);
  if (plan.kind === "build") {
    const filled = catalogue.slots.filter((x) => x.picks.length > 0).length;
    opts.onStep(`Found catalogue tools for ${filled} of ${catalogue.slots.length} parts`);
  }
  if (catalogue.compared > 1) opts.onStep(`Compared ${catalogue.compared} catalogue tools on prices, plans and benchmarks`);

  /* Follow ups for what the catalogue could not answer, inside the cap. */
  const room = Math.max(0, Math.min(RESEARCH_GAP_QUERIES, RESEARCH_MAX_SEARCHES - planned.length));
  const gaps = room
    ? gapQueries({
        kind: plan.kind,
        missing: catalogue.missing,
        picks: catalogue.slots.flatMap((x) => (x.picks[0] ? [x.picks[0].name] : [])),
        already: planned,
        max: room,
      })
    : [];
  const gapBatches = await Promise.all(gaps.map((q) => searchOne(q, plan.kind === "build" ? "Looked up the setup guide" : "Looked up")));

  /* Gap results first: they answer a named question. */
  const pooled = poolResults([...gapBatches, ...firstBatches], RESEARCH_MAX_RESULTS);

  const toRead = rankForReading(pooled, catalogue.officialDomains, RESEARCH_PAGES);
  const texts = await Promise.all(
    toRead.map((i) =>
      fetchPageText(pooled[i].url).then((t) => {
        const where = hostOf(pooled[i].url) ?? pooled[i].url;
        opts.onStep(t ? `Read ${where}` : `Could not open ${where}, using its search summary`);
        return t;
      }),
    ),
  );
  const textAt = new Map(toRead.map((i, k) => [i, texts[k]]));
  const web: ResearchPage[] = pooled.map((r, i) => ({ ...r, text: textAt.get(i) ?? null }));
  const pagesRead = texts.filter(Boolean).length;

  if (pooled.length === 0) opts.onStep("No web sources found, answering from the catalogue");

  return {
    kind: plan.kind,
    queries: [...planned, ...gaps],
    web,
    tools: catalogue.tools,
    slots: catalogue.slots,
    evidence: catalogue.evidence,
    searches: planned.length + gaps.length,
    pagesRead,
    compared: catalogue.compared,
  };
}
