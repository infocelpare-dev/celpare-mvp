import { halfLifeDecay, saturate } from "../../community/intelligence/math";
import { tokenize } from "../../community/intelligence/text";
import type { InterestProfile } from "../../community/intelligence/types";
import { EXPLORE_V1 } from "./config";
import type { ExploreEntityType } from "./types";

/*
  The viewer, as Explore sees them. Built from what Celpare already records,
  never a new tracking system:

    long term   the community interest profile's longTerm (my_feed_interests:
                likes, saves, comments, watches, follows, searches, compares,
                Ask questions, tool opens) plus search affinity (categories and
                tags weighted by what the action cost), plus Explore clicks
    short term  the community shortTerm and recent searches
    session     Explore clicks in the last 30 minutes
    negative    community negatives (not interested, mutes, reports) and
                Explore dismisses, decayed. One negative never removes a topic.

  Each horizon is normalised to 0..1 by its own maximum, so a heavy user and a
  light one are compared on the shape of their interests, not the volume.
*/

export type ExploreHistoryRow = {
  entityType: ExploreEntityType;
  entityId: string | null;
  entityKey: string | null;
  event: string;
  section: string | null;
  at: number;
};

export type AffinityInput = {
  categories: Map<string, number>;
  tags: Map<string, number>;
  recent: string[];
};

export type ExploreProfile = {
  userId: string | null;
  cold: boolean;
  evidence: number;
  long: Map<string, number>;
  short: Map<string, number>;
  session: Map<string, number>;
  negative: Map<string, number>;
  followedAuthors: Set<string>;
  followers: Set<string>;
  mutedAuthors: Set<string>;
  mutedTopics: Set<string>;
  notInterestedPosts: Set<string>;
  /* Candidate key to the time of the last dismiss. */
  dismissed: Map<string, number>;
  /* Candidate key to Explore impressions and the last one. */
  served: Map<string, { count: number; last: number }>;
  /* Candidate key to the last click or open. */
  clicked: Map<string, number>;
  /* Candidate keys the viewer owns: saved, collected, followed. */
  owned: Set<string>;
  /* The candidates the viewer opened in this sitting, newest first. */
  sessionSeeds: { key: string; at: number }[];
  /* Every taxonomy or author key the viewer has ever touched, for the
     new territory bonus. */
  touched: Set<string>;
};

export function emptyExploreProfile(userId: string | null = null): ExploreProfile {
  return {
    userId,
    cold: true,
    evidence: 0,
    long: new Map(),
    short: new Map(),
    session: new Map(),
    negative: new Map(),
    followedAuthors: new Set(),
    followers: new Set(),
    mutedAuthors: new Set(),
    mutedTopics: new Set(),
    notInterestedPosts: new Set(),
    dismissed: new Map(),
    served: new Map(),
    clicked: new Map(),
    owned: new Set(),
    sessionSeeds: [],
    touched: new Set(),
  };
}

export function historyKey(row: Pick<ExploreHistoryRow, "entityType" | "entityId" | "entityKey">): string | null {
  const id = row.entityId ?? row.entityKey;
  return id ? `${row.entityType}:${id}` : null;
}

function normalise(map: Map<string, number>): Map<string, number> {
  let max = 0;
  for (const v of map.values()) if (v > max) max = v;
  if (!(max > 0)) return new Map();
  const out = new Map<string, number>();
  for (const [k, v] of map) if (v > 0) out.set(k, v / max);
  return out;
}

function add(map: Map<string, number>, key: string, by: number) {
  if (!(by > 0)) return;
  map.set(key, (map.get(key) ?? 0) + by);
}

/* Weight of one Explore event as an interest. A dismiss is negative. */
const EVENT_WEIGHT: Record<string, number> = {
  click: 1,
  save: 3,
  follow: 3,
  share: 2,
  play: 1,
  complete: 2,
};

export type BuildProfileInput = {
  userId: string | null;
  community: InterestProfile | null;
  affinity: AffinityInput | null;
  history: ExploreHistoryRow[];
  /* Keys the viewer owns: tool:<id> saved, model:<id> saved, person:<id> followed. */
  owned: string[];
  /* The feature keys of a candidate key, from the pool, so an Explore click on
     a tool becomes interest in its categories and tags. */
  keysOf: (candidateKey: string) => string[] | undefined;
  now: number;
};

