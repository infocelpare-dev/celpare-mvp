import "server-only";
import { parseConstraints } from "@/lib/recommend/constraints";
import { getCatalogueIndex } from "@/lib/recommend/server/cache";
import { getRecommendations } from "@/lib/recommend/server/engine";
import { loadCompareData, runCompareOn } from "@/lib/compare/intelligence/server/engine";
import { summaryInput, type SummaryInput } from "@/lib/compare/intelligence/summary";
import { isGoal, type CompareGoal } from "@/lib/compare/types";
import {
  RESEARCH_CATALOGUE_LIMIT,
  RESEARCH_COMPARE_MAX,
  RESEARCH_PER_NEED,
} from "../config";
import { projection } from "../recommend-candidates";
import type { ToolCitation } from "../types";
import { skillLevel, type ResearchKind } from "./kinds";

/*
  The catalogue half of deep research (phase DR, D231).

  choose: the Tool & Model engine's fit strategy over the question, twice as
          wide as a normal answer, then the top candidates through the Compare
          engine, which knows prices, plans, facts and benchmarks with their
          sources, and says what is NOT recorded.
  build:  the engine once per stack slot, so every phase of the roadmap has a
          recommended tool and an alternative from the catalogue.

  Every failure returns what it has. Research must not fail because one
  catalogue read did.
*/

export type BuildSlot = { need: string; picks: ToolCitation[] };

export type CatalogueResearch = {
  tools: ToolCitation[];
  slots: BuildSlot[];
  evidence: SummaryInput | null;
  /* "Codex: pricing" style gaps, from the Compare engine, with the tool's site. */
  missing: { name: string; dimension: string; domain: string | null }[];
  officialDomains: string[];
  compared: number;
};

const EMPTY: CatalogueResearch = { tools: [], slots: [], evidence: null, missing: [], officialDomains: [], compared: 0 };

async function fitSlugs(query: string, viewerId: string | null, limit: number, section: string): Promise<string[]> {
  const { index } = await getCatalogueIndex();
  const parsed = parseConstraints(query, index);
  const view = await getRecommendations(
    { surface: "ask", strategy: "fit", entityTypes: ["tool"], query, constraints: parsed.constraints, limit, section },
    viewerId,
  );
  if (!view.ok) return [];
  return view.result.items.map((i) => view.entities[i.key]?.slug).filter((s): s is string => Boolean(s));
}

function goalOf(question: string, index: Awaited<ReturnType<typeof getCatalogueIndex>>["index"]): CompareGoal | null {
  const usecase = parseConstraints(question, index).constraints.find((c) => c.kind === "usecase");
  const v = usecase ? String(usecase.value) : null;
  return isGoal(v) ? v : null;
}

async function compareEvidence(slugs: string[], goal: CompareGoal | null, domainById: (id: string) => string | null = () => null) {
  if (slugs.length < 2) return { evidence: null, missing: [] as CatalogueResearch["missing"] };
  const key = slugs.slice(0, RESEARCH_COMPARE_MAX).map((s) => `tool:${s}`).join(",");
  const data = await loadCompareData(key);
  const run = runCompareOn(data, { goal, weights: null, scenario: null });
  if (!run.result) return { evidence: null, missing: [] };
  const input = summaryInput(run.result);
  const nameOf = new Map(input.entities.map((e) => [e.id, e.name]));
  const missing = input.missing.flatMap((m) => m.entityIds.map((id) => ({ name: nameOf.get(id) ?? id, dimension: m.dimension, domain: domainById(id) })));
  return { evidence: input, missing };
}

export async function researchCatalogue(opts: {
  kind: ResearchKind;
  question: string;
  needs: string[];
  viewerId: string | null;
}): Promise<CatalogueResearch> {
  try {
    const { index } = await getCatalogueIndex();
    const domainOf = (slug: string) => index.bySlug.get(`tool:${slug}`)?.canonicalDomain ?? null;
    const domainById = (id: string) => index.entities.get(`tool:${id}`)?.canonicalDomain ?? null;

    if (opts.kind === "build") {
      /* The project in a few words, so "backend and database" is asked for
         THIS project and not in general. */
      const project = opts.question.replace(/\s+/g, " ").slice(0, 120);
      /* For someone who cannot code, a tool listed only for coding is not a
         step they can take. The catalogue has few no code builders, so
         without this a salon site got Cursor and Claude Code (live test
         2026-11-04); with it the slot is empty and the web research fills it. */
      const noCode = skillLevel(opts.question, null) === "no_code";
      const usable = (slug: string) => {
        if (!noCode) return true;
        const e = index.bySlug.get(`tool:${slug}`);
        if (!e) return true;
        const coding = (e.listedGoals ?? []).includes("coding");
        return !coding || e.tags.includes("no-code");
      };
      const perNeed = await Promise.all(
        opts.needs.map((need) =>
          fitSlugs(`${need} for ${project}`, opts.viewerId, RESEARCH_PER_NEED + 3, "research")
            .then((s) => s.filter(usable).slice(0, RESEARCH_PER_NEED))
            .catch(() => []),
        ),
      );
      const all = [...new Set(perNeed.flat())];
      const rows = await projection(all);
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      const slots = opts.needs.map((need, i) => ({
        need,
        picks: perNeed[i].map((s) => bySlug.get(s)).filter((t): t is ToolCitation => Boolean(t)),
      }));
      /* Compare the first pick of each slot, the stack the roadmap leads with. */
      const leads = [...new Set(slots.flatMap((s) => (s.picks[0] ? [s.picks[0].slug] : [])))];
      const { evidence, missing } = await compareEvidence(leads, null, domainById).catch(() => ({ evidence: null, missing: [] }));
      return {
        tools: rows,
        slots,
        evidence,
        missing,
        officialDomains: all.map(domainOf).filter((d): d is string => Boolean(d)),
        compared: evidence?.entities.length ?? 0,
      };
    }

    /* Tools the question names come first, so "Claude Code vs Codex vs
       Cursor" compares those three, then the engine's best fits. */
    const named = parseConstraints(opts.question, index).mentioned.filter((e) => e.ref.type === "tool").map((e) => e.slug);
    const fit = await fitSlugs(opts.question, opts.viewerId, RESEARCH_CATALOGUE_LIMIT, "research");
    const slugs = [...new Set([...named, ...fit])].slice(0, RESEARCH_CATALOGUE_LIMIT);
    const tools = await projection(slugs);
    const toCompare = named.length >= 2 ? named : slugs;
    const { evidence, missing } = await compareEvidence(toCompare, goalOf(opts.question, index), domainById).catch(() => ({ evidence: null, missing: [] }));
    return {
      tools,
      slots: [],
      evidence,
      missing,
      officialDomains: toCompare.slice(0, RESEARCH_COMPARE_MAX).map(domainOf).filter((d): d is string => Boolean(d)),
      compared: evidence?.entities.length ?? 0,
    };
  } catch (err) {
    console.error("[ai] research catalogue failed", err);
    return EMPTY;
  }
}
