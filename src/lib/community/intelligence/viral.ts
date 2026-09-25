import { calculateViralDecay } from "./freshness";
import { clamp01, hoursBetween, median, saturate } from "./math";
import { uniqWithin } from "./signals";
import type { ContentItem, PostSignals, SignalType } from "./types";

/*
  viral_v1: breakout detection.

  VIRAL IS NOT THE MOST LIKES. It is engagement arriving FASTER than it should,
  judged against what this creator's posts normally get and against the
  platform, measured over the last few hours rather than a lifetime. That is
  what lets a small creator break out: their baseline is small, so a modest
  spike is a big ratio, while a large account posting its usual numbers is not
  viral at all.

  NO PERMANENT BOOST. The score is a function of the last six hours, so it
  falls on its own as the spike passes, and calculateViralDecay() pulls it down
  further once the post is a day old.
*/

export const VIRAL = {
  /* What each distinct action is worth as an engagement unit. Costly and
     outward actions (share, follow, save) count more than a like. */
  UNIT_WEIGHTS: {
    like: 1,
    comment: 2,
    save: 2.5,
    repost: 3,
    share: 3,
    complete: 1,
    follow_after: 4,
  } as Partial<Record<SignalType, number>>,
  /* Recent window: the last 6 hours (buckets 0 and 1). Previous: 6 to 24 hours. */
  RECENT_HOURS: 6,
  PREVIOUS_HOURS: 18,
  /* A breakout needs at least this many distinct people in the recent window,
     so two friends liking a post in a minute is not a breakout. */
  MIN_RECENT_ENGAGERS: 3,
  /* Velocity must be this many times the reference rate. */
  BREAKOUT_RATIO: 2.5,
  /* The platform floor under a creator's baseline, units per hour. Stops a
     creator whose baseline is ~0 turning one like into an infinite ratio. */
  MIN_BASELINE_PER_HOUR: 0.15,
  BREAKOUT_SCORE: 0.5,
  /* A new creator's expected rate, as a share of the platform's typical one. */
  NEW_CREATOR_FACTOR: 0.5,
} as const;

function unitsIn(s: PostSignals, fromBucket: number, toBucket: number): number {
  let sum = 0;
  for (const [type, w] of Object.entries(VIRAL.UNIT_WEIGHTS) as [SignalType, number][]) {
    const st = s.byType[type];
    if (!st) continue;
    for (let b = fromBucket; b <= toBucket; b++) sum += st.uniq[b] * w;
  }
  return sum;
}

export type Velocity = { recent: number; previous: number };

/* Engagement units per hour, recent window and the one before it. */
export function calculateVelocity(s: PostSignals): Velocity {
  return {
    recent: unitsIn(s, 0, 1) / VIRAL.RECENT_HOURS,
    previous: unitsIn(s, 2, 2) / VIRAL.PREVIOUS_HOURS,
  };
}

/*
  Is it speeding up? Relative change, bounded to -1..1, with a floor under the
  previous rate so a post going from nothing to something reads as fast
  acceleration rather than infinity.
*/
export function calculateAcceleration(v: Velocity): number {
  const base = Math.max(v.previous, VIRAL.MIN_BASELINE_PER_HOUR);
  return Math.max(-1, Math.min(1, (v.recent - v.previous) / (base * 4)));
}

/*
  A creator's normal rate: the median, across their SETTLED posts in view (a day
  old or more), of lifetime units per hour over the first three days. A post
  still in flight is what is being judged, so it never sets its own bar.
  Undefined for a creator with no settled post, and then the platform's rate
  stands in.
*/
export const SETTLED_HOURS = 24;

export function creatorBaseline(
  others: { item: ContentItem; signals: PostSignals }[],
  now: number,
): number | null {
  const settled = others.filter(({ item }) => hoursBetween(item.createdAt, now) >= SETTLED_HOURS);
  const rates = settled.map(({ item, signals }) => {
    const hours = Math.min(72, Math.max(1, hoursBetween(item.createdAt, now)));
    return unitsIn(signals, 0, 5) / hours;
  });
  return rates.length ? median(rates) : null;
}

export type ViralAssessment = {
  velocity: Velocity;
  acceleration: number;
  ratio: number;
  score: number;
  breakout: boolean;
  /* The rate it was measured against (units per hour). Optional so older
     callers and tests that build an assessment by hand still type check. */
  reference?: number;
  /* Distinct people in the last six hours. */
  recentEngagers?: number;
};

