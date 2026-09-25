import type { InterestAction } from "./types";

/*
  The central configuration for the v2 intelligence layer: every number that
  says what a signal means, how exploration, novelty, saturation, intent and
  negative feedback behave. Nothing in here imports anything but types, so every
  module can read it without an import cycle.

  The older per module tables (DECAY in freshness.ts, DIVERSITY, VIRAL,
  TRENDING, DISTRIBUTION, SEEN, QUALITY, SAFETY, OBJECTIVES) stay beside the code
  that uses them and are gathered, read only, in registry.ts, which is what the
  debug view and future experiments read. One place to look, no second copy.

  UNITS. Signal weights are relative to one like = 1. They are normalised again
  wherever they are used (interest maps are divided by their maximum, counts are
  saturated), so a weight says "how much more than a like", never an absolute.
*/

export type SignalTier =
  | "strong_positive"
  | "medium_positive"
  | "weak"
  | "strong_negative"
  | "contextual_negative";

export type SignalSpec = { weight: number; tier: SignalTier };

/*
  What each action means. The tier is the brief's vocabulary and is what the
  tests and the debug view check; the weight is what the interest model folds.
  An impression ("seen") is weight 0: being shown something says nothing about
  wanting it (seen.ts suppresses the post; interest is untouched).
*/
export const SIGNALS: Record<InterestAction, SignalSpec> = {
  save: { weight: 2.5, tier: "strong_positive" },
  repost: { weight: 2, tier: "strong_positive" },
  comment: { weight: 2, tier: "strong_positive" },
  follow: { weight: 3, tier: "strong_positive" },
  complete: { weight: 1.5, tier: "strong_positive" },
  profile_visit: { weight: 0.8, tier: "medium_positive" },
  like: { weight: 1, tier: "medium_positive" },
  open: { weight: 0.5, tier: "medium_positive" },
  watch: { weight: 0.8, tier: "medium_positive" },
  dwell: { weight: 0.5, tier: "medium_positive" },
  video_start: { weight: 0.15, tier: "weak" },
  seen: { weight: 0, tier: "weak" },
  search: { weight: 1, tier: "medium_positive" },
  compare: { weight: 1, tier: "medium_positive" },
  ask: { weight: 0.8, tier: "medium_positive" },
  explore: { weight: 0.6, tier: "medium_positive" },
  not_interested: { weight: -3, tier: "strong_negative" },
  dislike: { weight: -2, tier: "strong_negative" },
  mute_author: { weight: -5, tier: "strong_negative" },
  mute_topic: { weight: -5, tier: "strong_negative" },
  report: { weight: -5, tier: "strong_negative" },
  skip: { weight: -0.6, tier: "contextual_negative" },
  /* feed_v3. Delivery is not interest; followed_by is a rule (mutual follows,
     interests.ts); engaged_me is half of what a comment or repost is worth the
     other way round, the reciprocal half of RealGraph style affinity. */
  served: { weight: 0, tier: "weak" },
  followed_by: { weight: 0, tier: "weak" },
  engaged_me: { weight: 1, tier: "medium_positive" },
};

/*
  Long dwell and deep watching are measured actions: the weight above applies
  in full only past these thresholds (interests.ts scales below them).
*/
export const MEASURED = {
  LONG_DWELL_MS: 20_000,
  DWELL_MIN_MS: 6_000,
  WATCH_MIN_PERCENT: 50,
} as const;

/* ------------------------------------------------------------- session */

export const SESSION = {
  /* What counts as "this sitting". */
  WINDOW_MINUTES: 45,
  HALF_LIFE_MINUTES: 20,
  /* How much session interest can add to relevance. It boosts; it never
     rewrites the long term profile (that is built separately, every request). */
  RELEVANCE_WEIGHT: 0.3,
} as const;

/* ------------------------------------------------------------- intent */

export type Intent = "browsing" | "deep_interest" | "research" | "social" | "topic_exploration";

/*
  What each inferred intent changes. Multipliers on the objective, and on the
  exploration share. Browsing is the neutral row.
*/
export const INTENT: Record<Intent, { session: number; author: number; exploration: number; novelty: number; quality: number }> = {
  browsing: { session: 1, author: 1, exploration: 1.2, novelty: 1.2, quality: 1 },
  deep_interest: { session: 1.5, author: 1, exploration: 0.6, novelty: 0.8, quality: 1.1 },
  research: { session: 1.4, author: 0.9, exploration: 0.7, novelty: 1, quality: 1.4 },
  social: { session: 1.1, author: 1.6, exploration: 0.8, novelty: 0.9, quality: 1 },
  topic_exploration: { session: 1.3, author: 0.8, exploration: 1.1, novelty: 1.3, quality: 1 },
};

export const INTENT_RULES = {
  /* Research: searching, comparing or asking, plus saving or opening. */
  RESEARCH_QUERIES: 1,
  RESEARCH_FOLLOWUPS: 1,
  /* Deep interest: this many strong actions on one topic. */
  DEEP_STRONG_ACTIONS: 2,
  /* Social: this many interactions with one creator. */
  SOCIAL_AUTHOR_ACTIONS: 3,
  /* Topic exploration: one topic from this many different creators. */
  EXPLORE_TOPIC_AUTHORS: 3,
} as const;

