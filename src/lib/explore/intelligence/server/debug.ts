import "server-only";
import { whyNot } from "../pipeline";
import type { ExploreSectionId } from "../types";
import type { ExploreResult } from "./engine";

/*
  The admin debug view of explore_v1 (brief section 37): why an item appeared,
  and why one did not. Built on the server only when the page has confirmed an
  admin asked (?debug=1); for anybody else it is never computed or sent.
  Numbers are rounded; this is for reading, not for a second ranker.
*/

const r2 = (n: number) => Math.round(n * 100) / 100;
const round = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)]));

export type ExploreDebugView = {
  algorithm: string;
  variant: string;
  timings: Record<string, number>;
  failed: string[];
  profile: { cold: boolean; evidence: number; long: string[]; session: string[]; seeds: string[] };
  pool: Record<string, number>;
  sections: {
    id: ExploreSectionId;
    note: string | null;
    drops: Record<string, number>;
    items: {
      position: number;
      key: string;
      title: string;
      band: string;
      source: string | null;
      sources: string[];
      reason: string | null;
      exploration: boolean;
      value: number;
      final: number;
      parts: Record<string, number>;
      features: Record<string, number>;
    }[];
  }[];
  why: { key: string; shown: { section: string; position: number }[]; notShown: { section: string; reason: string; detail: string | null }[] } | null;
};

function top(map: Map<string, number>, n: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} ${r2(v)}`);
}

export function buildExploreDebug(result: ExploreResult, why: string | null): ExploreDebugView {
  const pool: Record<string, number> = {};
  for (const c of result.pool.candidates) pool[c.entityType] = (pool[c.entityType] ?? 0) + 1;
  const titles = new Map(result.pool.candidates.map((c) => [c.key, c.title]));

  const sections: ExploreDebugView["sections"] = [];
  for (const id of result.order) {
    const r = result.rankings.get(id);
    if (!r) continue;
    const drops: Record<string, number> = {};
    for (const d of r.dropped) if (d.reason !== "wrong_type") drops[d.reason] = (drops[d.reason] ?? 0) + 1;
    sections.push({
      id,
      note: r.note,
      drops,
      items: r.items.map((s, position) => ({
        position,
        key: s.candidate.key,
        title: s.candidate.title.slice(0, 60),
        band: s.band,
        source: s.primarySource,
        sources: s.candidate.sources,
        reason: s.reason?.code ?? null,
        exploration: s.exploration,
        value: r2(s.value),
        final: r2(s.final),
        parts: round(s.parts),
        features: round(s.features as unknown as Record<string, number>),
      })),
    });
  }

  let whyView: ExploreDebugView["why"] = null;
  if (why) {
    const shown: { section: string; position: number }[] = [];
    const notShown: { section: string; reason: string; detail: string | null }[] = [];
    for (const [id, r] of result.rankings) {
      const at = r.items.findIndex((s) => s.candidate.key === why);
      if (at >= 0) shown.push({ section: id, position: at });
      else {
        const d = whyNot(r, why);
        if (d && d.reason !== "wrong_type") notShown.push({ section: id, reason: d.reason, detail: d.detail });
      }
    }
    whyView = { key: why, shown, notShown };
    if (!titles.has(why)) notShown.unshift({ section: "pool", reason: "not_retrieved", detail: "no candidate source returned it" });
  }

  const p = result.profile;
  return {
    algorithm: result.algorithm,
    variant: result.assignment.variant,
    timings: result.timings,
    failed: [...result.pool.failed],
    profile: {
      cold: p.cold,
      evidence: p.evidence,
      long: top(p.long, 8),
      session: top(p.session, 6),
      seeds: p.sessionSeeds.map((s) => titles.get(s.key) ?? s.key),
    },
    pool,
    sections,
    why: whyView,
  };
}
