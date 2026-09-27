/*
  The Compare cache contract (guide 16 section 22, D170).

  Postgres is the source of truth; a cache only ever holds a copy for a short,
  class specific time. Every key carries a generation number, so bumping the
  generation invalidates everything at once without listing keys. The memory
  implementation lives here, pure, so the tests can drive it with their own clock;
  the Redis one is in server/cache.ts.
*/

export interface CompareCache {
  name: "memory" | "redis";
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  generation(): Promise<number>;
  bumpGeneration(): Promise<number>;
}

export function cacheKey(kind: "set" | "entity" | "pricing" | "benchmark" | "perf", id: string, gen: number): string {
  return `compare:v1:${kind}:${id}:g${gen}`;
}

/* A short, stable hash of a set key, so a six item key stays a short Redis key. */
export function hashKey(s: string): string {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function memoryCache(clock: () => number = () => Date.now(), maxEntries = 500): CompareCache {
  const store = new Map<string, { at: number; ttl: number; value: unknown }>();
  let gen = 0;
  return {
    name: "memory",
    async get<T>(key: string) {
      const hit = store.get(key);
      if (!hit) return null;
      if (clock() - hit.at > hit.ttl * 1000) {
        store.delete(key);
        return null;
      }
      return hit.value as T;
    },
    async set<T>(key: string, value: T, ttlSeconds: number) {
      if (store.size >= maxEntries) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      store.set(key, { at: clock(), ttl: ttlSeconds, value });
    },
    async generation() {
      return gen;
    },
    async bumpGeneration() {
      gen += 1;
      return gen;
    },
  };
}
