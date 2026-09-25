import { applyDiversity } from "./diversity";
import { calculateFreshness } from "./freshness";
import { interestIn, isColdStart, topKeys } from "./interests";
import { clamp01, saturate } from "./math";
import { contentQuality, conversationQuality, engagementQuality } from "./quality";
import { contentIsRecommendationEligible, spamRisk } from "./safety";
import { signalsFor, uniqWithin } from "./signals";
import { similarity, tokenize } from "./text";
import type { GroupTrend } from "./trending";
import type { ContentItem, InterestProfile, PostSignals, RankedItem, ReasonCode } from "./types";

/*
  The generic community recommendations: people, posts like a post, topics and
  discussions. Each is its own function with its own objective.

  NOT AI TOOLS OR AI MODELS. Those recommendations belong to Explore's own
  specialised systems and nothing here recommends a tool or a model. A tool or
  model id is read only as an interest dimension of a post.
*/

/* ------------------------------------------------------------ people_v1 */

export type PersonCandidate = {
  id: string;
  /* How many of the people the viewer follows also follow this person. */
  mutualFollows: number;
  followsViewer: boolean;
  /* Topics this person posts in, by post count. */
  topics: Map<string, number>;
  /* The viewer's measured affinity for this person, 0..1, from their own
     likes, comments, saves and watching. */
  interaction: number;
  /* Their posts' average engagement quality, 0..1; 0.5 when unknown. */
  quality: number;
};

export type PersonRecommendation = { id: string; score: number; reasons: ReasonCode[] };

export const PEOPLE = {
  W_FOLLOW_BACK: 0.35,
  W_MUTUAL: 0.25,
  W_INTERACTION: 0.25,
  W_TOPICS: 0.15,
  MUTUAL_SCALE: 3,
} as const;

