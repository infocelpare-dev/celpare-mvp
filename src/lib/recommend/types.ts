/*
  The Tool & Model Recommendation Engine: its vocabulary (4BK, D173).

  THIS ENGINE RECOMMENDS TOOLS AND MODELS ONLY. Posts, videos, reels, people and
  topics belong to Content Recommendation Intelligence (community/intelligence and
  explore_v1's content shelves), which this folder never imports a ranker from
  and never changes. Only generic math is shared.

  EVERY FILE IN THIS FOLDER EXCEPT server/ IS PURE: no database, no fetch, no
  "server-only", no "@/" imports. That is what lets `npm run test:algorithms` load
  it under Node's own runner, the same rule as the other intelligence folders.

  THERE IS NO UNIVERSAL SCORE (D179). Each strategy weighs its own named parts, and
  no score field leaves the engine: a result carries its rank, its parts and its
  reason, never a number someone could read as "how good this tool is".
*/

export type EntityType = "tool" | "model";

export type EntityRef = { type: EntityType; id: string };

export const refKey = (r: EntityRef): string => `${r.type}:${r.id}`;

export type Surface = "tool_profile" | "model_profile" | "explore" | "search" | "ask" | "compare";

export const SURFACES: Surface[] = ["tool_profile", "model_profile", "explore", "search", "ask", "compare"];

export type Strategy = "similar" | "alternative" | "personalized" | "contextual" | "fit" | "related";

export const STRATEGIES: Strategy[] = ["similar", "alternative", "personalized", "contextual", "fit", "related"];

/* ---------------------------------------------------------------- values */

/* A value we have, or the honest reason we do not. Never 0 standing in for
   unknown (D164 applied here, D182). */
export type Known<T> = { value: T };
export type Missing = "not_recorded" | "not_measured";
export type Maybe<T> = Known<T> | Missing;

export const known = <T>(value: T): Known<T> => ({ value });
export const isKnown = <T>(m: Maybe<T>): m is Known<T> => typeof m === "object" && m !== null;

/* Where an attribute value came from. */
export type Provenance = "fact" | "listing" | "derived";

/* A named attribute value with its provenance, and the source when it is a fact. */
export type Attr = { key: string; from: Provenance; source?: string | null };

/* The attribute sets an entity can carry. A set that is absent is unknown, not
   empty: `undefined` means we do not know, `[]` means we know there is none. */
export type AttrSet =
  | "capability"
  | "usecase"
  | "category"
  | "platform"
  | "deployment"
  | "integration"
  | "modality"
  | "output_modality";

export const ATTR_SETS: AttrSet[] = [
  "capability",
  "usecase",
  "category",
  "platform",
  "deployment",
  "integration",
  "modality",
  "output_modality",
];

/* Price, in the class it was recorded in. Tool plans and token prices are never
   put on one axis (D165). */
export type PriceTier = "free" | "freemium" | "low" | "mid" | "high";
export type ToolPrice = { class: "tool"; tier: PriceTier; monthlyUsd: number | null; source: "plan" | "pricing_model" };
export type ModelPrice = { class: "model"; blendedPerM: number; inputPerM: number | null; outputPerM: number | null };

export type FactValue = { flag: boolean | null; text: string | null; number: number | null; source: string | null };

/* ------------------------------------------------------------- the entity */

export type ToolModelEntity = {
  ref: EntityRef;
  key: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  /* Tokens of the name, for resolving "Cursor" in a sentence to this entity. */
  aliases: string[];
  attrs: Partial<Record<AttrSet, Attr[]>>;
  /* compare_facts by attribute, so a recorded "no" is told apart from "not
     recorded". A constraint is violated only by a recorded no. */
  facts: Record<string, FactValue>;
  tags: string[];
  features: string[];
  /* Tools: the developer. Models: the provider, lowercased. */
  provider: string | null;
  /* The provider as the catalogue spells it, for display. */
  providerLabel: string | null;
  developerId: string | null;
  family: string | null;
  canonicalDomain: string | null;
  price: Maybe<ToolPrice | ModelPrice>;
  /* The listing's free, freemium or paid, kept raw: "paid" says there is no free
     tier even when no plan price is recorded. */
  pricingModel: string | null;
  context: Maybe<number>;
  maxOutput: Maybe<number>;
  openWeights: Maybe<boolean>;
  lifecycle: string | null;
  evaluations: number;
  verifiedEvaluations: number;
  factCount: number;
  /* 0..1: how much of the listing is filled in (logo, tagline, description,
     pricing, tags, features, categories, platforms; for models provider,
     description, context, modalities, tags, price). */
  completeness: number;
  /* 0..1 from search/ranking.ts qualityOf and penaltyOf, computed on the server. */
  listingQuality: number;
  listingPenalty: number;
  rating: number | null;
  ratingCount: number;
  verified: boolean;
  fixture: boolean;
  approved: boolean;
  createdAt: number;
  /* Bucketed activity for momentum, from explore_entity_signals. Absent when unread. */
  signals?: {
    views7d: number;
    viewsPrev7d: number;
    saves7d: number;
    compareAdds7d: number;
  };
  /* Counts of followed accounts who saved it, never who (D155). */
  networkSavers?: number;
};