export function calculateViralScore(
  item: ContentItem,
  s: PostSignals,
  baseline: number | null,
  platformBaseline: number,
  now: number,
): ViralAssessment {
  const velocity = calculateVelocity(s);
  const acceleration = calculateAcceleration(velocity);

  /* Compare against the creator where known. A creator with no history has no
     audience of their own yet, so they are compared against HALF the platform's
     typical rate rather than all of it; and nobody is compared against less than
     that, so a baseline of zero cannot turn every like into a breakout. */
  const reference = Math.max(
    baseline ?? platformBaseline * VIRAL.NEW_CREATOR_FACTOR,
    platformBaseline * VIRAL.NEW_CREATOR_FACTOR,
    VIRAL.MIN_BASELINE_PER_HOUR,
  );
  const ratio = velocity.recent / reference;

  const engagers = uniqWithin(s, "like", 2) + uniqWithin(s, "comment", 2) + uniqWithin(s, "share", 2) + uniqWithin(s, "repost", 2) + uniqWithin(s, "save", 2);
  const evidence = saturate(engagers, VIRAL.MIN_RECENT_ENGAGERS * 2);

  const age = hoursBetween(item.createdAt, now);
  const raw = clamp01(Math.log2(1 + Math.max(0, ratio)) / 4) * evidence;
  const score = raw * calculateViralDecay(age) * (acceleration < -0.5 ? 0.6 : 1);

  const breakout =
    engagers >= VIRAL.MIN_RECENT_ENGAGERS &&
    ratio >= VIRAL.BREAKOUT_RATIO &&
    acceleration >= 0 &&
    score >= VIRAL.BREAKOUT_SCORE * 0.5;

  return { velocity, acceleration, ratio, score, breakout, reference, recentEngagers: engagers };
}

/*
  Breakout detection over a pool. Returns every post with its assessment,
  keyed by post id. The platform baseline is the median of creator baselines.
*/
export function detectBreakoutContent(
  pool: { item: ContentItem; signals: PostSignals }[],
  now: number,
): Map<string, ViralAssessment> {
  const byAuthor = new Map<string, { item: ContentItem; signals: PostSignals }[]>();
  for (const p of pool) {
    const list = byAuthor.get(p.item.authorId) ?? [];
    list.push(p);
    byAuthor.set(p.item.authorId, list);
  }

  /* The platform's typical rate is the median across CREATORS, each creator
     contributing their own median. Taken per post instead, one prolific account
     would set the bar for everybody. */
  const perCreator = [...byAuthor.values()]
    .map((list) => creatorBaseline(list, now))
    .filter((b): b is number => b !== null);
  const platformBaseline = Math.max(VIRAL.MIN_BASELINE_PER_HOUR, median(perCreator));

  const out = new Map<string, ViralAssessment>();
  for (const p of pool) {
    const others = (byAuthor.get(p.item.authorId) ?? []).filter((o) => o.item.id !== p.item.id);
    out.set(p.item.id, calculateViralScore(p.item, p.signals, creatorBaseline(others, now), platformBaseline, now));
  }
  return out;
}

export { unitsIn as engagementUnits };

/*
  The lifecycle of a post's distribution, derived from behaviour only. Nobody
  labels anything viral by hand.

    normal     nothing unusual
    rising     speeding up, above its expected rate, not yet a breakout
    breakout   passed the breakout test (see calculateViralScore)
    viral      a breakout at twice the ratio with twice the people
    saturated  was spiking in the previous window, still active, no longer
               accelerating: it has reached most of the people it will
    decayed    was spiking, and the last six hours fell below the expected rate
*/
export type ViralState = "normal" | "rising" | "breakout" | "viral" | "saturated" | "decayed";

export const LIFECYCLE = {
  RISING_ACCELERATION: 0.2,
  RISING_RATIO: 1.2,
  VIRAL_RATIO_FACTOR: 2,
  VIRAL_ENGAGER_FACTOR: 2,
} as const;

export function viralState(a: ViralAssessment): ViralState {
  const reference = Math.max(a.reference ?? VIRAL.MIN_BASELINE_PER_HOUR, VIRAL.MIN_BASELINE_PER_HOUR);
  const previousRatio = a.velocity.previous / reference;
  const wasSpiking = previousRatio >= VIRAL.BREAKOUT_RATIO;

  if (a.breakout) {
    const people = a.recentEngagers ?? 0;
    if (
      a.ratio >= VIRAL.BREAKOUT_RATIO * LIFECYCLE.VIRAL_RATIO_FACTOR &&
      people >= VIRAL.MIN_RECENT_ENGAGERS * LIFECYCLE.VIRAL_ENGAGER_FACTOR
    ) {
      return "viral";
    }
    return "breakout";
  }
  if (wasSpiking) return a.ratio >= 1 ? "saturated" : "decayed";
  if (a.acceleration >= LIFECYCLE.RISING_ACCELERATION && a.ratio >= LIFECYCLE.RISING_RATIO) return "rising";
  return "normal";
}
