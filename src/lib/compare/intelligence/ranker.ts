import type { ComparisonMatrix, DimensionDifference, DimensionStats, ResolvedGoal } from "./types";

/*
  The ranker seam (guide 16 section 21).

  In compare_v1 a candidate is a DIMENSION, never an entity. The ranker decides
  what is drawn and summarised first; it never decides which product is better.
  A learned, embedding or neural ranker implements the same interface later and
  nothing else in Compare changes.

  Synchronous on purpose: the pipeline is pure and synchronous so it runs the
  same in a test, on the server and in a worker. A ranker that needs I/O prepares
  its inputs in the server engine and is handed them here.
*/

export type ComparisonCandidate = { dimension: string };

export type ComparisonContext = {
  matrix: ComparisonMatrix;
  stats: DimensionStats[];
  pairwise: DimensionDifference[];
  goal: ResolvedGoal | null;
};

export interface ComparisonRanker {
  id: string;
  rank(candidates: ComparisonCandidate[], context: ComparisonContext): ComparisonCandidate[];
}

/*
  Rule based: goal importance first, then whether the entities actually differ on
  it, then how many have a value, then registry order. Stable, so equal
  candidates keep the order the strategy gave them.
*/
export const RuleBasedComparisonRanker: ComparisonRanker = {
  id: "rules_v1",
  rank(candidates, { matrix, stats, pairwise, goal }) {
    const importance = new Map((goal?.requirements ?? []).map((r) => [r.dimension, r.importance]));
    const differs = new Set(pairwise.filter((p) => p.delta !== 0).map((p) => p.dimension));
    const led = new Set(stats.filter((s) => s.leader).map((s) => s.dimension));
    const coverage = new Map(matrix.dimensions.map((d, i) => [d.id, matrix.coverage[i] / Math.max(1, matrix.entities.length)]));
    const at = new Map(candidates.map((c, i) => [c.dimension, i]));
    const key = (c: ComparisonCandidate) =>
      (importance.get(c.dimension) ?? 0) * 100 + (led.has(c.dimension) ? 20 : 0) + (differs.has(c.dimension) ? 10 : 0) + (coverage.get(c.dimension) ?? 0) * 5;
    return candidates.slice().sort((a, b) => key(b) - key(a) || (at.get(a.dimension) ?? 0) - (at.get(b.dimension) ?? 0));
  },
};