export function buildExploreProfile(input: BuildProfileInput): ExploreProfile {
  const p = emptyExploreProfile(input.userId);
  const { community, affinity, now } = input;
  const long = new Map<string, number>();
  const short = new Map<string, number>();
  const session = new Map<string, number>();
  const negative = new Map<string, number>();

  if (community) {
    for (const [k, v] of community.longTerm) add(long, k, v);
    for (const [k, v] of community.shortTerm) add(short, k, v);
    for (const [k, v] of community.negative) add(negative, k, v);
    for (const a of community.followedAuthors) p.followedAuthors.add(a);
    for (const a of community.followers) p.followers.add(a);
    for (const a of community.mutedAuthors) p.mutedAuthors.add(a);
    for (const t of community.mutedTopics) p.mutedTopics.add(t);
    for (const id of community.notInterested) p.notInterestedPosts.add(id);
    /* Posts already seen in the feed count as served or consumed here too, so
       Explore does not re offer what the feed just showed. */
    for (const [postId, r] of community.seen) {
      /* A video is a post; either key may be on a shelf. */
      for (const key of [`post:${postId}`, `video:${postId}`]) {
        if (r.depth === "consumed" || r.depth === "viewed") p.clicked.set(key, r.lastAt);
        else p.served.set(key, { count: Math.max(1, r.impressions + (r.serves ?? 0)), last: r.lastAt });
      }
    }
    for (const k of community.longTerm.keys()) p.touched.add(k);
    p.evidence += community.evidence;
  }

  if (affinity) {
    for (const [name, w] of affinity.categories) add(long, `category:${name.toLowerCase()}`, w);
    for (const [tag, w] of affinity.tags) add(long, `tag:${tag.toLowerCase()}`, w);
    for (const q of affinity.recent) for (const t of tokenize(q, 6)) add(short, `term:${t}`, 0.5);
    for (const name of affinity.categories.keys()) p.touched.add(`category:${name.toLowerCase()}`);
    p.evidence += affinity.categories.size + affinity.tags.size;
  }

  const sessionEdge = now - EXPLORE_V1.SESSION_MINUTES * 60_000;
  const ordered = [...input.history].sort((a, b) => b.at - a.at);
  for (const row of ordered) {
    const key = historyKey(row);
    if (!key) continue;
    if (row.event === "impression") {
      const s = p.served.get(key) ?? { count: 0, last: 0 };
      p.served.set(key, { count: s.count + 1, last: Math.max(s.last, row.at) });
      continue;
    }
    if (row.event === "dismiss") {
      if (!p.dismissed.has(key)) p.dismissed.set(key, row.at);
      const decay = halfLifeDecay((now - row.at) / 86_400_000, EXPLORE_V1.NOVELTY.DISMISS_HALF_LIFE_DAYS);
      for (const k of input.keysOf(key) ?? []) {
        /* A dismiss is evidence against the item and, weakly, its taxonomy. */
        if (k.startsWith("term:")) continue;
        add(negative, k, 0.5 * decay);
      }
      add(negative, key, decay);
      continue;
    }
    const weight = EVENT_WEIGHT[row.event] ?? 0;
    if (!weight) continue;
    if (!p.clicked.has(key)) p.clicked.set(key, row.at);
    if (row.event === "save" || row.event === "follow") p.owned.add(key);
    p.evidence += 1;
    const keys = input.keysOf(key) ?? [];
    const ageDays = (now - row.at) / 86_400_000;
    for (const k of keys) {
      add(long, k, weight * halfLifeDecay(ageDays, 30));
      add(short, k, weight * halfLifeDecay(ageDays, 2));
      p.touched.add(k);
    }
    if (row.at >= sessionEdge) {
      if (!p.sessionSeeds.some((s) => s.key === key)) p.sessionSeeds.push({ key, at: row.at });
      const recency = halfLifeDecay((now - row.at) / 60_000, 15);
      for (const k of keys) add(session, k, weight * recency);
    }
  }

  for (const k of input.owned) p.owned.add(k);

  p.long = normalise(long);
  p.short = normalise(short);
  p.session = normalise(session);
  /* Negatives are NOT normalised by their maximum: one weak rejection must not
     become a full one. Saturating keeps several rejections below 1. */
  for (const [k, v] of negative) p.negative.set(k, saturate(v, 1.5));
  p.cold = p.evidence < 3 && p.long.size === 0 && p.session.size === 0;
  return p;
}
