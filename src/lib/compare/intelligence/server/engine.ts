import "server-only";
import { cache } from "react";
import { loadComparison, loadPerformance } from "@/lib/compare/queries";
import { refKey } from "@/lib/compare/params";
import type { CompareGoal, CompareRef, Comparison } from "@/lib/compare/types";
import { cacheKey, hashKey, type CompareCache } from "../cache";
import { COMPARE_CACHE } from "../config";
import { runCompare } from "../pipeline";
import { buildRequest } from "../request";
import type { CompareInput, CompareResult, PerformanceRow, PreferenceWeights, RequestError, UsageScenario } from "../types";
import { compareCaches } from "./cache";

/*
  compare_v1 on the server (guide 16 sections 3 and 22).

  Two batched read waves (loadComparison) plus one performance read, never a query
  per entity or per dimension. The loaded data is the public record, identical for
  every viewer (D111), so it is cached by the SET of refs: A,B and B,A share an
  entry. Only the data is cached; the pipeline is pure and cheap, and runs per
  request with the viewer's goal, weights and scenario.

  React cache() makes this one load per request however many components ask.
*/

export type CompareData = {
  comparison: Comparison;
  performance: { rows: PerformanceRow[]; ok: boolean };
  cache: "memory" | "redis" | "miss";
  ms: number;
};

async function readThrough(c: CompareCache | null, key: string): Promise<{ comparison: Comparison; performance: { rows: PerformanceRow[]; ok: boolean } } | null> {
  if (!c) return null;
  try {
    return await c.get(key);
  } catch (err) {
    console.error(`[compare] ${c.name} cache read failed`, err);
    return null;
  }
}

async function loadFresh(refs: CompareRef[]) {
  const comparison = await loadComparison(refs);
  const modelIds = comparison.slots.flatMap((s) => (s.status === "ok" && s.item.type === "model" ? [s.item.id] : []));
  const performance = await loadPerformance(modelIds);
  return { comparison, performance };
}

/* A result with a failed read is never cached: the next request should retry. */
function cacheable(d: { comparison: Comparison; performance: { ok: boolean } }): boolean {
  const h = d.comparison.health;
  return h.facts && h.plans && h.evaluations && h.reviews && d.performance.ok && d.comparison.slots.every((s) => s.status === "ok");
}

export const loadCompareData = cache(async (refsKey: string): Promise<CompareData> => {
  const started = Date.now();
  const refs: CompareRef[] = refsKey
    ? refsKey.split(",").map((k) => {
        const [type, slug] = k.split(":");
        return { type: type as CompareRef["type"], slug };
      })
    : [];
  if (refs.length === 0) {
    return { ...(await loadFresh([])), cache: "miss", ms: 0 };
  }

  const { memory, redis } = compareCaches();
  const setId = hashKey([...refs].map(refKey).sort().join(","));
  const memKey = cacheKey("set", setId, await memory.generation());

  const mem = await readThrough(memory, memKey);
  if (mem) return { ...mem, comparison: { ...mem.comparison, slots: reorder(mem.comparison, refs) }, cache: "memory", ms: Date.now() - started };

  let redisKey: string | null = null;
  if (redis) {
    try {
      redisKey = cacheKey("set", setId, await redis.generation());
      const hit = await readThrough(redis, redisKey);
      if (hit) {
        await memory.set(memKey, hit, COMPARE_CACHE.memoryTtlSeconds);
        return { ...hit, comparison: { ...hit.comparison, slots: reorder(hit.comparison, refs) }, cache: "redis", ms: Date.now() - started };
      }
    } catch (err) {
      console.error("[compare] redis cache failed, reading Postgres", err);
    }
  }

  const fresh = await loadFresh(refs);
  if (cacheable(fresh)) {
    await memory.set(memKey, fresh, COMPARE_CACHE.memoryTtlSeconds);
    if (redis && redisKey) {
      redis.set(redisKey, fresh, COMPARE_CACHE.setTtlSeconds).catch((err) => console.error("[compare] redis cache write failed", err));
    }
  }
  return { ...fresh, cache: "miss", ms: Date.now() - started };
});

/* A cached entry was stored in whichever order first asked for it. Slots are
   always returned in THIS request's display order. */
function reorder(c: Comparison, refs: CompareRef[]): Comparison["slots"] {
  const by = new Map(c.slots.map((s) => [refKey(s.ref), s]));
  return refs.map((r) => by.get(refKey(r)) ?? { status: "unavailable" as const, ref: r, reason: "failed" as const });
}

export type CompareRun = {
  result: CompareResult | null;
  error: RequestError | null;
  timings: { load: number; pipeline: number };
  cache: CompareData["cache"];
};

export function runCompareOn(
  data: CompareData,
  opts: { goal: CompareGoal | null; weights: PreferenceWeights | null; scenario: UsageScenario | null; allowMixed?: boolean },
): CompareRun {
  const items = data.comparison.slots.flatMap((s) => (s.status === "ok" ? [s.item] : []));
  const req = buildRequest({
    entities: items.map((i) => ({ type: i.type, id: i.id })),
    goal: opts.goal,
    weights: opts.weights,
    scenario: opts.scenario,
    allowMixed: opts.allowMixed,
  });
  if (!req.ok) return { result: null, error: req.error, timings: { load: data.ms, pipeline: 0 }, cache: data.cache };

  const input: CompareInput = {
    items,
    attributes: data.comparison.attributes,
    benchmarks: data.comparison.benchmarks,
    performance: data.performance.rows,
    health: { ...data.comparison.health, performance: data.performance.ok },
    now: Date.now(),
  };
  const t = Date.now();
  const result = runCompare(req.request, input);
  return { result, error: null, timings: { load: data.ms, pipeline: Date.now() - t }, cache: data.cache };
}
