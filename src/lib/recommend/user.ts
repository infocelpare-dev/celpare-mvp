import { halfLifeDecay, saturate } from "../community/intelligence/math";
import { TMR_V1 } from "./config";
import type { CatalogueIndex } from "./catalogue";
import { interestKeys } from "./entity";
import { cosine, type SparseVector } from "./similarity/lexical";
import type { EntityType, ToolModelEntity } from "./types";

/*
  The person, as far as tools and models go (guide 17 section 8, D178).

  Built from signals Celpare already records, read through one own-rows RPC
  (my_tool_model_activity) plus the existing interest and affinity loaders. There
  is no new tracking. Four horizons are kept apart:

    long       what they keep coming back to (months, slow decay)
    recent     the last week
    session    the last half hour: what they appear to be researching now
    negative   not interested, dismissals, dislikes, ignored impressions

  Each positive horizon is normalised by its own maximum, so a heavy user and a
  light one are compared by the shape of their interests, not their volume.
*/

export type ActivityRow = {
  surface: string;
  event: string;
  entityType: EntityType | null;
  entityId: string | null;
  query: string | null;
  at: number;
};

/* The ordered interaction sequence a future sequence model consumes (guide 17
   section 15). v1 reads it only for session intent. */
export type UserSequence = { surface: string; event: string; ref: string | null; query: string | null; at: number }[];

export type UserContext = {
  userId: string | null;
  cold: boolean;
  evidence: number;
  long: Map<string, number>;
  recent: Map<string, number>;
  session: Map<string, number>;
  negative: Map<string, number>;
  /* Items the person owns (saved, collected) and has compared. */
  owned: Set<string>;
  compared: Set<string>;
  opened: Map<string, number>;
  served: Map<string, { count: number; last: number; clicked: boolean }>;
  dismissed: Map<string, number>;
  /* Search queries in the session and the week, newest first. */
  sessionQueries: string[];
  recentQueries: string[];
  /* The strongest session key that describes a job: a use case or a category. */
  intent: string | null;
  sequence: UserSequence;
  /* Per entry: how many people this person follows saved it. A count, never who
     (D155). Per viewer, so it lives here and never on the shared catalogue. */
  networkSavers: Map<string, number>;
};

export function emptyUserContext(userId: string | null = null): UserContext {
  return {
    userId,
    cold: true,
    evidence: 0,
    long: new Map(),
    recent: new Map(),
    session: new Map(),
    negative: new Map(),
    owned: new Set(),
    compared: new Set(),
    opened: new Map(),
    served: new Map(),
    dismissed: new Map(),
    sessionQueries: [],
    recentQueries: [],
    intent: null,
    sequence: [],
    networkSavers: new Map(),
  };
}

export type UserInput = {
  userId: string | null;
  activity: ActivityRow[];
  /* Long term keys from my_feed_interests that describe tools and models. */
  communityLong?: Map<string, number>;
  /* my_search_affinity: category names and tags, weighted. */
  affinity?: { categories: Map<string, number>; tags: Map<string, number> } | null;
  now: number;
};

/* Only these interest prefixes describe tools and models. Topic and author keys
   belong to the content system and are not read (D173). */
const TOOL_MODEL_PREFIXES = ["category:", "tag:", "tool:", "model:", "provider:", "modality:", "usecase:", "capability:"];

function add(map: Map<string, number>, key: string, by: number) {
  if (!(by > 0)) return;
  map.set(key, (map.get(key) ?? 0) + by);
}

function normalise(map: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const v of map.values()) if (v > max) max = v;
  if (!(max > 0)) return new Map();
  const out = new Map<string, number>();
  for (const [k, v] of map) if (v > 0) out.set(k, v / max);
  return out;
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function weightOfEvent(row: ActivityRow): number {
  const W = TMR_V1.EVENT_WEIGHT;
  if (row.surface === "search" && row.event === "click") return W.search_click;
  if (row.event === "open" || row.event === "click") return W.open;
  return W[row.event] ?? 0;
}

