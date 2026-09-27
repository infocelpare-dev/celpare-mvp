import { clamp01, halfLifeDecay, saturate } from "../../community/intelligence/math";
import { EXPLORE_V1 } from "./config";
import { safetyOf } from "./eligibility";
import type { Momentum } from "./momentum";
import { NO_MOMENTUM } from "./momentum";
import { noveltyOf } from "./novelty";
import type { ExploreProfile } from "./profile";
import type { DistanceBand, ExploreCandidate, ExploreFeatures } from "./types";

/*
  The shared features. Each has the same meaning for every entity type, 0..1.
  What a type does with them is its scorer's business (scorers.ts).
*/

export type KeyAdjacency = Map<string, Map<string, number>>;

/* Keys that describe what something is about, not who or what exactly it is. */
const TAXONOMY_PREFIXES = ["topic:", "category:", "tag:", "modality:", "provider:"];
const isTaxonomy = (k: string) => TAXONOMY_PREFIXES.some((p) => k.startsWith(p));
const dimensionOf = (k: string) => k.slice(0, k.indexOf(":"));

/*
  Adjacency learned from the pool itself, lexically (D145, no embeddings): two
  taxonomy keys are adjacent when they describe the same things. "Video
  generation" and "Image generation" share tools; "Coding" and "Audio" share
  few. Topic to topic adjacency from Community Intelligence (semantic.ts
  topicAdjacency, over what posts in each topic actually say) is merged in.
*/
export function keyAdjacency(pool: ExploreCandidate[], topicAdjacency?: Map<string, Map<string, number>>): KeyAdjacency {
  const freq = new Map<string, number>();
  const co = new Map<string, Map<string, number>>();
  for (const c of pool) {
    const keys = c.featureKeys.filter(isTaxonomy).slice(0, 12);
    for (const a of keys) {
      freq.set(a, (freq.get(a) ?? 0) + 1);
      for (const b of keys) {
        if (a === b) continue;
        const row = co.get(a) ?? new Map<string, number>();
        row.set(b, (row.get(b) ?? 0) + 1);
        co.set(a, row);
      }
    }
  }
  const out: KeyAdjacency = new Map();
  for (const [a, row] of co) {
    const r = new Map<string, number>();
    for (const [b, n] of row) {
      const denom = Math.min(freq.get(a) ?? 1, freq.get(b) ?? 1);
      if (denom > 0) r.set(b, clamp01(n / denom));
    }
    out.set(a, r);
  }
  if (topicAdjacency) {
    for (const [a, row] of topicAdjacency) {
      const key = `topic:${a}`;
      const r = out.get(key) ?? new Map<string, number>();
      for (const [b, v] of row) r.set(`topic:${b}`, Math.max(r.get(`topic:${b}`) ?? 0, v));
      out.set(key, r);
    }
  }
  return out;
}

/* The viewer's weight on one key, across horizons. */
export function weightOf(profile: ExploreProfile, key: string): number {
  const H = EXPLORE_V1.HORIZON;
  return Math.max(
    (profile.long.get(key) ?? 0) * H.long,
    (profile.short.get(key) ?? 0) * H.short,
    (profile.session.get(key) ?? 0) * H.session,
  );
}

/* Noisy or over dimensions (D128): the best match per dimension, combined so
   one perfect dimension is enough and several good ones add up. */
function noisyOr(keys: string[], weight: (k: string) => number): number {
  const best = new Map<string, number>();
  for (const k of keys) {
    const w = weight(k);
    if (!(w > 0)) continue;
    const d = dimensionOf(k);
    if (w > (best.get(d) ?? 0)) best.set(d, w);
  }
  let miss = 1;
  for (const [d, w] of best) miss *= 1 - clamp01((EXPLORE_V1.DIMENSION_WEIGHT[d] ?? 0.3) * w);
  return clamp01(1 - miss);
}

