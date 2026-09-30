import type { CatalogueIndex } from "./catalogue";
import { intraListDiversity } from "./diversity";
import { keysOf } from "./entity";

/*
  Offline evaluation (guide 17 section 16).

  Ranking metrics against a hand labelled judgement set, plus diversity and
  coverage. Clicks are never the success measure here: a click that wasted
  somebody's time is not a success, and there are not enough of them yet to mean
  anything. The live rates (open, save, compare add, dismiss, not interested) are
  read from recommendation_events by the admin analytics RPC.
*/

/* Relevance grade per key: 2 highly relevant, 1 relevant. Absent is 0. */
export type Judgement = { seed: string; relevant: Record<string, 1 | 2> };

export function precisionAtK(ranked: string[], rel: Record<string, number>, k: number): number {
  const top = ranked.slice(0, k);
  if (top.length === 0) return 0;
  return top.filter((x) => (rel[x] ?? 0) > 0).length / k;
}

export function recallAtK(ranked: string[], rel: Record<string, number>, k: number): number {
  const total = Object.values(rel).filter((g) => g > 0).length;
  if (total === 0) return 0;
  return ranked.slice(0, k).filter((x) => (rel[x] ?? 0) > 0).length / total;
}

export function ndcgAtK(ranked: string[], rel: Record<string, number>, k: number): number {
  const dcg = ranked.slice(0, k).reduce((acc, x, i) => acc + ((2 ** (rel[x] ?? 0) - 1) / Math.log2(i + 2)), 0);
  const ideal = Object.values(rel)
    .sort((a, b) => b - a)
    .slice(0, k)
    .reduce((acc, g, i) => acc + ((2 ** g - 1) / Math.log2(i + 2)), 0);
  return ideal > 0 ? dcg / ideal : 0;
}

export function reciprocalRank(ranked: string[], rel: Record<string, number>): number {
  const i = ranked.findIndex((x) => (rel[x] ?? 0) > 0);
  return i < 0 ? 0 : 1 / (i + 1);
}

/* Share of the eligible catalogue that appears in at least one list. */
export function coverage(lists: string[][], eligible: number): number {
  if (eligible <= 0) return 0;
  return new Set(lists.flat()).size / eligible;
}

/* Distinct values of an attribute over a list, divided by the list length. */
export function attributeDiversity(keys: string[], index: CatalogueIndex, attr: "category" | "provider" | "capability" | "type"): number {
  if (keys.length === 0) return 0;
  const seen = new Set<string>();
  for (const k of keys) {
    const e = index.entities.get(k);
    if (!e) continue;
    if (attr === "type") seen.add(e.ref.type);
    else if (attr === "provider") seen.add(e.provider ?? e.developerId ?? e.key);
    else seen.add((keysOf(e, attr) ?? [])[0] ?? "none");
  }
  return seen.size / keys.length;
}

export type EvaluationReport = {
  seeds: number;
  ndcg5: number;
  recall10: number;
  precision5: number;
  mrr: number;
  coverage: number;
  diversity: number;
};

/* Mean metrics over a judgement set, given a ranker from seed key to ranked keys. */
export function evaluate(judgements: Judgement[], rank: (seed: string) => string[], index: CatalogueIndex, eligible: number): EvaluationReport {
  const lists: string[][] = [];
  let ndcg = 0;
  let recall = 0;
  let precision = 0;
  let mrr = 0;
  let diversity = 0;
  for (const j of judgements) {
    const ranked = rank(j.seed);
    lists.push(ranked);
    ndcg += ndcgAtK(ranked, j.relevant, 5);
    recall += recallAtK(ranked, j.relevant, 10);
    precision += precisionAtK(ranked, j.relevant, 5);
    mrr += reciprocalRank(ranked, j.relevant);
    diversity += intraListDiversity(ranked.map((k) => index.entities.get(k)).filter((e) => e !== undefined), index);
  }
  const n = Math.max(1, judgements.length);
  return {
    seeds: judgements.length,
    ndcg5: ndcg / n,
    recall10: recall / n,
    precision5: precision / n,
    mrr: mrr / n,
    coverage: coverage(lists, eligible),
    diversity: diversity / n,
  };
}
