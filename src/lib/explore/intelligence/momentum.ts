import { clamp01, median, saturate } from "../../community/intelligence/math";
import { EXPLORE_V1 } from "./config";
import type { EntitySignals, ExploreCandidate } from "./types";

/*
  Trending and Rising for every entity type (brief sections 12 and 13).

  POSTS are not recomputed here. Community Intelligence's trending_v2 and
  rising_v2 already rate posts per unique viewer against creator and topic
  baselines (D143); the server passes each post's position in those lists.

  TOOLS AND MODELS read explore_entity_signals (D152):
    attention     recent activity per day (views, saves, reviews, compare adds,
                  post mentions), shrunk toward the type's median and divided by
                  it, so it is relative to what is normal for a tool or a model.
                  At least MIN_UNIQUE distinct people. Historical totals are NOT
                  an input: a large old total with little recent activity does
                  not trend.
    acceleration  this week against last week, smoothed, with unique viewer
                  growth. A ratio, so a small tool can rise; no follower or
                  size input anywhere.

  TOPICS read topic_velocity (4BG): the last day against the week.
*/

export type Momentum = {
  /* 0..1: how much attention right now, relative to the type. */
  attention: number;
  /* 0..1: how fast it is speeding up. */
  acceleration: number;
  /* 0..1: growth of distinct people. */
  growth: number;
  /* 0..1: how many distinct people recently, for Trending's audience part. */
  audience: number;
  /* Whether it passed the minimums at all. */
  trending: boolean;
  rising: boolean;
};

export const NO_MOMENTUM: Momentum = { attention: 0, acceleration: 0, growth: 0, audience: 0, trending: false, rising: false };

const T = EXPLORE_V1.TREND;

export function recentUnitsPerDay(s: EntitySignals): number {
  return (
    s.views24h * T.UNIT.view24h +
    (s.saves7d * T.UNIT.save7d + s.reviews7d * T.UNIT.review7d + s.compareAdds7d * T.UNIT.compare7d + s.postMentions7d * T.UNIT.mention7d) / 7
  );
}

function weekUnits(views: number, saves: number): number {
  return views + T.UNIT.save7d * saves;
}

export function entityMomentum(s: EntitySignals | undefined, typeMedian: number): Momentum {
  if (!s) return NO_MOMENTUM;
  const reference = Math.max(0.25, typeMedian);
  const rate = recentUnitsPerDay(s);
  /* Shrink the rate toward the reference: a handful of events is not a trend. */
  const shrunk = (rate + reference * T.PRIOR_WEIGHT * 0.2) / (1 + T.PRIOR_WEIGHT * 0.2);
  const relative = shrunk / reference;
  const trending = s.viewers7d >= T.MIN_UNIQUE && relative > 1;
  const attention = trending ? clamp01(saturate(relative - 1, 2)) : 0;

  const now = weekUnits(s.views7d, s.saves7d) + T.UNIT.review7d * s.reviews7d + T.UNIT.compare7d * s.compareAdds7d;
  const before = weekUnits(s.viewsPrev7d, s.savesPrev7d);
  const ratio = (now + T.ACCEL_K) / (before + T.ACCEL_K);
  const userGrowth = (s.viewers7d + 1) / (s.viewersPrev7d + 1);
  const rising = s.viewers7d >= T.MIN_UNIQUE_RISING && ratio >= T.RISING_MIN;
  const acceleration = rising ? clamp01(saturate(ratio - 1, 2)) : 0;
  const growth = rising ? clamp01(saturate(userGrowth - 1, 1.5)) : 0;

  return { attention, acceleration, growth, audience: saturate(s.viewers7d, 10), trending, rising };
}

export function topicMomentum(c: ExploreCandidate, medianUnits24h: number): Momentum {
  const f = c.facts;
  const units24h = f.topicUnits24h ?? 0;
  const units7d = f.topicUnits7d ?? 0;
  const p24 = f.topicParticipants24h ?? 0;
  const p7 = f.topicParticipants7d ?? 0;
  const reference = Math.max(0.5, medianUnits24h);
  const trending = p24 >= T.MIN_UNIQUE && units24h > reference;
  const attention = trending ? clamp01(saturate(units24h / reference - 1, 2)) : 0;
  /* The last day against the daily average of the week. */
  const ratio = (units24h * 7 + T.ACCEL_K) / (units7d + T.ACCEL_K);
  const rising = p24 >= T.MIN_UNIQUE_RISING && ratio >= T.RISING_MIN;
  return {
    attention,
    acceleration: rising ? clamp01(saturate(ratio - 1, 2)) : 0,
    growth: rising ? clamp01(saturate((p24 * 7) / Math.max(1, p7) - 1, 1.5)) : 0,
    audience: saturate(p24, 10),
    trending,
    rising,
  };
}

export function postMomentum(c: ExploreCandidate): Momentum {
  const f = c.facts;
  const pos = (rank: number | null | undefined) =>
    rank === null || rank === undefined ? 0 : clamp01(1 - rank / T.POST_LIST);
  const attention = pos(f.trendRank);
  const acceleration = pos(f.risingRank);
  /* perf_score is the stored relative performance (1 = the creator's usual). */
  const growth = f.perfScore ? clamp01(saturate(Math.max(0, f.perfScore - 1), 1)) : 0;
  return {
    attention,
    acceleration,
    growth,
    audience: saturate(f.viewers ?? 0, 20),
    trending: f.trendRank !== null && f.trendRank !== undefined,
    rising: f.risingRank !== null && f.risingRank !== undefined,
  };
}

/* One pass over the pool: the medians per type, then every candidate's momentum. */
export function momentumIndex(pool: ExploreCandidate[]): Map<string, Momentum> {
  const rates: Record<"tool" | "model", number[]> = { tool: [], model: [] };
  const topicUnits: number[] = [];
  for (const c of pool) {
    if ((c.entityType === "tool" || c.entityType === "model") && c.facts.signals) {
      rates[c.entityType].push(recentUnitsPerDay(c.facts.signals));
    }
    if (c.entityType === "topic") topicUnits.push(c.facts.topicUnits24h ?? 0);
  }
  const med = { tool: median(rates.tool), model: median(rates.model), topic: median(topicUnits) };

  const out = new Map<string, Momentum>();
  for (const c of pool) {
    switch (c.entityType) {
      case "tool":
      case "model":
        out.set(c.key, entityMomentum(c.facts.signals, med[c.entityType]));
        break;
      case "topic":
        out.set(c.key, topicMomentum(c, med.topic));
        break;
      case "post":
      case "video":
        out.set(c.key, postMomentum(c));
        break;
      case "person": {
        /* A creator is rising when one of their posts is (the server marks it). */
        const r = c.facts.risingRank;
        const rising = r !== null && r !== undefined;
        out.set(c.key, { ...NO_MOMENTUM, acceleration: rising ? clamp01(1 - r! / T.POST_LIST) : 0, rising });
        break;
      }
      default:
        out.set(c.key, NO_MOMENTUM);
    }
  }
  return out;
}