export function buildUserContext(input: UserInput, index: CatalogueIndex): UserContext {
  const ctx = emptyUserContext(input.userId);
  if (!input.userId) return ctx;
  const { now } = input;
  const long = new Map<string, number>();
  const recent = new Map<string, number>();
  const session = new Map<string, number>();
  const negative = new Map<string, number>();
  const sessionEdge = now - TMR_V1.SESSION_MINUTES * 60_000;
  const recentEdge = now - TMR_V1.RECENT_DAYS * 86_400_000;

  if (input.communityLong) {
    for (const [k, v] of input.communityLong) if (TOOL_MODEL_PREFIXES.some((p) => k.startsWith(p))) add(long, k, v);
  }
  if (input.affinity) {
    for (const [name, w] of input.affinity.categories) add(long, `category:${slug(name)}`, w);
    for (const [tag, w] of input.affinity.tags) add(long, `tag:${tag.toLowerCase()}`, w);
    ctx.evidence += input.affinity.categories.size;
  }

  const rows = [...input.activity].sort((a, b) => b.at - a.at);
  for (const row of rows) {
    const ref = row.entityType && row.entityId ? `${row.entityType}:${row.entityId}` : null;
    ctx.sequence.push({ surface: row.surface, event: row.event, ref, query: row.query, at: row.at });

    if (row.event === "query") {
      if (!row.query) continue;
      if (row.at >= sessionEdge) ctx.sessionQueries.push(row.query);
      if (row.at >= recentEdge) ctx.recentQueries.push(row.query);
      continue;
    }
    if (!ref) continue;
    const entity = index.entities.get(ref);

    if (row.event === "impression") {
      const s = ctx.served.get(ref) ?? { count: 0, last: 0, clicked: false };
      ctx.served.set(ref, { ...s, count: s.count + 1, last: Math.max(s.last, row.at) });
      continue;
    }
    if (row.event === "not_interested" || row.event === "dismiss" || row.event === "dislike") {
      const base = TMR_V1.NEGATIVE[row.event as "not_interested" | "dismiss" | "dislike"];
      const decay = halfLifeDecay((now - row.at) / 86_400_000, TMR_V1.NEGATIVE.halfLifeDays);
      add(negative, ref, base * decay);
      if (!ctx.dismissed.has(ref)) ctx.dismissed.set(ref, row.at);
      if (entity) for (const k of interestKeys(entity)) if (k !== ref) add(negative, k, TMR_V1.NEGATIVE.taxonomy * base * decay);
      continue;
    }

    const weight = weightOfEvent(row);
    if (!(weight > 0)) continue;
    ctx.evidence += 1;
    if (row.event === "save") ctx.owned.add(ref);
    if (row.event === "compare_add") ctx.compared.add(ref);
    if (row.event === "open" || row.event === "click") {
      if (!ctx.opened.has(ref)) ctx.opened.set(ref, row.at);
      const s = ctx.served.get(ref);
      if (s) ctx.served.set(ref, { ...s, clicked: true });
    }
    if (!entity) continue;
    const keys = interestKeys(entity);
    const ageDays = (now - row.at) / 86_400_000;
    for (const k of keys) {
      add(long, k, weight * halfLifeDecay(ageDays, TMR_V1.LONG_HALF_LIFE_DAYS));
      if (row.at >= recentEdge) add(recent, k, weight * halfLifeDecay(ageDays, TMR_V1.RECENT_HALF_LIFE_DAYS));
    }
    if (row.at >= sessionEdge) {
      const r = halfLifeDecay((now - row.at) / 60_000, TMR_V1.SESSION_HALF_LIFE_MINUTES);
      for (const k of keys) add(session, k, weight * r);
    }
  }

  /* Ignored impressions: served several times near the top and never opened.
     Position is not in the activity rows, so only repeated serves count here;
     the position rule is applied where positions are known (events). */
  for (const [key, s] of ctx.served) {
    if (!s.clicked && s.count >= TMR_V1.IGNORE.minImpressions && !ctx.owned.has(key)) add(negative, key, 0.3);
  }

  ctx.long = normalise(long);
  ctx.recent = normalise(recent);
  ctx.session = normalise(session);
  for (const [k, v] of negative) ctx.negative.set(k, saturate(v, 1.5));
  ctx.intent = dominantIntent(ctx.session);
  ctx.cold = ctx.evidence < TMR_V1.COLD_EVIDENCE && ctx.long.size === 0 && ctx.session.size === 0 && ctx.sessionQueries.length === 0;
  return ctx;
}