/*
  P(follow), heuristically. Follower COUNT is not an input: a large account is
  not a better suggestion for being large. What counts is the relationship:
  they follow you, people you follow follow them, you already engage with their
  posts, you read the same topics.
*/
export function rankPeople(
  viewerId: string,
  candidates: PersonCandidate[],
  profile: InterestProfile | null,
  limit = 20,
): PersonRecommendation[] {
  const myTopics = profile ? topKeys(profile, "topic", 10) : [];
  const myTopicSet = new Set(myTopics);

  return candidates
    .filter(
      (c) =>
        c.id !== viewerId &&
        !(profile?.followedAuthors.has(c.id) ?? false) &&
        !(profile?.mutedAuthors.has(c.id) ?? false),
    )
    .map((c) => {
      let shared = 0;
      let theirs = 0;
      for (const [t, n] of c.topics) {
        theirs += n;
        if (myTopicSet.has(t)) shared += n;
      }
      const topicOverlap = theirs > 0 ? shared / theirs : 0;

      const score =
        PEOPLE.W_FOLLOW_BACK * (c.followsViewer ? 1 : 0) +
        PEOPLE.W_MUTUAL * saturate(c.mutualFollows, PEOPLE.MUTUAL_SCALE) +
        PEOPLE.W_INTERACTION * clamp01(c.interaction) +
        PEOPLE.W_TOPICS * topicOverlap;

      const reasons: ReasonCode[] = [];
      if (c.followsViewer) reasons.push("follows_you");
      if (c.mutualFollows > 0) reasons.push("mutual_follows");
      if (c.interaction > 0.2) reasons.push("interacted_with_author");
      if (topicOverlap > 0.3) reasons.push("shared_topics");

      /* Quality only breaks near ties: it never lifts a stranger over somebody
         the viewer has a real connection with. */
      return { id: c.id, score: score * (0.9 + 0.1 * c.quality), reasons };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ----------------------------------------------------------- content_v1 */

export type ContentPool = {
  items: ContentItem[];
  signals: Map<string, PostSignals>;
  profile: InterestProfile | null;
  now: number;
};

function eligibleFor(pool: ContentPool): ContentItem[] {
  return pool.items.filter(
    (i) =>
      contentIsRecommendationEligible(i, signalsFor(pool.signals, i.id), pool.profile, {
        spam: spamRisk(i, pool.items.filter((o) => o.authorId === i.authorId)),
      }).eligible,
  );
}

/*
  Posts like these seeds: a post being read, or the posts somebody saved, liked
  or watched. Similarity leads; quality and freshness support it; the person's
  author and topic interest nudge it. Diversity runs after.
*/
export function recommendSimilarPosts(
  seeds: ContentItem[],
  pool: ContentPool,
  limit = 10,
  media?: ContentItem["media"],
): RankedItem[] {
  const seedIds = new Set(seeds.map((s) => s.id));
  const seedText = seeds.map((s) => s.body).join(" ");
  const seedTopics = new Set(seeds.map((s) => s.topicId).filter(Boolean));

  const scored = eligibleFor(pool)
    .filter((i) => !seedIds.has(i.id) && (!media || i.media === media))
    .map((item) => {
      const s = signalsFor(pool.signals, item.id);
      const sim = similarity(seedText, item.body);
      const topic = item.topicId && seedTopics.has(item.topicId) ? 1 : 0;
      const quality = 0.5 * engagementQuality(s, item).quality + 0.5 * contentQuality(item);
      const fresh = calculateFreshness(item, pool.now, "post", quality);
      const personal = pool.profile && !isColdStart(pool.profile) ? interestIn(pool.profile, item).overall : 0;
      const neg = pool.profile && !isColdStart(pool.profile) ? interestIn(pool.profile, item).negative : 0;
      const score = (0.5 * sim + 0.2 * topic + 0.15 * quality + 0.1 * fresh + 0.05 * personal) * (1 - 0.8 * neg);
      const reasons: ReasonCode[] = sim >= 0.2 || topic ? ["similar_to_liked"] : [];
      return { item, score, reasons, sources: ["similar_content"] } as RankedItem;
    })
    .filter((r) => r.score > 0.05)
    .sort((a, b) => b.score - a.score);

  return applyDiversity(scored).slice(0, limit);
}

/* ------------------------------------------------------------- topics_v1 */

export type TopicInfo = { id: string; slug: string; name: string; description: string | null };
export type TopicRecommendation = { topic: TopicInfo; score: number; reasons: ReasonCode[] };

/*
  Topics from what a person reads, and from what they search, compare and ask,
  matched by the topic's own words. Trending adds a little so a new person gets
  something live rather than an alphabetical list. Muted topics never appear.
*/
export function getRecommendedTopics(
  profile: InterestProfile | null,
  topics: TopicInfo[],
  trends: GroupTrend[] = [],
  limit = 6,
): TopicRecommendation[] {
  const trendScore = new Map<string, number>();
  const maxTrend = Math.max(0, ...trends.map((t) => t.score));
  for (const t of trends) trendScore.set(t.key, maxTrend > 0 ? t.score / maxTrend : 0);

  const cold = isColdStart(profile);

  return topics
    .filter((t) => !(profile?.mutedTopics.has(t.id) ?? false))
    .map((t) => {
      const key = `topic:${t.id}`;
      const read = profile ? (profile.longTerm.get(key) ?? 0) + (profile.shortTerm.get(key) ?? 0) : 0;
      let termHits = 0;
      if (profile) {
        for (const w of tokenize(`${t.name} ${t.slug.replace(/-/g, " ")} ${t.description ?? ""}`, 20)) {
          termHits += (profile.longTerm.get(`term:${w}`) ?? 0) + (profile.shortTerm.get(`term:${w}`) ?? 0);
        }
      }
      const neg = profile?.negative.get(key) ?? 0;
      const trend = trendScore.get(t.id) ?? 0;
      const score = saturate(read, 3) * 0.55 + saturate(termHits, 2) * 0.3 + trend * (cold ? 0.6 : 0.15) - saturate(neg, 3) * 0.5;
      const reasons: ReasonCode[] = [];
      if (read > 0) reasons.push("topic_interest");
      if (termHits > 0) reasons.push("from_search");
      if (trend > 0.3) reasons.push("trending");
      return { topic: t, score, reasons };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* -------------------------------------------------------- discussions_v1 */

/*
  Conversations worth joining: relevance to the person, the quality of the
  conversation (several people, real back and forth), fresh replies, and the
  post's own freshness. Never ordered by comment count.
*/
export function rankDiscussions(pool: ContentPool, limit = 10): RankedItem[] {
  const cold = isColdStart(pool.profile);
  const scored = eligibleFor(pool)
    .map((item) => {
      const s = signalsFor(pool.signals, item.id);
      const convo = conversationQuality(s);
      if (convo === 0) return null;
      const velocity = saturate(uniqWithin(s, "comment", 3), 2);
      const fresh = calculateFreshness(item, pool.now, "post");
      const m = pool.profile && !cold ? interestIn(pool.profile, item) : null;
      const relevance = m?.overall ?? 0;
      const score =
        (cold ? 0 : 0.35 * relevance) +
        (cold ? 0.55 : 0.35) * convo +
        0.15 * velocity +
        0.15 * fresh;
      const reasons: ReasonCode[] = m?.strongest === "topic" ? ["topic_interest"] : [];
      return { item, score: score * (1 - 0.8 * (m?.negative ?? 0)), reasons, sources: ["topic"] } as RankedItem;
    })
    .filter((r): r is RankedItem => r !== null && r.score > 0)
    .sort((a, b) => b.score - a.score);
  return applyDiversity(scored).slice(0, limit);
}
