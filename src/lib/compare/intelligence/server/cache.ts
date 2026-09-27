import "server-only";
import { sharedRedis } from "@/lib/ai/ratelimit";
import { COMPARE_CACHE } from "../config";
import { memoryCache, type CompareCache } from "../cache";

/*
  The server side of the Compare cache (D170).

  The in process cache is always on: comparison data is the public record, the
  same for everybody, and a 60 second window cannot outlive a correction by much.
  Redis is behind COMPARE_CACHE.redis, off until measured (4BJ.27). Either way
  Postgres is the source of truth, and a cache failure only ever means a read.
*/

const memory = memoryCache();

function redisCache(): CompareCache | null {
  const r = sharedRedis();
  if (!r) return null;
  const GEN = "compare:v1:gen";
  return {
    name: "redis",
    async get<T>(key: string) {
      return ((await r.get<T>(key)) ?? null) as T | null;
    },
    async set<T>(key: string, value: T, ttlSeconds: number) {
      await r.set(key, value, { ex: ttlSeconds });
    },
    async generation() {
      return (await r.get<number>(GEN)) ?? 0;
    },
    async bumpGeneration() {
      return r.incr(GEN);
    },
  };
}

export function compareCaches(): { memory: CompareCache; redis: CompareCache | null } {
  return { memory, redis: COMPARE_CACHE.redis ? redisCache() : null };
}

/*
  Call after any server write to compare data (facts, plans, evaluations,
  performance, prices). Nothing writes those from the app yet; the 4AT.21 admin
  editor will. Manual imports should call it too, or wait out the TTL.
*/
export async function invalidateCompareCache(): Promise<void> {
  await memory.bumpGeneration();
  try {
    if (COMPARE_CACHE.redis) await redisCache()?.bumpGeneration();
  } catch (err) {
    console.error("[compare] cache generation bump failed", err);
  }
}