/* The session's job: the strongest use case, else the strongest category. */
export function dominantIntent(session: Map<string, number>): string | null {
  let best: [string, number] | null = null;
  for (const prefix of ["usecase:", "category:"]) {
    for (const [k, v] of session) if (k.startsWith(prefix) && (!best || v > best[1])) best = [k, v];
    if (best) return best[0];
  }
  return null;
}

/* How much each interest dimension is worth on its own. */
/* Category and use case say what a thing is FOR; a tag or a capability word is
   weaker ("generation" is on video, image and music tools alike). */
const DIM: Record<string, number> = { category: 0.8, usecase: 0.8, capability: 0.4, tag: 0.35, provider: 0.5, modality: 0.4, tool: 0.7, model: 0.7 };

function horizonWeight(ctx: UserContext, key: string, horizons: ("long" | "recent" | "session")[]): number {
  let w = 0;
  if (horizons.includes("long")) w = Math.max(w, ctx.long.get(key) ?? 0);
  if (horizons.includes("recent")) w = Math.max(w, 0.9 * (ctx.recent.get(key) ?? 0));
  if (horizons.includes("session")) w = Math.max(w, ctx.session.get(key) ?? 0);
  return w;
}

/* Noisy-or over dimensions: one perfect dimension is enough, several add up. */
function relevanceOver(e: ToolModelEntity, ctx: UserContext, horizons: ("long" | "recent" | "session")[]): number {
  const best = new Map<string, number>();
  for (const k of interestKeys(e)) {
    const dim = k.slice(0, k.indexOf(":"));
    const w = horizonWeight(ctx, k, horizons) * (DIM[dim] ?? 0.3);
    if (w > (best.get(dim) ?? 0)) best.set(dim, w);
  }
  let miss = 1;
  for (const v of best.values()) miss *= 1 - Math.min(1, v);
  return 1 - miss;
}

export function negativeOf(e: ToolModelEntity, ctx: UserContext): number {
  let n = ctx.negative.get(e.key) ?? 0;
  for (const k of interestKeys(e)) n = Math.max(n, 0.5 * (ctx.negative.get(k) ?? 0));
  return Math.min(1, n);
}

/* 0..1: how much this matches the person over the long and recent horizons. */
export function userRelevance(e: ToolModelEntity, ctx: UserContext): number {
  if (ctx.cold) return 0;
  return relevanceOver(e, ctx, ["long", "recent"]) * (1 - 0.6 * negativeOf(e, ctx));
}

/* 0..1: how much this matches what the person is doing right now. */
export function sessionRelevance(e: ToolModelEntity, ctx: UserContext, queryVector: SparseVector | null, index: CatalogueIndex): number {
  const keys = relevanceOver(e, ctx, ["session"]);
  let q = 0;
  if (queryVector && queryVector.size > 0) {
    const v = index.lexical.vectorOf(e.key);
    if (v) q = cosine(queryVector, v);
  }
  return Math.max(keys, Math.min(1, 1.5 * q));
}

/* 0..1: the strongest similarity to anything the person owns or compared. */
export function ownedSimilarity(e: ToolModelEntity, ctx: UserContext, index: CatalogueIndex): number {
  let best = 0;
  for (const key of [...ctx.owned, ...ctx.compared]) {
    if (key === e.key) continue;
    best = Math.max(best, index.sim(key, e.key).value);
  }
  return best;
}

/* Novelty (guide 17 section 11): served recently lowers it, recovering over 72 h;
   opened lowers it with a 14 day half life; owned items keep a floor so they can
   be resurfaced on purpose. */
export function noveltyOf(e: ToolModelEntity, ctx: UserContext, now: number): number {
  const N = TMR_V1.NOVELTY;
  let n = 1;
  const s = ctx.served.get(e.key);
  if (s) {
    const hours = (now - s.last) / 3_600_000;
    const recovered = Math.min(1, hours / N.SERVED_RECOVER_HOURS);
    n *= 1 - N.SERVED * (1 - recovered) * Math.min(1, s.count / 3);
  }
  const opened = ctx.opened.get(e.key);
  if (opened) n *= 1 - N.OPENED * halfLifeDecay((now - opened) / 86_400_000, N.OPENED_HALF_LIFE_DAYS);
  if (ctx.owned.has(e.key)) n = Math.max(n, N.SAVED_FLOOR);
  return Math.max(0, Math.min(1, n));
}
