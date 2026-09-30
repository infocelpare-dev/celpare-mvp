import { halfLifeDecay } from "../community/intelligence/math";
import { TMR_V1 } from "./config";
import type { CatalogueIndex } from "./catalogue";
import { keysOf } from "./entity";
import { cosine, type SparseVector } from "./similarity/lexical";
import { qualityOf } from "./strategies";
import type { EntityType, SourceId, ToolModelEntity } from "./types";
import { ownedSimilarity, sessionRelevance, userRelevance, type UserContext } from "./user";

/*
  Candidate sources (guide 17 section 7, D177).

  Each source is a small function that proposes entries and says how strongly.
  A strategy lists which sources it may use (config.ts STRATEGY_SOURCES); nothing
  else decides what enters the pool. Every source is bounded (PER_SOURCE), so the
  pool stays small however large the catalogue grows. Today each source scans the
  catalogue in memory, which is right for 77 entries; a source is the unit that
  moves to an index or a vector search when the catalogue outgrows that.

  Declared and null, the seams for later phases: embedding, two_tower,
  collaborative, generative (ml.ts).
*/

export type SourceHit = { key: string; source: SourceId; strength: number };

export type SourceContext = {
  index: CatalogueIndex;
  user: UserContext;
  seeds: ToolModelEntity[];
  types: EntityType[];
  queryVector: SparseVector | null;
  /* Use case keys the request or the session is about. */
  usecases: string[];
  now: number;
};

export interface CandidateSource {
  id: SourceId;
  retrieve(ctx: SourceContext): SourceHit[];
}

const PER_SOURCE = 40;

function top(ctx: SourceContext, id: SourceId, strength: (e: ToolModelEntity) => number, min = 0.01): SourceHit[] {
  const out: SourceHit[] = [];
  for (const e of ctx.index.list) {
    if (!ctx.types.includes(e.ref.type)) continue;
    if (ctx.seeds.some((s) => s.key === e.key)) continue;
    const s = strength(e);
    if (s >= min) out.push({ key: e.key, source: id, strength: s });
  }
  return out.sort((a, b) => b.strength - a.strength).slice(0, PER_SOURCE);
}

const shares = (a: ToolModelEntity, b: ToolModelEntity, set: "category" | "usecase" | "capability") => {
  const kb = new Set(keysOf(b, set) ?? []);
  return (keysOf(a, set) ?? []).filter((k) => kb.has(k)).length;
};

