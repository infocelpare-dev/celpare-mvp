import { COMPARE_V1 } from "./config";
import { numeric, rowOf } from "./matrix";
import type { ComparisonMatrix, ParetoResult } from "./types";

/*
  Tradeoffs (guide 16 section 15). An entity is dominated when another is at least
  as good on both axes and better on one, in each axis's own direction. The
  non dominated set is "options no other option beats on both axes at once",
  never "the best". Entities missing either value are left off and listed.
*/

export function paretoFront(matrix: ComparisonMatrix, xId: string, yId: string): ParetoResult | null {
  const x = rowOf(matrix, xId);
  const y = rowOf(matrix, yId);
  if (!x || !y || x.dim.direction === "none" || y.dim.direction === "none") return null;

  const points: { entityId: string; x: number; y: number }[] = [];
  const missing: string[] = [];
  matrix.entities.forEach((e, i) => {
    const vx = x.values[i];
    const vy = y.values[i];
    if (numeric(vx) && numeric(vy)) points.push({ entityId: e.id, x: vx.value, y: vy.value });
    else missing.push(e.id);
  });
  if (points.length < COMPARE_V1.paretoMinPoints) return null;

  const better = (a: number, b: number, dir: "higher" | "lower") => (dir === "higher" ? a > b : a < b);
  const atLeast = (a: number, b: number, dir: "higher" | "lower") => (dir === "higher" ? a >= b : a <= b);
  const dx = x.dim.direction as "higher" | "lower";
  const dy = y.dim.direction as "higher" | "lower";

  return {
    x: xId,
    y: yId,
    points: points.map((p) => ({
      ...p,
      dominated: points.some(
        (q) => q !== p && atLeast(q.x, p.x, dx) && atLeast(q.y, p.y, dy) && (better(q.x, p.x, dx) || better(q.y, p.y, dy)),
      ),
    })),
    missing,
  };
}

/*
  Which pair to draw. A price against a benchmark first (the tradeoff people ask
  about most), then a price against context. The first pair with enough points
  wins; no pair, no chart.
*/
export function defaultTradeoff(matrix: ComparisonMatrix): ParetoResult | null {
  const benches = matrix.dimensions
    .map((d, i) => ({ d, n: matrix.coverage[i] }))
    .filter((x) => x.d.kind === "benchmark")
    .sort((a, b) => b.n - a.n)
    .map((x) => x.d.id);
  const candidates: [string, string][] = [
    ...benches.map((b): [string, string] => ["price_output", b]),
    ["price_input", "context_window"],
    ["plan:individual", "tool.integrations_count"],
  ];
  for (const [xId, yId] of candidates) {
    const r = paretoFront(matrix, xId, yId);
    if (r) return r;
  }
  return null;
}
