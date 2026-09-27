import type { ExploreEntityType, ExploreSectionId, ExploreSource } from "./types";

/*
  Every number explore_v1 uses, in one place. These are starting values, not
  truths: a change of weight is tuning inside v1, a new stage or objective is
  explore_v2 (versions.ts). No module under this folder hard codes a weight.
*/

/* A section's objective: a weight per named part (objectives.ts). */
export type SectionObjective = Record<string, number>;

export const OBJECTIVES: Record<ExploreSectionId, SectionObjective> = {
  "for-you": { relevance: 0.3, novelty: 0.2, quality: 0.15, freshness: 0.1, discovery: 0.1, momentum: 0.1, network: 0.05 },
  trending: { attention: 0.4, audience: 0.2, engagement: 0.15, freshness: 0.15, relevance: 0.1 },
  rising: { acceleration: 0.35, growth: 0.25, quality: 0.15, freshness: 0.15, novelty: 0.1 },
  "new-and-recent": { freshness: 0.4, early: 0.2, relevance: 0.2, exploration: 0.2 },
  "recommended-tools": { relevance: 0.35, quality: 0.25, evidence: 0.15, novelty: 0.15, popularity: 0.1 },
  "recommended-models": { relevance: 0.35, evidence: 0.2, quality: 0.15, novelty: 0.15, freshness: 0.15 },
  people: { relationship: 0.35, relevance: 0.25, activity: 0.15, quality: 0.15, novelty: 0.1 },
  topics: { relevance: 0.35, momentum: 0.25, novelty: 0.2, popularity: 0.2 },
  discussions: { conversation: 0.3, relevance: 0.25, freshness: 0.15, novelty: 0.15, network: 0.15 },
  videos: { relevance: 0.25, completion: 0.25, shares: 0.15, freshness: 0.15, novelty: 0.1, creator: 0.1 },
  "continue-exploring": { similarity: 0.5, novelty: 0.25, quality: 0.25 },
};

/* Which entity types may appear in each section. */
export const SECTION_TYPES: Record<ExploreSectionId, ExploreEntityType[]> = {
  "for-you": ["tool", "model", "post", "video", "person", "topic", "category"],
  trending: ["post", "video", "tool", "model", "topic"],
  rising: ["post", "video", "tool", "model", "topic", "person"],
  "new-and-recent": ["tool", "model", "post", "video", "person"],
  "recommended-tools": ["tool"],
  "recommended-models": ["model"],
  people: ["person"],
  topics: ["topic", "category"],
  discussions: ["post"],
  videos: ["video"],
  "continue-exploring": ["tool", "model", "post", "video", "person", "topic", "category"],
};

/* How many items each shelf shows. */
export const SECTION_SIZE: Record<ExploreSectionId, number> = {
  "for-you": 12,
  trending: 10,
  rising: 10,
  "new-and-recent": 8,
  "recommended-tools": 8,
  "recommended-models": 8,
  people: 8,
  topics: 12,
  discussions: 6,
  videos: 8,
  "continue-exploring": 8,
};

/* Sections that mix entity types, where type diversity applies. */
export const MIXED_SECTIONS: ReadonlySet<ExploreSectionId> = new Set([
  "for-you",
  "trending",
  "rising",
  "new-and-recent",
  "continue-exploring",
]);

/* Sections where personal relevance gates the value (D128, brief section 35). */
export const RELEVANCE_GATED: ReadonlySet<ExploreSectionId> = new Set([
  "for-you",
  "recommended-tools",
  "recommended-models",
  "topics",
  "videos",
  "discussions",
  "continue-exploring",
]);

