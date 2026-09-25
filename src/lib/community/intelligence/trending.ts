import { calculateTrendDecay } from "./freshness";
import { clamp01, hoursBetween, percentile, saturate } from "./math";
import { conversationQuality } from "./quality";
import { contentIsRecommendationEligible, spamRisk } from "./safety";
import { signalsFor, uniqWithin } from "./signals";
import { extractHashtags } from "./text";
import type { ContentItem, PostSignals, SignalType } from "./types";
import { calculateAcceleration, calculateVelocity, engagementUnits } from "./viral";

/*
  trending_v1 and rising_v1. Separate from For You, and not personalised:
  "what is gaining attention right now" is the same answer for everybody, which
  is also why these can be computed from the public (anon) view and cached.

  NEVER LIFETIME TOTALS. Every trending score is built from the last day of
  engagement, weighted toward the last few hours, multiplied by how many
  distinct people took part, and decayed by age. A post with a thousand likes
  from last month and none today is not trending, and the tests say so.

  Rising is a different question: new, accelerating, and not yet seen by many.
  It exists so smaller and newer content has a way up that is not "already won".
*/

export const TRENDING = {
  /* Bucket weights for recent units: last hour, 1-6h, 6-24h. */
  RECENCY: [1, 0.7, 0.35] as const,
  /* A trending post needs at least this many distinct people in the last day. */
  MIN_PARTICIPANTS: 2,
  /* Posts older than this are not candidates at all. */
  MAX_AGE_HOURS: 7 * 24,
  /* Groups (topics, hashtags, creators) need this many posts in the window. */
  MIN_GROUP_POSTS: 1,
  MIN_GROUP_PARTICIPANTS: 3,
  RISING_MAX_AGE_HOURS: 72,
  /* "Not yet saturated": reach below this percentile of the pool. */
  RISING_REACH_PERCENTILE: 0.75,
} as const;

const PARTICIPATION: SignalType[] = ["like", "comment", "repost", "save", "share", "complete"];

type Scored = { item: ContentItem; score: number };

export type TrendInput = {
  items: ContentItem[];
  signals: Map<string, PostSignals>;
  now: number;
};

function recentUnits(s: PostSignals): number {
  return (
    engagementUnits(s, 0, 0) * TRENDING.RECENCY[0] +
    engagementUnits(s, 1, 1) * TRENDING.RECENCY[1] +
    engagementUnits(s, 2, 2) * TRENDING.RECENCY[2]
  );
}

function participants(s: PostSignals): number {
  return PARTICIPATION.reduce((a, t) => a + uniqWithin(s, t, 3), 0);
}

function eligible(items: ContentItem[], signals: Map<string, PostSignals>): ContentItem[] {
  const byAuthor = new Map<string, ContentItem[]>();
  for (const i of items) byAuthor.set(i.authorId, [...(byAuthor.get(i.authorId) ?? []), i]);
  return items.filter(
    (i) =>
      contentIsRecommendationEligible(i, signalsFor(signals, i.id), null, {
        spam: spamRisk(i, byAuthor.get(i.authorId) ?? []),
      }).eligible,
  );
}

export function trendScore(item: ContentItem, s: PostSignals, now: number): number {
  const age = hoursBetween(item.createdAt, now);
  if (age > TRENDING.MAX_AGE_HOURS) return 0;
  const people = participants(s);
  if (people < TRENDING.MIN_PARTICIPANTS) return 0;
  const accel = calculateAcceleration(calculateVelocity(s));
  return recentUnits(s) * saturate(people, 5) * calculateTrendDecay(Math.max(0, age - 6)) * (1 + 0.3 * Math.max(0, accel));
}