export const SOURCES: Record<SourceId, CandidateSource | null> = {
  lexical_similarity: {
    id: "lexical_similarity",
    retrieve: (ctx) =>
      top(ctx, "lexical_similarity", (e) => Math.max(0, ...ctx.seeds.filter((s) => s.ref.type === e.ref.type).map((s) => ctx.index.lexical.similarity(s, e).value)), 0.05),
  },
  structured_similarity: {
    id: "structured_similarity",
    retrieve: (ctx) =>
      top(ctx, "structured_similarity", (e) => Math.max(0, ...ctx.seeds.filter((s) => s.ref.type === e.ref.type).map((s) => ctx.index.sim(s.key, e.key).parts.structured ?? 0)), 0.1),
  },
  same_category: {
    id: "same_category",
    retrieve: (ctx) => top(ctx, "same_category", (e) => (ctx.seeds.some((s) => shares(s, e, "category") > 0) ? 0.5 : 0), 0.5),
  },
  same_use_case: {
    id: "same_use_case",
    retrieve: (ctx) =>
      top(
        ctx,
        "same_use_case",
        (e) => {
          const mine = keysOf(e, "usecase") ?? [];
          const fromSeeds = ctx.seeds.some((s) => shares(s, e, "usecase") > 0);
          const fromRequest = ctx.usecases.some((u) => mine.includes(u));
          return fromSeeds || fromRequest ? 0.5 : 0;
        },
        0.5,
      ),
  },
  same_capability: {
    id: "same_capability",
    retrieve: (ctx) => top(ctx, "same_capability", (e) => Math.min(1, 0.25 * Math.max(0, ...ctx.seeds.map((s) => shares(s, e, "capability")))), 0.25),
  },
  current_context: {
    id: "current_context",
    retrieve: (ctx) =>
      top(
        ctx,
        "current_context",
        (e) => Math.max(0, ...ctx.seeds.filter((s) => s.ref.type === e.ref.type).map((s) => ctx.index.sim(s.key, e.key).value), ctx.user.intent ? sessionRelevance(e, ctx.user, null, ctx.index) : 0),
        0.1,
      ),
  },
  user_history: {
    id: "user_history",
    retrieve: (ctx) => top(ctx, "user_history", (e) => ownedSimilarity(e, ctx.user, ctx.index), 0.15),
  },
  user_interests: {
    id: "user_interests",
    retrieve: (ctx) => (ctx.user.cold ? [] : top(ctx, "user_interests", (e) => userRelevance(e, ctx.user), 0.1)),
  },
  search_context: {
    id: "search_context",
    retrieve: (ctx) => {
      const q = ctx.queryVector;
      if (!q || q.size === 0) return [];
      return top(ctx, "search_context", (e) => {
        const v = ctx.index.lexical.vectorOf(e.key);
        return v ? cosine(q, v) : 0;
      }, 0.04);
    },
  },
  co_compared: {
    id: "co_compared",
    retrieve: (ctx) =>
      top(ctx, "co_compared", (e) => {
        let best = 0;
        for (const s of ctx.seeds) {
          const c = ctx.index.cooccurrence(s.key, e.key);
          if (c) best = Math.max(best, c.people / (c.people + TMR_V1.COOCCUR_K));
        }
        return best;
      }, 0.01),
  },
  popular: {
    id: "popular",
    /* Cold start only: a quality prior, never a part of similar or alternative. */
    retrieve: (ctx) =>
      top(ctx, "popular", (e) => {
        const s = e.signals;
        const activity = s ? Math.min(1, (s.views7d + 3 * s.saves7d + 2 * s.compareAdds7d) / 20) : 0;
        return 0.7 * qualityOf(e) + 0.3 * activity;
      }, 0.2),
  },
  new: {
    id: "new",
    retrieve: (ctx) =>
      top(ctx, "new", (e) => {
        const days = (ctx.now - e.createdAt) / 86_400_000;
        return days >= 0 && days <= TMR_V1.NEW_WINDOW_DAYS[e.ref.type] ? halfLifeDecay(days, TMR_V1.NEW_WINDOW_DAYS[e.ref.type] / 2) : 0;
      }, 0.05),
  },
  trending: {
    id: "trending",
    retrieve: (ctx) =>
      top(ctx, "trending", (e) => {
        const s = e.signals;
        if (!s || s.views7d < 3) return 0;
        return Math.min(1, (s.views7d + 3 * s.saves7d + 2 * s.compareAdds7d) / 30);
      }, 0.1),
  },
  rising: {
    id: "rising",
    retrieve: (ctx) =>
      top(ctx, "rising", (e) => {
        const s = e.signals;
        if (!s || s.views7d < 2) return 0;
        const accel = (s.views7d + 2) / (s.viewsPrev7d + 2);
        return accel >= 1.3 ? Math.min(1, (accel - 1) / 2) : 0;
      }, 0.1),
  },
  exploration: {
    id: "exploration",
    /* Good entries far from what the person already favours. */
    retrieve: (ctx) =>
      ctx.user.cold
        ? []
        : top(ctx, "exploration", (e) => (userRelevance(e, ctx.user) < 0.1 && qualityOf(e) >= TMR_V1.EXPLORATION_MIN_QUALITY ? qualityOf(e) : 0), 0.01),
  },
  cross_type: {
    id: "cross_type",
    retrieve: (ctx) =>
      top(ctx, "cross_type", (e) => {
        for (const s of ctx.seeds) if (s.ref.type !== e.ref.type && ctx.index.relation(s, e).kind === "related") return 1;
        return 0;
      }, 0.5),
  },
  constraint: {
    id: "constraint",
    /* Everything of the requested types; the hard constraint gate and the
       relevance floor decide. Bounded by the catalogue, 77 today. */
    retrieve: (ctx) => top(ctx, "constraint", () => 0.1, 0.1),
  },
};

export function retrieve(ctx: SourceContext, allowed: SourceId[]): Map<string, SourceHit[]> {
  const pool = new Map<string, SourceHit[]>();
  for (const id of allowed) {
    const source = SOURCES[id];
    if (!source) continue;
    for (const hit of source.retrieve(ctx)) {
      const list = pool.get(hit.key) ?? [];
      list.push(hit);
      pool.set(hit.key, list);
    }
  }
  return pool;
}
