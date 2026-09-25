/*
  Community Intelligence: the shared vocabulary.

  EVERY FILE IN THIS FOLDER EXCEPT server/ IS PURE. No database, no fetch, no
  "server-only", no "@/" imports. That is what lets `npm run test:algorithms`
  run them under Node's own test runner, and what makes each stage replaceable:
  a stage takes plain data and returns plain data.

  The server half (server/) reads the database, turns rows into these shapes
  and hands them to the pure functions. Nothing in here knows a row exists.

  AI TOOL AND AI MODEL RECOMMENDATIONS ARE NOT IN HERE AND MUST NOT BE ADDED.
  They are separate systems owned by Explore. A tool or model id appears below
  only as a fact about a post (the thing it is attached to), which is an interest
  signal, never as a thing being recommended.
*/

import type { Intent } from "./config";

/* The product surfaces. Each has its own objective and its own algorithm. */
export type FeedSurface =
  | "for_you"
  | "following"
  | "reels"
  | "trending"
  | "rising"
  | "people"
  | "topics"
  | "discussions"
  | "content";

/* Every algorithm is versioned. A v2 is a new id beside v1, never an edit that
   makes last month's analytics describe a different system. */
export type AlgorithmId =
  | "feed_v1"
  | "following_v1"
  | "reels_v1"
  /* v2, 2026-09-24: seen tiers, session and intent, novelty, saturation,
     quality gated exploration, escalating negative feedback, structured
     reasons. v1 stays in the registry so its recorded events keep a meaning. */
  | "feed_v2"
  | "following_v2"
  | "reels_v2"
  /* v3, 2026-09-25: served state, position aware ignores, network candidates
     and counts only social proof, two way author affinity, a conversation
     first objective, engagement bait, source quotas, creator relative
     performance, same story clustering. Reels stay on reels_v2. */
  | "feed_v3"
  | "following_v3"
  | "distribution_v1"
  | "viral_v1"
  | "trending_v1"
  | "rising_v1"
  | "people_v1"
  | "content_v1"
  | "topics_v1"
  | "discussions_v1"
  /* What served the page when the real algorithm failed. Recorded as its own
     id so a fallback never pollutes the numbers of the algorithm it replaced. */
  | "fallback_v1";

export type MediaType = "text" | "image" | "video";

/*
  A post as the algorithms see it. Deliberately smaller than FeedPost: only the
  facts ranking uses, with the time as a number so no stage parses a date.
*/
export type ContentItem = {
  id: string;
  authorId: string;
  body: string;
  createdAt: number;
  topicId: string | null;
  kind: string;
  toolId: string | null;
  modelId: string | null;
  linkUrl: string | null;
  media: MediaType;
  /* The public counters already on the post row. */
  counts: { likes: number; comments: number; saves: number; reposts: number };
};

/* Where a candidate came from. A candidate can arrive from several. */
export type CandidateSource =
  | "following"
  | "social"
  | "author_affinity"
  | "topic"
  | "similar_content"
  | "trending"
  | "rising"
  | "fresh"
  | "evergreen"
  | "exploration"
  | "video"
  /* feed_v3: engaged with by people the viewer follows (my_network_engagement). */
  | "network";

/*
  Why somebody is seeing a thing, as a code. The label a person could read lives
  in explain.ts. No score, weight or internal number is ever part of a reason.
*/
export type ReasonCode =
  | "follows_author"
  | "interacted_with_author"
  | "similar_to_watched"
  | "similar_to_saved"
  | "similar_to_liked"
  | "topic_interest"
  | "trending_in_interests"
  | "trending"
  | "rising"
  | "new_from_followed"
  | "reposted_by_followed"
  | "popular_with_similar"
  | "from_search"
  | "fresh"
  | "exploration"
  | "follows_you"
  | "mutual_follows"
  | "shared_topics"
  /* Related to what the person is doing in this sitting. */
  | "session_interest"
  /* Shown before; back only because nothing unseen was left (seen.ts). */
  | "resurfaced"
  /* feed_v3 social proof, counts only. Likes are never a shown reason:
     likes are private, so they rank and never explain. */
  | "commented_by_following"
  | "reposted_by_following";

/* feed_v3: how many people the viewer follows did something with a post.
   Counts only, never who (my_network_engagement). likers is 0 unless at least
   two followed people liked it, so no single like can be inferred. */
export type NetworkEngagement = { likers: number; commenters: number; reposters: number };