export type FeatureContext = {
  profile: ExploreProfile;
  adjacency: KeyAdjacency;
  momentum: Map<string, Momentum>;
  /* Feature keys of what the viewer owns, weighted, for the "similar" feature. */
  ownedKeys: Map<string, number>;
  now: number;
};

export function personalRelevance(c: ExploreCandidate, profile: ExploreProfile): { relevance: number; session: number; negative: number } {
  if (profile.cold) return { relevance: 0, session: 0, negative: 0 };
  const keys = [...c.featureKeys, c.key];
  const raw = noisyOr(keys, (k) => weightOf(profile, k));
  const session = noisyOr(keys, (k) => profile.session.get(k) ?? 0);
  let negative = profile.negative.get(c.key) ?? 0;
  for (const k of c.featureKeys) {
    if (k.startsWith("term:")) continue;
    negative = Math.max(negative, 0.6 * (profile.negative.get(k) ?? 0));
  }
  const relevance = Math.max(raw, session) * (1 - EXPLORE_V1.NEGATIVE_FACTOR * negative);
  return { relevance: clamp01(relevance), session, negative };
}

/*
  How far a candidate is from what the viewer already knows, 0 near to 1 far.
  Direct: the viewer's own weight on its taxonomy or its exact entity.
  Adjacent: a taxonomy key that sits beside one they care about.
*/
export function discoveryDistance(c: ExploreCandidate, ctx: FeatureContext): number {
  const { profile, adjacency } = ctx;
  if (profile.cold) return 1;
  let direct = 0;
  for (const k of [...c.featureKeys, c.key]) {
    if (k.startsWith("term:") || k.startsWith("kind:")) continue;
    direct = Math.max(direct, weightOf(profile, k));
  }
  let adjacent = 0;
  const interests = [...profile.long.entries(), ...profile.short.entries()]
    .filter(([k, w]) => isTaxonomy(k) && w >= 0.15)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  for (const k of c.featureKeys) {
    if (!isTaxonomy(k)) continue;
    const row = adjacency.get(k);
    if (!row) continue;
    for (const [j, w] of interests) adjacent = Math.max(adjacent, (row.get(j) ?? 0) * w);
  }
  let terms = 0;
  for (const k of c.featureKeys) if (k.startsWith("term:")) terms = Math.max(terms, weightOf(profile, k));
  const closeness = Math.max(Math.sqrt(direct), EXPLORE_V1.ADJACENT_FACTOR * Math.sqrt(adjacent), 0.5 * terms);
  return clamp01(1 - closeness);
}

export function bandOf(distance: number): DistanceBand {
  const E = EXPLORE_V1.BAND_EDGES;
  return distance < E.near ? "near" : distance < E.adjacent ? "adjacent" : "far";
}

export function qualityOfCandidate(c: ExploreCandidate): number {
  const f = c.facts;
  switch (c.entityType) {
    case "tool":
    case "model":
      return clamp01((f.listingQuality ?? 0.4) * (1 - 0.5 * (f.listingPenalty ?? 0)));
    case "post":
    case "video":
      return clamp01(0.5 * (f.contentQuality ?? 0.5) + 0.5 * (f.engagementQuality ?? 0.3) - 0.3 * (f.bait ?? 0));
    case "person":
      return clamp01(0.5 * (f.profileComplete ?? 0) + 0.5 * saturate(f.recentPosts ?? 0, 3));
    case "topic":
      return clamp01(0.5 + 0.5 * saturate(f.topicPosts ?? 0, 10));
    case "category":
      return clamp01(0.5 + 0.5 * saturate(f.categoryTools ?? 0, 8));
  }
}

