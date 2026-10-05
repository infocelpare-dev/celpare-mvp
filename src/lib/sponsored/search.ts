import "server-only";
import { NO_AFFINITY, WEIGHTS, type Affinity } from "@/lib/search/ranking";
import type { ParsedQuery, Scored, ToolCandidate } from "@/lib/search/types";
import { runSearch } from "@/lib/search/engine";
import { serveSponsored, viewerKey, type Serve } from "./server";
import type { SponsoredCandidate } from "./rank";

/*
  Sponsored slots for one Search results page (D204, D205).

  Reads the FINISHED organic tool ranking and returns a separate list. Nothing
  here is fed back: a sponsored tool keeps its organic place too, the way an
  advertiser's site still appears in Google's organic results.
*/

/*
  How well a tool fits the query beyond its words, 0..1. Three quarters is
  what retrieval saw (the query named its category, a tag, a feature, or the
  exact phrase); a quarter is the viewer's own saved and liked categories, and
  a signed out viewer is neutral there, so it never decides alone.
*/
export function searchFit(t: ToolCandidate, affinity: Affinity): number {
  const structural = [t.match.category, t.match.tag, t.match.feature, t.match.phrase].filter(Boolean).length / 4;
  let personal = 0.5;
  if (affinity.categories.size > 0) {
    const max = Math.max(...affinity.categories.values(), 1);
    personal = t.categories.reduce((m, c) => Math.max(m, (affinity.categories.get(c.toLowerCase()) ?? 0) / max), 0);
  }
  return 0.75 * structural + 0.25 * personal;
}

export type SearchSponsored = {
  items: Scored<ToolCandidate>[];
  requestId: string | null;
  serve: Serve | null;
};

export async function sponsoredForSearch(input: {
  tools: Scored<ToolCandidate>[];
  affinity: Affinity;
  parsed: ParsedQuery;
  viewerId: string | null;
  record: boolean;
}): Promise<SearchSponsored> {
  try {
    const candidates: SponsoredCandidate[] = input.tools.map((s) => ({
      toolId: s.candidate.id,
      relevance: s.score.relevance / WEIGHTS.RELEVANCE,
      fit: searchFit(s.candidate, input.affinity),
    }));
    const serve = await serveSponsored({
      surface: "search",
      query: input.parsed.normalized,
      candidates,
      viewer: input.record ? await viewerKey(input.viewerId) : null,
      userId: input.viewerId,
      record: input.record,
    });
    const byId = new Map(input.tools.map((s) => [s.candidate.id, s]));
    const items = serve.picks.flatMap((p) => {
      const s = byId.get(p.toolId);
      return s ? [s] : [];
    });
    return { items, requestId: serve.requestId, serve };
  } catch (err) {
    console.error("[sponsored] search failed", err);
    return { items: [], requestId: null, serve: null };
  }
}

/*
  Ask's sponsored candidates, on Search's relevance scale (D205).

  Ask's own retrieval returns an ORDER, not a measure: its top result is "the
  best of what matched", however weakly. Measured 2026-10-05: an accounting
  question put Claude first, and an order based score let it through. So the
  question is run through the organic Search tool ranking (recording nothing)
  and every sponsored tool must clear the same gate it clears in Search.

  `allowed` is what Ask's retrieval found and its constraints did not rule out,
  with Ask's fit. Every other tool the search ranked stays in the list so the
  best match, and the share of best rule, are measured against the whole
  catalogue and not only against the sponsors.
*/
export async function askSponsoredCandidates(
  question: string,
  allowed: { toolId: string; fit: number }[],
  sponsoredIds: ReadonlySet<string>,
): Promise<SponsoredCandidate[]> {
  if (allowed.length === 0) return [];
  try {
    const results = await runSearch({ query: question, tab: "tools", signedIn: false, viewerId: null, record: false });
    const fitOf = new Map(allowed.map((a) => [a.toolId, a.fit]));
    return results.tools.flatMap((s) => {
      const id = s.candidate.id;
      /* A sponsor Ask did not retrieve, or its constraints ruled out, is not
         a candidate at all. */
      if (sponsoredIds.has(id) && !fitOf.has(id)) return [];
      return [{ toolId: id, relevance: s.score.relevance / WEIGHTS.RELEVANCE, fit: fitOf.get(id) ?? searchFit(s.candidate, NO_AFFINITY) }];
    });
  } catch (err) {
    console.error("[sponsored] ask relevance failed", err);
    return [];
  }
}