export type Candidate = {
  item: ContentItem;
  sources: CandidateSource[];
  reasons: ReasonCode[];
};

/* ------------------------------------------------------------------ signals */

/*
  The engagement signals feed_post_signals() returns. Counts only: no function
  in this folder is ever handed who did something, only how many and when.
*/
export type SignalType =
  | "like"
  | "author_reply"
  | "comment"
  | "repost"
  | "save"
  | "impression"
  | "open"
  | "dwell"
  | "video_start"
  | "complete"
  | "share"
  | "follow_after"
  | "profile_visit"
  | "not_interested"
  | "skip"
  | "swipe_watched"
  | "watch"
  | "rewatch"
  | "report";

/* Buckets by how long ago: <1h, 1-6h, 6-24h, 24-72h, 72h-7d, older. */
export const BUCKET_HOURS = [1, 6, 24, 72, 168, Infinity] as const;
export type Buckets = [number, number, number, number, number, number];

export type SignalStat = {
  /* Events per bucket. */
  n: Buckets;
  /* Distinct people (or signed out sessions) per bucket. Not additive across
     buckets, which is why the all time distinct count is carried separately. */
  uniq: Buckets;
  total: number;
  totalUniq: number;
  /* The mean of the measure, where the signal has one (watch percent, dwell). */
  avg: number | null;
};

export type PostSignals = {
  byType: Partial<Record<SignalType, SignalStat>>;
  qualifiedReports: number;
  authorInactive: boolean;
};

export function emptyBuckets(): Buckets {
  return [0, 0, 0, 0, 0, 0];
}

export const NO_SIGNALS: PostSignals = {
  byType: {},
  qualifiedReports: 0,
  authorInactive: false,
};

/* --------------------------------------------------------------------- seen */

/* How deeply a post was consumed. Each level keeps it away for longer (seen.ts). */
/* "served" (feed_v3): delivered to the browser, never on screen. Below brief:
   it rotates a refresh, it is not evidence the post was seen. */
export type SeenDepth = "served" | "brief" | "viewed" | "consumed";

export type SeenRecord = {
  lastAt: number;
  impressions: number;
  depth: SeenDepth;
  /* How often it was delivered without being seen (feed_v3 served state). */
  serves?: number;
  /* Where the evidence came from, for the debug view. */
  source: "history" | "session";
};

export type SeenState = Map<string, SeenRecord>;

/* ---------------------------------------------------------------- interests */

/*
  One thing a person did, as the interest model folds it in. Every source the
  person's own history offers maps onto this: likes, saves, reposts, comments,
  watching, feed opens and dwell, follows, not interested, mutes, reports,
  searches, comparisons and Ask Celpare questions.
*/
export type InterestAction =
  | "like"
  | "save"
  | "repost"
  | "comment"
  | "complete"
  | "watch"
  | "skip"
  | "video_start"
  | "profile_visit"
  | "open"
  | "dwell"
  | "seen"
  | "follow"
  | "not_interested"
  | "mute_author"
  | "mute_topic"
  | "report"
  | "search"
  | "compare"
  | "ask"
  /* A tool opened from Explore or its own page: interest in posts about it. */
  | "explore"
  /* Reserved: no dislike control exists yet. Configured so one can be added
     without touching the model. */
  | "dislike"
  /* feed_v3. Delivered, never on screen: served state only, no interest. */
  | "served"
  /* feed_v3. This account follows the person: mutual follow affinity. */
  | "followed_by"
  /* feed_v3. This account commented on or reposted the person's post:
     two way author affinity. Public actions only, likes never. */
  | "engaged_me";

export type InterestSignal = {
  action: InterestAction;
  at: number;
  postId?: string | null;
  authorId?: string | null;
  topicId?: string | null;
  kind?: string | null;
  toolId?: string | null;
  modelId?: string | null;
  /* Free text: a search query or an Ask Celpare title. */
  term?: string | null;
  /* The measure, where the action has one: watch percent, dwell ms. */
  value?: number | null;
  /* Where in the feed it was shown, 0 based, for position aware ignores. */
  position?: number | null;
};

/*
  Feature keys are prefixed strings, so one map can hold every dimension:
  topic:<id>, author:<id>, kind:<kind>, tool:<id>, model:<id>, term:<word>.
*/
export type FeatureKey = string;