export const EXPLORE_V1 = {
  /* Personal relevance: a noisy or over dimensions (D128). The weight is how
     much a full match on that dimension alone is worth. */
  DIMENSION_WEIGHT: {
    topic: 0.8,
    category: 0.8,
    tag: 0.5,
    tool: 0.7,
    model: 0.7,
    author: 0.7,
    provider: 0.5,
    modality: 0.5,
    term: 0.35,
    kind: 0.2,
  } as Record<string, number>,
  /* How the horizons combine: the strongest of these per key. */
  HORIZON: { long: 1, short: 0.9, session: 1 },
  /* Negative interest scales relevance down, never to zero on its own. */
  NEGATIVE_FACTOR: 0.6,

  /* The discovery mix (D153). Band edges on discoveryDistance. */
  MIX: { near: 0.7, adjacent: 0.2, far: 0.1 },
  BAND_EDGES: { near: 0.34, adjacent: 0.67 },
  /* Adjacency counts for less than a direct match, and alone can never reach
     the near band: 0.6 caps its closeness at 0.6, a distance of 0.4. */
  ADJACENT_FACTOR: 0.6,
  /* Exploration picks must reach these unless the viewer is cold. */
  EXPLORATION_MIN_QUALITY: 0.35,
  EXPLORATION_MIN_RELEVANCE: 0.05,

  /* The relevance gate: final = value * (FLOOR + (1 - FLOOR) * relevance) on
     gated sections for a viewer with a profile. */
  RELEVANCE_GATE_FLOOR: 0.55,
  /* Below this relevance a candidate may still appear, but only as exploration. */
  RELEVANCE_FLOOR: 0.05,
  /* The quality gate: under the floor the value is multiplied by this. */
  QUALITY_FLOOR: 0.25,
  QUALITY_PENALTY: 0.5,
  /* A candidate whose safety is at or under this is never shown. */
  SAFETY_BLOCK: 0.3,

  /* Novelty (novelty.ts). */
  NOVELTY: {
    SERVED: 0.7,
    SERVED_RECOVER_HOURS: 72,
    CLICKED: 0.25,
    CLICKED_HALF_LIFE_DAYS: 14,
    OWNED: 0.1,
    OWNED_HALF_LIFE_DAYS: 30,
    /* A dismiss holds the item back for this long, then decays. */
    DISMISS_HALF_LIFE_DAYS: 21,
    NEW_TERRITORY_BONUS: 0.15,
  },

  /* Freshness half lives, in hours, per type. */
  HALF_LIFE_HOURS: {
    tool: 24 * 60,
    model: 24 * 45,
    post: 48,
    video: 72,
    person: 24 * 30,
    topic: 24 * 7,
    category: 24 * 365,
  } as Record<ExploreEntityType, number>,

  /* New and recently added: how new counts as new, per type, in days. */
  NEW_WINDOW_DAYS: { tool: 14, model: 30, post: 7, video: 7, person: 14, topic: 14, category: 0 } as Record<ExploreEntityType, number>,
  NEW_PER_TYPE: 3,
  /* For you on the All tab: no single type (topics and categories counted
     together) takes more than this many of the twelve places. */
  FOR_YOU_PER_TYPE: 3,

  /* Trending and rising for tools, models and topics (momentum.ts). */
  TREND: {
    MIN_UNIQUE: 3,
    MIN_UNIQUE_RISING: 2,
    /* Weights of the recent units: a save is worth more than a view. */
    UNIT: { view24h: 1, save7d: 3, review7d: 4, compare7d: 2, mention7d: 2 },
    /* Prior pulling a small sample toward the type's median rate. */
    PRIOR_WEIGHT: 5,
    /* Acceleration smoothing, the k in (recent + k) / (previous + k). */
    ACCEL_K: 2,
    /* Acceleration above this counts as rising. */
    RISING_MIN: 1.3,
    /* Posts: the list positions from trending_v2 and rising_v2 map to 0..1. */
    POST_LIST: 20,
  },

  /* Candidate source quotas, as a share of a section's size (D153, brief 26). */
  SOURCE_QUOTA: {
    personalized: 0.6,
    session: 0.5,
    similar: 0.4,
    network: 0.3,
    new: 0.3,
    trending: 0.3,
    rising: 0.25,
    popular: 0.5,
    exploration: 0.2,
  } as Record<ExploreSource, number>,

  /* Diversity (diversity.ts). */
  DIVERSITY: {
    MAX_TYPE_RUN: 2,
    MAX_PER_GROUP: 3,
    MAX_PER_OWNER: 2,
    MAX_PER_PROVIDER: 2,
  },

  /* Same story clustering for posts (text.ts sameStory). */
  SAME_STORY: { windowHours: 72, jaccard: 0.35, minSharedNames: 1 },

  /* Social proof thresholds (D155). Saves are enforced in the database too. */
  PROOF: { SAVERS_MIN: 2, REVIEWERS_MIN: 1, POSTERS_MIN: 1, COMMENTERS_MIN: 1, REPOSTERS_MIN: 1 },

  /* Reasons need their feature to cross these. */
  REASON: { INTEREST: 0.35, SESSION: 0.3, SIMILAR: 0.3 },

  /* Session: Explore events inside this window are "right now". */
  SESSION_MINUTES: 30,

  /* How many seeds Continue exploring follows. */
  CONTINUE_SEEDS: 3,
} as const;

export type ExploreConfig = typeof EXPLORE_V1;
