import type { SourceId, Strategy } from "./types";

/*
  Every number tool_model_recommendation_v1 uses, in one place (guide 17).

  These are starting values, not truths. A change of weight is tuning inside v1;
  a new stage, part or source is v2 (versions.ts). No module in this folder hard
  codes a weight.
*/

/* A strategy's objective: a weight per named part. */
export type Objective = Record<string, number>;

export const OBJECTIVES: Record<Strategy, Objective> = {
  similar: { hybrid: 0.45, capability: 0.15, usecase: 0.1, category: 0.05, quality: 0.1, freshness: 0.05, personal: 0.1 },
  alternative: { usecase: 0.3, capability: 0.25, compatibility: 0.15, quality: 0.15, evidence: 0.15 },
  personalized: { user: 0.35, owned: 0.2, novelty: 0.15, quality: 0.2, freshness: 0.1 },
  fit: { constraints: 0.4, query: 0.25, evidence: 0.2, quality: 0.1, preference: 0.05 },
  contextual: { context: 0.45, coCompared: 0.2, quality: 0.15, personal: 0.2 },
  related: { relation: 0.6, quality: 0.2, personal: 0.2 },
};

/* Which candidate sources each strategy may use (guide 17 section 7). */
export const STRATEGY_SOURCES: Record<Strategy, SourceId[]> = {
  similar: ["lexical_similarity", "structured_similarity", "same_category", "same_use_case", "same_capability", "co_compared", "new"],
  alternative: ["structured_similarity", "same_use_case", "same_capability", "lexical_similarity", "constraint"],
  personalized: [
    "user_interests",
    "user_history",
    "current_context",
    "search_context",
    "structured_similarity",
    "trending",
    "rising",
    "new",
    "popular",
    "exploration",
  ],
  fit: ["constraint", "search_context", "same_use_case", "same_capability", "lexical_similarity", "structured_similarity"],
  contextual: ["current_context", "structured_similarity", "lexical_similarity", "co_compared", "same_use_case"],
  related: ["cross_type", "co_compared"],
};

