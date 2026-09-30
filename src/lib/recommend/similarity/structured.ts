import { TMR_V1 } from "../config";
import { keysOf } from "../entity";
import { isKnown, type AttrSet, type ModelPrice, type ToolModelEntity, type ToolPrice } from "../types";
import type { SimilarityProvider, SimilarityReading } from "./types";

/*
  Structured similarity: recorded attributes, compared one set at a time (D175).

  THE RULE THAT MATTERS: an attribute that is unknown on either side is left out
  of the average, never scored as a mismatch. A tool with no recorded platforms is
  not "incompatible" with one that runs on macOS; we simply do not know, and the
  comparison rests on what we do know. `coverage` says how much that was.
*/

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const sa = new Set(a);
  let inter = 0;
  for (const x of new Set(b)) if (sa.has(x)) inter++;
  return inter / (sa.size + new Set(b).size - inter);
}

/* Proximity on a log scale: 1 when equal, 0 at `decades` orders of magnitude apart. */
export function logProximity(a: number, b: number, decades = 2): number {
  if (!(a > 0) || !(b > 0)) return 0;
  const d = Math.abs(Math.log10(a) - Math.log10(b));
  return Math.max(0, 1 - d / decades);
}

const TIER_ORDER = { free: 0, freemium: 1, low: 2, mid: 3, high: 4 } as const;

export function priceProximity(a: ToolModelEntity, b: ToolModelEntity): number | null {
  if (!isKnown(a.price) || !isKnown(b.price)) return null;
  const pa = a.price.value;
  const pb = b.price.value;
  if (pa.class !== pb.class) return null;
  if (pa.class === "tool") {
    const d = Math.abs(TIER_ORDER[pa.tier] - TIER_ORDER[(pb as ToolPrice).tier]);
    return 1 - d / 4;
  }
  return logProximity(pa.blendedPerM, (pb as ModelPrice).blendedPerM, 2);
}

/* One attribute set, or null when either side does not know it or both are empty. */
function setSimilarity(a: ToolModelEntity, b: ToolModelEntity, set: AttrSet): number | null {
  const ka = keysOf(a, set);
  const kb = keysOf(b, set);
  if (ka === null || kb === null) return null;
  if (ka.length === 0 || kb.length === 0) return null;
  return jaccard(ka, kb);
}

export const structuredSimilarity: SimilarityProvider = {
  id: "structured_v1",
  similarity(a, b): SimilarityReading {
    /* Tools and models are never compared on one structured scale; cross-type
       links are relations (relations.ts), not similarity. */
    if (a.ref.type !== b.ref.type) return { value: 0, parts: {}, coverage: 0 };
    const weights = TMR_V1.STRUCTURED_WEIGHT[a.ref.type] as Record<string, number>;
    const parts: Record<string, number> = {};
    let sum = 0;
    let wsum = 0;
    let possible = 0;
    for (const [dim, w] of Object.entries(weights)) {
      possible += w;
      let s: number | null = null;
      if (dim === "price") s = priceProximity(a, b);
      else if (dim === "context") s = isKnown(a.context) && isKnown(b.context) ? logProximity(a.context.value, b.context.value, 1.5) : null;
      else if (dim === "openWeights") s = isKnown(a.openWeights) && isKnown(b.openWeights) ? (a.openWeights.value === b.openWeights.value ? 1 : 0) : null;
      else s = setSimilarity(a, b, dim as AttrSet);
      if (s === null) continue;
      parts[dim] = s;
      sum += w * s;
      wsum += w;
    }
    if (wsum === 0) return { value: 0, parts, coverage: 0 };
    return { value: sum / wsum, parts, coverage: possible > 0 ? wsum / possible : 0 };
  },
};
