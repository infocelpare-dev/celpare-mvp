import {
  RESEARCH_MAX_RESULTS,
  RESEARCH_QUERIES,
  RESEARCH_RESULTS_PER_QUERY,
} from "./config";
import { RESEARCH_PLANNER_SYSTEM } from "./prompt";
import { getProvider, models } from "./providers";
import { webSearch } from "./web-search";
import type { WebResult } from "./types";

/*
  Deep research, premium only (D51).

  A normal answer runs at most one web search, on the classifier's topic phrase.
  Deep research is a different shape: plan several angles, search each one,
  pool and deduplicate what comes back, then synthesise over the pile with
  buildResearchPrompt. The founder's word for it is multi step, and these are
  the steps.

  Two rules carried over from the rest of the gateway.

  First, the planner is a model call that is allowed to fail. It runs on
  whatever cheap model is configured, and those return gibberish often enough
  (the classifier learned this the hard way) that a local expansion sits behind
  it. A failed planner degrades the research to four sensible queries; it never
  fails the question.

  Second, every result stays untrusted. This module returns data, labels
  nothing as instructions, and hands the pool to the prompt builder, which
  places it below the safety rules like any other web content.
*/

export type ResearchProgress = (label: string) => void;

export type ResearchResult = {
  queries: string[];
  web: WebResult[];
};

/* The fallback plan, and also the floor under a thin one. Four angles that are
   worth searching for almost any "which tool should I use" question. */
function localQueries(question: string, topic: string): string[] {
  const subject = (topic || question).trim().slice(0, 80);
  return [
    subject,
    `best ${subject} compared`,
    `${subject} pricing`,
    `${subject} limitations drawbacks`,
  ];
}

function coerceQueries(raw: string): string[] | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (!Array.isArray(parsed.queries)) return null;

    const queries = parsed.queries
      .filter((q): q is string => typeof q === "string")
      .map((q) => q.trim().slice(0, 120))
      .filter(Boolean);

    return queries.length ? queries : null;
  } catch {
    return null;
  }
}

async function planQueries(question: string, topic: string): Promise<string[]> {
  const { fast } = models();

  try {
    const provider = getProvider();
    const result = await provider.generate({
      feature: "ask",
      system: RESEARCH_PLANNER_SYSTEM,
      // The question only. Conversation history in a planner is a lever for
      // steering searches somewhere the scope gate already decided about.
      messages: [{ role: "user", content: question }],
      model: fast,
      maxOutputTokens: 300,
      temperature: 0,
      /* Writing four search phrases needs no deliberation, and on a reasoning
         model the thinking eats the cap and returns an empty body. Observed on
         2026-09-13: the planner fell back to the local plan on every attempt
         until this was turned off. */
      thinking: "off",
    });

    const planned = coerceQueries(result.text);
    if (planned) {
      // Deduplicate case insensitively, then cap. A planner that returns the
      // same phrase three times should cost one search, not three.
      const seen = new Set<string>();
      const unique = planned.filter((q) => {
        const key = q.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return unique.slice(0, RESEARCH_QUERIES);
    }

    console.warn("[ai] research planner returned unusable output, using the local plan");
  } catch (err) {
    console.error("[ai] research planner failed", err);
  }

  return localQueries(question, topic).slice(0, RESEARCH_QUERIES);
}

export async function runDeepResearch(opts: {
  question: string;
  topic: string;
  onStep: ResearchProgress;
  signal?: AbortSignal;
}): Promise<ResearchResult> {
  opts.onStep("Planning the research");
  const queries = await planQueries(opts.question, opts.topic);

  opts.onStep(
    queries.length === 1
      ? "Searching the web"
      : `Searching the web, ${queries.length} angles`,
  );

  const batches = await Promise.all(
    queries.map((q) =>
      webSearch(q, { limit: RESEARCH_RESULTS_PER_QUERY, signal: opts.signal }),
    ),
  );

  /*
    Pool and deduplicate by URL. Searching four related phrases returns the same
    comparison article three times, and paying for that page three times in the
    prompt crowds out the sources that only appeared once.

    Interleaved rather than concatenated: taking the first result of every
    query before the second of any keeps all four angles represented when the
    cap bites, instead of spending the whole budget on the first query.
  */
  const seen = new Set<string>();
  const pooled: WebResult[] = [];
  const depth = Math.max(0, ...batches.map((b) => b.length));

  for (let i = 0; i < depth && pooled.length < RESEARCH_MAX_RESULTS; i += 1) {
    for (const batch of batches) {
      if (pooled.length >= RESEARCH_MAX_RESULTS) break;
      const result = batch[i];
      if (!result) continue;

      const key = result.url.toLowerCase().replace(/[#?].*$/, "").replace(/\/$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      pooled.push(result);
    }
  }

  opts.onStep(
    pooled.length === 0
      ? "No web sources found, answering from the catalogue"
      : `Reading ${pooled.length} ${pooled.length === 1 ? "source" : "sources"}`,
  );

  return { queries, web: pooled };
}