export type InterestProfile = {
  userId: string | null;
  /* Weeks of history, slow decay. */
  longTerm: Map<FeatureKey, number>;
  /* The last day or two, fast decay. */
  shortTerm: Map<FeatureKey, number>;
  /* What they pushed away. */
  negative: Map<FeatureKey, number>;
  /* How many separate actions support each key, for confidence, and how many
     separate rejections hit it, for escalation (config.ts NEGATIVE). */
  positiveCounts: Map<FeatureKey, number>;
  negativeCounts: Map<FeatureKey, number>;
  /* Explicit choices, which are rules rather than weights. */
  followedAuthors: Set<string>;
  /* feed_v3: who follows this person. Followed AND following is a friend (D123). */
  followers: Set<string>;
  mutedAuthors: Set<string>;
  mutedTopics: Set<string>;
  notInterested: Set<string>;
  /* Post id to how often, how deeply and when it was last shown or consumed. */
  seen: SeenState;
  /* Posts they engaged with, as seeds for "similar to". */
  seeds: { liked: string[]; saved: string[]; watched: string[] };
  /* How much evidence there is. Zero is a new user, and cold start keys off it. */
  evidence: number;
  /* feed_v3: posts shown and passed over, per author and topic key. count is
     separate ignores, mass is their position weighted, decayed sum. */
  ignored: Map<FeatureKey, { count: number; mass: number }>;
};

/* ----------------------------------------------------------------- ranking */

export type RankingContext = {
  userId: string | null;
  sessionId?: string | null;
  surface: FeedSurface;
  /* Frozen for the request, so pagination is stable and tests are exact. */
  now: number;
  algorithm: AlgorithmId;
  variant: string;
  experimentId: string | null;
  /* v2 context: what the person seems to be doing, and when they last acted. */
  intent?: Intent;
  lastInteractionAt?: number | null;
};

/*
  The normalised features one candidate is ranked on. Every value is 0..1 so no
  feature can dominate by being on a bigger scale. This object is the seam a
  learned model plugs into: it reads these and nothing else.
*/
export type RankingFeatures = {
  relevance: number;
  authorAffinity: number;
  topicAffinity: number;
  semantic: number;
  follows: number;
  contentQuality: number;
  creatorQuality: number;
  engagementQuality: number;
  conversationQuality: number;
  shareability: number;
  saveability: number;
  watchQuality: number;
  freshness: number;
  viral: number;
  negativeFeedback: number;
  spamRisk: number;
  duplicateRisk: number;
  seen: number;
  exploration: number;
  distribution: number;
  isVideo: number;
  /* Confidence in the engagement features: 0 with no impressions at all. */
  confidence: number;
  /* v2 */
  sessionRelevance: number;
  socialRelevance: number;
  novelty: number;
  saturation: number;
  explorationValue: number;
  /* Lexical similarity to posts the person rejected. */
  similarToRejected: number;
  /* v3, optional so v2 and reels vectors are unchanged. */
  /* The author answered commenters: a real conversation, X style. */
  conversationDepth?: number;
  /* This post against its creator's own usual quality: 0.5 is usual. */
  outperformance?: number;
  /* Engagement bait wording (quality.ts baitRisk). */
  baitRisk?: number;
};

/* Predicted probabilities of what the person will do. Heuristic today. */
export type ActionPredictions = {
  like: number;
  comment: number;
  share: number;
  save: number;
  follow: number;
  profileVisit: number;
  videoWatch: number;
  videoCompletion: number;
  rewatch: number;
  notInterested: number;
  report: number;
  sessionContinuation: number;
};

/* Why a post ranked, from the features that actually drove its score. */
export type Explanation = {
  primary: ReasonCode | null;
  supporting: ReasonCode[];
};

/* Internal ranking metadata for the admin debug view. Never sent to a
   non admin browser. */
export type RankDebug = {
  tier: "unseen" | "recently_seen";
  seenAt: number | null;
  seenDepth: string | null;
  seenSource: string | null;
  seenPenalty: number;
  firstStage: number;
  penalties: Record<string, number>;
};

export type RankedItem = {
  item: ContentItem;
  score: number;
  reasons: ReasonCode[];
  sources: CandidateSource[];
  explanation?: Explanation;
  /* Kept for tests and the admin view, never sent to a browser. */
  features?: RankingFeatures;
  debug?: RankDebug;
};

export type FeedResult = {
  items: RankedItem[];
  algorithm: AlgorithmId;
  variant: string;
  experimentId: string | null;
  /* True when the ranked pool had nothing beyond this page. */
  complete: boolean;
  /* Set when a fallback served the page, with the stage that failed. */
  fallback: string | null;
};