export const TMR_V1 = {
  /* ------------------------------------------------------- similarity */
  /* TF-IDF field weights (D175). A token's term frequency is the sum of the
     weights of the fields it appears in. */
  FIELD_WEIGHT: { name: 3, tagline: 2, features: 2, tags: 2, categories: 2, capabilities: 2, description: 1 },
  /* Per attribute set weight inside structured similarity, per type. */
  STRUCTURED_WEIGHT: {
    /* Price and reach (platform, deployment) say how you get it, not what it is:
       they weigh little here and count in an alternative's compatibility instead. */
    tool: { usecase: 3, category: 3, capability: 2, platform: 0.5, deployment: 0.5, integration: 1 },
    model: { capability: 3, usecase: 2, modality: 2, output_modality: 1, context: 1.5, price: 1, openWeights: 0.5, deployment: 0.5 },
  },
  /* The hybrid mix of lexical and structured, per type pair. */
  HYBRID: { tool: { lexical: 0.4, structured: 0.6 }, model: { lexical: 0.3, structured: 0.7 } },

  /* ---------------------------------------------------- relationships */
  /* A substitute needs at least this hybrid similarity and a shared use case or
     category. */
  SUBSTITUTE_MIN: 0.2,
  /* Two models from one provider whose names share this much are one line. */
  VERSION_NAME_JACCARD: 0.5,
  /* Two tools whose recorded categories do not overlap are different kinds of
     thing: their similarity is scaled by this. */
  CATEGORY_MISMATCH: 0.5,

  /* --------------------------------------------------- co-occurrence */
  /* Distinct people for a pair to count (also enforced in the database), and
     the people needed before the reason "Often compared with" is shown. */
  COOCCUR_MIN_PEOPLE: 2,
  COOCCUR_REASON_PEOPLE: 3,
  /* Shrinkage: lift = people / (people + K), so two people are worth less than
     twenty. */
  COOCCUR_K: 4,

  /* -------------------------------------------------------- the user */
  /* Interest weight per event (D178). Impressions are never interest. */
  EVENT_WEIGHT: {
    save: 3,
    compare_add: 2,
    open: 1,
    click: 1,
    like: 2,
    follow: 2,
    search_click: 0.75,
    query_term: 0.5,
    impression: 0,
  } as Record<string, number>,
  /* Negative evidence, on the item and weakly on its taxonomy. */
  NEGATIVE: { not_interested: 1, dismiss: 0.6, dislike: 0.8, taxonomy: 0.3, halfLifeDays: 30 },
  /* Impressions with no click that count as ignoring, position aware: an
     impression below this position never counts. */
  IGNORE: { minImpressions: 3, maxPosition: 5 },
  LONG_HALF_LIFE_DAYS: 45,
  RECENT_DAYS: 7,
  RECENT_HALF_LIFE_DAYS: 3,
  SESSION_MINUTES: 30,
  SESSION_HALF_LIFE_MINUTES: 15,
  /* A cold user: less evidence than this and no session. */
  COLD_EVIDENCE: 3,

  /* ------------------------------------------------------- the gates */
  /* Personalized: with a context (seed, query, session intent), a candidate less
     related than this to it is rejected before personal relevance is read (D180). */
  CONTEXT_FLOOR: 0.2,
  /* Relevance floors: below these a candidate is not recommended. */
  RELEVANCE_FLOOR: { similar: 0.2, alternative: 0.15, personalized: 0.05, fit: 0.05, contextual: 0.2, related: 0.3 } as Record<Strategy, number>,
  /* Listing penalty at or above this is a safety drop. */
  PENALTY_BLOCK: 0.5,
  /* Completeness under this (fewer than half the listing fields) is a low quality drop. */
  QUALITY_FLOOR: 0.5,
  /* Model lifecycles that are no longer available. */
  UNAVAILABLE_LIFECYCLES: ["deprecated", "retired", "sunset", "discontinued"],

  /* ------------------------------------------------------- diversity */
  /* Relevance share in MMR. Under about 0.7 the similarity penalty (up to 0.3)
     outweighs real relevance gaps and a video session gets music tools. */
  MMR_LAMBDA: { similar: 0.75, alternative: 0.7, personalized: 0.75, fit: 0.8, contextual: 0.8, related: 0.85 } as Record<Strategy, number>,
  /* Hard caps per strategy. A seeded list (similar, alternative) is MEANT to stay
     in one category, so only the provider and developer caps apply there;
     capping Coding at 3 on Cursor's page would trade relevance for variety. */
  CAPS: {
    similar: { perCategory: 99, perProvider: 2, perDeveloper: 2 },
    alternative: { perCategory: 99, perProvider: 2, perDeveloper: 2 },
    personalized: { perCategory: 3, perProvider: 2, perDeveloper: 2 },
    fit: { perCategory: 4, perProvider: 2, perDeveloper: 2 },
    contextual: { perCategory: 99, perProvider: 2, perDeveloper: 2 },
    related: { perCategory: 99, perProvider: 3, perDeveloper: 3 },
  } as Record<Strategy, { perCategory: number; perProvider: number; perDeveloper: number }>,

  /* ---------------------------------------------------------- novelty */
  NOVELTY: { SERVED: 0.6, SERVED_RECOVER_HOURS: 72, OPENED: 0.35, OPENED_HALF_LIFE_DAYS: 14, SAVED_FLOOR: 0.5 },
  /* The novelty under which a personalized candidate is "already seen". */
  SEEN_FLOOR: 0.15,

  /* ------------------------------------------------------ exploration */
  /* One slot per list of at least this many, for a new or far candidate. */
  EXPLORATION_MIN_LIST: 6,
  EXPLORATION_MIN_QUALITY: 0.4,

  /* -------------------------------------------------------- freshness */
  HALF_LIFE_DAYS: { tool: 120, model: 90 },
  NEW_WINDOW_DAYS: { tool: 21, model: 30 },

  /* ---------------------------------------------------------- reasons */
  REASON: { SHARED_CAPABILITIES: 2, USECASE: 0.5, SESSION: 0.3, OWNED: 0.3, NETWORK_MIN: 2 },

  /* ------------------------------------------------------------ price */
  /* Monthly USD of the cheapest paid plan, to a tier. */
  PRICE_TIERS: { low: 15, mid: 40 },
  /* A model's blended price per million tokens: 3 input to 1 output. */
  BLEND: { input: 0.75, output: 0.25 },
  /* "cheap" for models, per million blended. */
  CHEAP_MODEL_PER_M: 2,

  /* ---------------------------------------------------------- caching */
  INDEX_TTL_SECONDS: 600,
  ANON_RESULT_TTL_SECONDS: 60,
  /* Off until a round trip from the deployed region is measured (D170). */
  REDIS: false,

  /* ------------------------------------------------------ search (D181) */
  SEARCH_TIE_RATIO: 0.05,
} as const;

export type TmrConfig = typeof TMR_V1;