/* ---------------------------------------------------------- exploration */

export const EXPLORATION = {
  /* Share of a page given to exploration, before intent adjusts it. A starting
     point, not a finding: Celpare has no traffic to tune it on yet. */
  SHARE: 0.12,
  COLD_START_SHARE: 0.25,
  MAX_SHARE: 0.3,
  /* Never explore with content below this quality. */
  MIN_CONTENT_QUALITY: 0.45,
  /* What makes a good exploration pick. */
  W_ADJACENCY: 0.35,
  W_QUALITY: 0.25,
  W_FRESHNESS: 0.2,
  W_NEW_CREATOR: 0.1,
  W_MEDIA_NOVELTY: 0.1,
  /* First exploration slot, then one every N positions. */
  FIRST_SLOT: 3,
  EVERY: 6,
} as const;

/* ------------------------------------------------- novelty and saturation */

export const NOVELTY = {
  /* Recent exposure that makes a candidate feel repetitive. */
  WINDOW_HOURS: 24,
  W_TOPIC: 0.35,
  W_AUTHOR: 0.25,
  W_SEMANTIC: 0.3,
  W_MEDIA: 0.1,
  /* Exposures of one topic or creator that count as "a lot". */
  TOPIC_SCALE: 3,
  AUTHOR_SCALE: 3,
} as const;

export const SATURATION = {
  /* One topic seen or consumed this many times in the session is saturating. */
  TOPIC_THRESHOLD: 4,
  SCALE: 2,
  /* How much a saturated topic's posts are held back. Session only: the long
     term profile is untouched. */
  PENALTY: 0.5,
} as const;

/* ------------------------------------------------ feed_v3 ignores */

/*
  Passing over a post is a contextual negative, and a weak one. An impression
  says the post was on screen; with no action and almost no dwell, it was
  passed over. That is weighted by how likely the slot is to be examined at all
  (evaluation.ts examinationProbability), so a scroll past at the top of the
  feed counts more than one deep in it, where people skim. ONE IGNORE NEVER
  MOVES ANYTHING: a key needs MIN_COUNT separate ignores, the effect is capped,
  and positive interest in the same key offsets it as it does rejections.
*/
export const IGNORE = {
  /* Dwell under this, with no action, is passing over. */
  MAX_DWELL_MS: 1500,
  MIN_COUNT: 3,
  /* The most an ignore pattern can weigh against a key, 0..1. */
  CAP: 0.3,
  /* Position weighted mass that reaches the cap. */
  SCALE: 6,
  HALF_LIFE_DAYS: 7,
  WINDOW_DAYS: 21,
} as const;

/* ------------------------------------------------ feed_v3 retrieval */

/*
  Source balancing, X's mixer in miniature. Before the first stage keeps its
  best slice, no single source may hold more than MAX_SHARE of it, and the in
  network share (people you follow and people you engage with) is held between
  a floor and a ceiling that move with how many people you follow, so a person
  following two accounts is not fed a timeline of two accounts, and a person
  following hundreds still sees beyond them. A post found by several sources
  counts under the first of them in SOURCE_ORDER.
*/
export const SOURCE_QUOTA = {
  MAX_SHARE: 0.45,
  IN_NETWORK_MIN: 0.4,
  IN_NETWORK_MAX: 0.7,
  /* Follows at which the in network share reaches its maximum. */
  FOLLOWS_FOR_MAX: 150,
  FRESH_MIN: 0.1,
} as const;

/* Where a post found by several sources is counted, most specific first. */
export const SOURCE_ORDER = [
  "following",
  "author_affinity",
  "network",
  "social",
  "similar_content",
  "topic",
  "trending",
  "evergreen",
  "fresh",
  "rising",
  "exploration",
  "video",
] as const;

export const IN_NETWORK_SOURCES: ReadonlySet<string> = new Set(["following", "author_affinity"]);

/* Same story clustering (text.ts sameStory). */
export const SAME_STORY = {
  WINDOW_HOURS: 72,
  JACCARD: 0.3,
  /* Shared salient names (proper nouns, product names) needed when the two
     posts are not tagged with the same tool or model. */
  MIN_SHARED_NAMES: 1,
} as const;

/* ---------------------------------------------------- negative feedback */

/*
  Precise, not blunt. One "not interested" hides that post, and nudges its
  creator and topic a little. Rejections accumulate by count before a topic or
  creator is treated as rejected, and positive interest in the same topic or
  creator softens the effect, so one tap never erases a topic somebody reads
  every day.
*/
export const NEGATIVE = {
  /* Strength of topic or creator rejection by number of rejections (0, 1, 2, 3+). */
  LEVELS: [0, 0.15, 0.4, 0.75] as readonly number[],
  /* How far positive interest in the same key offsets rejection. */
  POSITIVE_OFFSET: 0.5,
  /* Lexical similarity to a rejected post that counts as "similar content". */
  SIMILAR_TO_REJECTED: 0.5,
  SIMILAR_PENALTY: 0.6,
  /* Rejections older than this no longer count toward the level. */
  COUNT_WINDOW_DAYS: 60,
} as const;
