import "server-only";
import { memoryCache, type CompareCache } from "@/lib/compare/intelligence/cache";
import { buildIndex, type CatalogueIndex } from "../catalogue";
import { TMR_V1 } from "../config";
import { loadCatalogue } from "./pool";

/*
  The catalogue index cache (guide 17 section 14).

  The index is the public record, the same for everybody, so one copy per server
  process serves every request for INDEX_TTL_SECONDS. The Compare cache's memory
  implementation and its generation contract are reused, not copied (D170).
  Postgres stays the only source of truth: a miss rebuilds from it, and a write
  to a tool or model calls invalidateToolModelIndex() so the next request does.

  Redis is off (TMR_V1.REDIS). The index is about 77 entries and rebuilds in
  milliseconds after one read wave; D170 measured an Upstash round trip from this
  machine at 1.5 to 3 s, which costs more than the rebuild saves.

  Concurrent misses share ONE in-flight build rather than each starting their own.
*/

const cache: CompareCache = memoryCache(() => Date.now(), 4);
let inflight: Promise<IndexLoad> | null = null;

export type IndexLoad = { index: CatalogueIndex; failed: string[]; loadMs: number; buildMs: number; cached: boolean };

const keyFor = (gen: number) => `recommend:v1:index:g${gen}`;

export async function getCatalogueIndex(): Promise<IndexLoad> {
  const gen = await cache.generation();
  const hit = await cache.get<IndexLoad>(keyFor(gen));
  if (hit) return { ...hit, cached: true };
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const load = await loadCatalogue();
      const t = Date.now();
      const index = buildIndex({ entities: load.inputs, cooccurrence: load.cooccurrence, generation: `g${gen}:${t}`, now: t });
      const value: IndexLoad = { index, failed: load.failed, loadMs: load.ms, buildMs: Date.now() - t, cached: false };
      /* A load with a failed read is not cached: the next request retries. */
      if (load.failed.length === 0 && load.inputs.length > 0) await cache.set(keyFor(gen), value, TMR_V1.INDEX_TTL_SECONDS);
      return value;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/* Call after any write to tools, models, compare_facts, tool_plans or
   model_evaluations. Without it a change shows within INDEX_TTL_SECONDS. */
export async function invalidateToolModelIndex(): Promise<void> {
  await cache.bumpGeneration();
}