/* Popularity on each type's own scale. Never follower count (brief 17). */
export function popularityOf(c: ExploreCandidate): number {
  const f = c.facts;
  switch (c.entityType) {
    case "tool":
      return clamp01(0.4 * saturate(f.views30d ?? 0, 40) + 0.3 * saturate(f.saves ?? 0, 8) + 0.3 * saturate(f.ratingCount ?? 0, 8));
    case "model":
      return clamp01(0.5 * saturate(f.views30d ?? 0, 20) + 0.3 * saturate(f.saves ?? 0, 5) + 0.2 * saturate(f.mentions ?? 0, 5));
    case "post":
    case "video":
      return clamp01(
        0.5 * saturate(f.viewers ?? 0, 40) +
          0.5 * saturate((f.likeCount ?? 0) + 2 * (f.commentCount ?? 0) + 3 * (f.saveCount ?? 0) + 2 * (f.repostCount ?? 0), 20),
      );
    case "person":
      return saturate(f.recentPosts ?? 0, 5);
    case "topic":
      return clamp01(0.5 * saturate(f.topicPosts ?? 0, 15) + 0.5 * saturate(f.topicParticipants7d ?? 0, 8));
    case "category":
      return saturate(f.categoryTools ?? 0, 10);
  }
}

export function freshnessOf(c: ExploreCandidate, now: number): number {
  const f = c.facts;
  if (c.entityType === "topic") return saturate(f.topicUnits7d ?? 0, 10);
  if (c.entityType === "category") return 0.5;
  if (c.entityType === "person") return saturate(f.recentPosts ?? 0, 3);
  if (!(c.createdAt > 0)) return 0.3;
  const ageHours = Math.max(0, now - c.createdAt) / 3_600_000;
  return halfLifeDecay(ageHours, EXPLORE_V1.HALF_LIFE_HOURS[c.entityType]);
}

export function networkProofOf(c: ExploreCandidate): number {
  const n = c.facts.network;
  if (!n) return 0;
  return saturate(n.savers + n.reviewers + n.posters + n.commenters + n.reposters + n.likers, 2);
}

export function similarityOf(c: ExploreCandidate, ownedKeys: Map<string, number>): number {
  if (ownedKeys.size === 0) return 0;
  return noisyOr(c.featureKeys, (k) => ownedKeys.get(k) ?? 0);
}

/* The feature keys of everything the viewer owns, weighted by how many of
   their owned items share each key, normalised to 0..1. */
export function ownedKeyWeights(profile: ExploreProfile, keysOf: (key: string) => string[] | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of profile.owned) {
    for (const k of keysOf(key) ?? []) {
      if (k.startsWith("term:") || k === key) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  let max = 0;
  for (const v of counts.values()) max = Math.max(max, v);
  const out = new Map<string, number>();
  if (max > 0) for (const [k, v] of counts) out.set(k, v / max);
  return out;
}

export type FeatureReading = {
  features: ExploreFeatures;
  band: DistanceBand;
  resurfaced: boolean;
  newTerritory: boolean;
};

export function extractExploreFeatures(c: ExploreCandidate, ctx: FeatureContext): FeatureReading {
  const rel = personalRelevance(c, ctx.profile);
  const nov = noveltyOf(c, ctx.profile, ctx.now);
  const distance = discoveryDistance(c, ctx);
  const m = ctx.momentum.get(c.key) ?? NO_MOMENTUM;
  return {
    features: {
      personalRelevance: rel.relevance,
      sessionRelevance: rel.session,
      negative: rel.negative,
      novelty: nov.novelty,
      discoveryDistance: distance,
      quality: qualityOfCandidate(c),
      safety: safetyOf(c),
      freshness: freshnessOf(c, ctx.now),
      popularity: popularityOf(c),
      momentum: Math.max(m.attention, 0.8 * m.acceleration),
      attention: m.attention,
      acceleration: m.acceleration,
      networkProof: networkProofOf(c),
      similarity: similarityOf(c, ctx.ownedKeys),
    },
    band: bandOf(distance),
    resurfaced: nov.resurfaced,
    newTerritory: nov.newTerritory,
  };
}