/* --------------------------------------------------------- the request */

export type ConstraintKind =
  | "entity_type"
  | "usecase"
  | "budget_free"
  | "budget_max"
  | "cheaper_than"
  | "platform"
  | "deployment"
  | "open"
  | "min_context"
  | "modality"
  | "capability"
  | "term"
  | "exclude";

export type Constraint = {
  kind: ConstraintKind;
  /* The value, normalised: a goal key, a platform, a number, an entity key. */
  value: string | number;
  /* Hard constraints remove a candidate that violates them; soft ones only score. */
  hard: boolean;
  /* The words in the question that produced it, for explaining. */
  phrase: string;
};

export type RecommendationRequest = {
  surface: Surface;
  strategy: Strategy;
  /* Which types may be returned. Cross-type only through "related" or when the
     request explicitly asks for both (D176). */
  entityTypes: EntityType[];
  /* The entity being viewed, the compare set, the relevant search results. */
  seeds?: EntityRef[];
  query?: string | null;
  goal?: string | null;
  constraints?: Constraint[];
  userId?: string | null;
  sessionId?: string | null;
  limit: number;
  exclude?: EntityRef[];
  /* A section label for events, a-z and hyphens. */
  section?: string | null;
  /* Admin only: keep the debug trace, and optionally let fixtures through. */
  debug?: boolean;
  includeFixtures?: boolean;
};

/* ---------------------------------------------------------- the result */

export type SourceId =
  | "lexical_similarity"
  | "structured_similarity"
  | "same_category"
  | "same_use_case"
  | "same_capability"
  | "current_context"
  | "user_history"
  | "user_interests"
  | "search_context"
  | "co_compared"
  | "popular"
  | "new"
  | "trending"
  | "rising"
  | "exploration"
  | "cross_type"
  | "constraint";

export type RejectionCode =
  | "fixture"
  | "unavailable"
  | "safety"
  | "duplicate"
  | "low_quality"
  | "already_seen"
  | "context_gate"
  | "failed_constraint"
  | "insufficient_relevance"
  | "diversity_limit"
  | "wrong_type"
  | "seed"
  | "excluded"
  | "version_of_seed"
  | "same_developer"
  | "no_relation"
  | "dismissed"
  | "limit";

export type Rejection = { key: string; code: RejectionCode; detail: string | null };

export type ReasonCode =
  | "similar_capabilities"
  | "same_use_case"
  | "alternative_to"
  | "matches_recent_search"
  | "matches_saved_interests"
  | "compatible_with_requirements"
  | "often_compared_with"
  | "network_saved"
  | "new_in_category"
  | "made_by_provider"
  | "exploration";

export type Reason = {
  code: ReasonCode;
  /* The words the sentence needs: shared capabilities, a seed name, a count. */
  labels: string[];
  count: number | null;
};

export type ConstraintStatus = "satisfied" | "violated" | "unknown";

export type FitReport = {
  constraints: { constraint: Constraint; status: ConstraintStatus; evidence: string | null }[];
  strengths: string[];
  tradeoffs: string[];
  missing: string[];
};

export type RecItem = {
  ref: EntityRef;
  key: string;
  rank: number;
  source: SourceId;
  sources: SourceId[];
  /* The named parts this strategy weighed, 0..1. Debug and tests read these. */
  parts: Record<string, number>;
  reason: Reason | null;
  exploration: boolean;
  fit: FitReport | null;
  /* Only for "related": what connects the two, stated as the evidence. */
  relation: string | null;
};

export type DebugEntry = {
  key: string;
  sources: SourceId[];
  parts: Record<string, number>;
  value: number;
  position: number | null;
  novelty: number;
  exploration: boolean;
};

export type RecommendationResult = {
  algorithm: "tool_model_recommendation_v1";
  requestId: string;
  surface: Surface;
  strategy: Strategy;
  variant: string;
  items: RecItem[];
  rejected: Rejection[];
  /* Unresolved names from the request ("cheaper than X" where X is not ours). */
  unresolved: string[];
  debug: DebugEntry[] | null;
  /* A true sentence when the list is empty for a known reason. */
  note: string | null;
};