export function trendingPosts(input: TrendInput, limit = 20): Scored[] {
  return eligible(input.items, input.signals)
    .map((item) => ({ item, score: trendScore(item, signalsFor(input.signals, item.id), input.now) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* Reels trend on watching: completions and deep watches count, not just likes. */
export function trendingReels(input: TrendInput, limit = 20): Scored[] {
  return eligible(input.items.filter((i) => i.media === "video"), input.signals)
    .map((item) => {
      const s = signalsFor(input.signals, item.id);
      const watchers = uniqWithin(s, "swipe_watched", 3) + uniqWithin(s, "complete", 3) * 1.5 + uniqWithin(s, "rewatch", 3);
      const base = trendScore(item, s, input.now);
      const age = hoursBetween(item.createdAt, input.now);
      const watchTrend = age <= TRENDING.MAX_AGE_HOURS ? saturate(watchers, 4) * calculateTrendDecay(Math.max(0, age - 6)) : 0;
      return { item, score: base + watchTrend };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export type GroupTrend = { key: string; score: number; posts: number; participants: number; growth: number };

/*
  Groups trend by growth, not size: units in the last day against the daily
  average of the three days before. A big topic that is always busy is not
  trending; a small one that doubled is.
*/
function groupTrends(
  input: TrendInput,
  keysOf: (i: ContentItem) => string[],
  limit: number,
): GroupTrend[] {
  const groups = new Map<string, { recent: number; prior: number; posts: number; people: number }>();
  for (const item of eligible(input.items, input.signals)) {
    if (hoursBetween(item.createdAt, input.now) > TRENDING.MAX_AGE_HOURS) continue;
    const s = signalsFor(input.signals, item.id);
    const recent = recentUnits(s);
    const prior = engagementUnits(s, 3, 3) / 2;
    const people = participants(s);
    for (const key of keysOf(item)) {
      const g = groups.get(key) ?? { recent: 0, prior: 0, posts: 0, people: 0 };
      g.recent += recent;
      g.prior += prior;
      g.posts += 1;
      g.people += people;
      groups.set(key, g);
    }
  }
  return [...groups.entries()]
    .filter(([, g]) => g.posts >= TRENDING.MIN_GROUP_POSTS && g.people >= TRENDING.MIN_GROUP_PARTICIPANTS && g.recent > 0)
    .map(([key, g]) => {
      const growth = (g.recent + 1) / (g.prior + 1);
      return {
        key,
        score: g.recent * clamp01(Math.log2(1 + growth) / 2) * saturate(g.people, 6),
        posts: g.posts,
        participants: g.people,
        growth,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function trendingTopics(input: TrendInput, limit = 10): GroupTrend[] {
  return groupTrends(input, (i) => (i.topicId ? [i.topicId] : []), limit);
}

export function trendingHashtags(input: TrendInput, limit = 10): GroupTrend[] {
  return groupTrends(input, (i) => extractHashtags(i.body), limit);
}

/* Creators trend on what their recent posts are doing, never on follower count. */
export function trendingCreators(input: TrendInput, limit = 10): GroupTrend[] {
  return groupTrends(input, (i) => [i.authorId], limit);
}

/* Discussions: conversation quality and the speed of new replies, never the
   raw comment count. */
export function trendingDiscussions(input: TrendInput, limit = 10): Scored[] {
  return eligible(input.items, input.signals)
    .map((item) => {
      const s = signalsFor(input.signals, item.id);
      const age = hoursBetween(item.createdAt, input.now);
      if (age > TRENDING.MAX_AGE_HOURS) return { item, score: 0 };
      const replySpeed = uniqWithin(s, "comment", 3);
      const score = conversationQuality(s) * saturate(replySpeed, 3) * calculateTrendDecay(Math.max(0, age - 6));
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/*
  Rising: young, accelerating, below the pool's typical reach. Deliberately
  excludes whatever already tops trending, so the two lists differ.
*/
export function risingContent(input: TrendInput, limit = 10, excludeIds: Set<string> = new Set()): Scored[] {
  const pool = eligible(input.items, input.signals);
  const reach = pool.map((i) => {
    const s = signalsFor(input.signals, i.id);
    return Math.max(s.byType.impression?.totalUniq ?? 0, participants(s));
  });
  const ceiling = Math.max(3, percentile(reach, TRENDING.RISING_REACH_PERCENTILE));

  return pool
    .map((item, idx) => {
      if (excludeIds.has(item.id)) return { item, score: 0 };
      const age = hoursBetween(item.createdAt, input.now);
      if (age > TRENDING.RISING_MAX_AGE_HOURS) return { item, score: 0 };
      if (reach[idx] > ceiling) return { item, score: 0 };
      const s = signalsFor(input.signals, item.id);
      const v = calculateVelocity(s);
      const accel = calculateAcceleration(v);
      if (accel <= 0 || v.recent <= 0) return { item, score: 0 };
      const newness = 1 - age / TRENDING.RISING_MAX_AGE_HOURS;
      return { item, score: accel * saturate(participants(s), 3) * (0.5 + 0.5 * newness) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
