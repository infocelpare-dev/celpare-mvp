import { clamp01, halfLifeDecay, hoursBetween, saturate } from "./math";
import { uniqWithin } from "./signals";
import type { ContentItem, PostSignals } from "./types";

/*
  Freshness and time decay.

  NOT ONE FORMULA FOR EVERYTHING. A post, a video, a trend and a viral spike
  age at different speeds, so each has its own half life, and all of them live
  in this one table so retuning never means opening a surface.
*/
export const DECAY = {
  /* A text or image post in For You loses half its freshness in a day and a half. */
  POST_HALF_LIFE_H: 36,
  /* Videos are watched for longer after they are posted. */
  REEL_HALF_LIFE_H: 60,
  /* Following is a timeline first: recency matters more there. */
  FOLLOWING_HALF_LIFE_H: 24,
  /* A trend is about now. */
  TREND_HALF_LIFE_H: 12,
  /* A viral boost fades once the spike is a day old, so nothing is boosted forever. */
  VIRAL_HALF_LIFE_H: 18,
  VIRAL_GRACE_H: 24,
  /* Good evergreen content is never pushed below this, however old. */
  EVERGREEN_FLOOR: 0.3,
  /* What counts as evergreen: engagement quality at or above this, and old
     enough that freshness would otherwise have buried it. */
  EVERGREEN_MIN_QUALITY: 0.6,
  EVERGREEN_MIN_AGE_H: 72,
} as const;

export type FreshnessProfile = "post" | "reel" | "following";

const HALF_LIFE: Record<FreshnessProfile, number> = {
  post: DECAY.POST_HALF_LIFE_H,
  reel: DECAY.REEL_HALF_LIFE_H,
  following: DECAY.FOLLOWING_HALF_LIFE_H,
};

export function calculateTimeDecay(ageHours: number, halfLifeHours: number): number {
  return halfLifeDecay(ageHours, halfLifeHours);
}

export function isEvergreen(ageHours: number, engagementQuality: number): boolean {
  return (
    ageHours >= DECAY.EVERGREEN_MIN_AGE_H &&
    engagementQuality >= DECAY.EVERGREEN_MIN_QUALITY
  );
}

/*
  0..1, 1 for brand new. Evergreen content keeps a floor so a genuinely useful
  post from last month can still surface; everything else decays normally.
*/
export function calculateFreshness(
  item: Pick<ContentItem, "createdAt">,
  now: number,
  profile: FreshnessProfile,
  engagementQuality = 0,
): number {
  const age = hoursBetween(item.createdAt, now);
  const raw = calculateTimeDecay(age, HALF_LIFE[profile]);
  return isEvergreen(age, engagementQuality) ? Math.max(raw, DECAY.EVERGREEN_FLOOR) : raw;
}

export function calculateTrendDecay(ageHours: number): number {
  return calculateTimeDecay(ageHours, DECAY.TREND_HALF_LIFE_H);
}

/* Full strength for a grace period, then fading. A viral score can never be
   permanent because this reaches zero for anything old. */
export function calculateViralDecay(ageHours: number): number {
  return calculateTimeDecay(Math.max(0, ageHours - DECAY.VIRAL_GRACE_H), DECAY.VIRAL_HALF_LIFE_H);
}

/*
  The freshness FEATURE for ranking (v2): age decay, held up a little by
  momentum. A new post that people are engaging with in the last six hours stays
  fresh longer than one nobody has touched. It is a feature the objective
  weighs, scaled by relevance there (relevanceGate), never an unconditional boost.
*/
export function freshnessScore(
  item: Pick<ContentItem, "createdAt">,
  signals: PostSignals,
  now: number,
  profile: FreshnessProfile,
  engagementQuality = 0,
): number {
  const base = calculateFreshness(item, now, profile, engagementQuality);
  const recentPeople =
    uniqWithin(signals, "like", 2) +
    uniqWithin(signals, "comment", 2) +
    uniqWithin(signals, "save", 2) +
    uniqWithin(signals, "repost", 2) +
    uniqWithin(signals, "share", 2) +
    uniqWithin(signals, "complete", 2);
  const momentum = saturate(recentPeople, 4);
  return clamp01(base * (0.85 + 0.3 * momentum));
}
