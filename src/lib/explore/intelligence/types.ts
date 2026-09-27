/*
  Explore Intelligence: the shared vocabulary (4BI, explore_v1, D150).

  EVERY FILE IN THIS FOLDER EXCEPT server/ IS PURE. No database, no fetch, no
  "server-only", no "@/" imports, the same rule as Community Intelligence. That
  is what lets `npm run test:algorithms` load them under Node's own test runner
  and what makes each stage replaceable.

  A CANDIDATE REFERENCES AN EXISTING ROW. There is no second description of a
  tool, a model, a post or a person anywhere in here: `refId` points at the row
  the rest of Celpare already owns, and `facts` carries only what ranking reads.

  THERE IS NO UNIVERSAL SCORE. Shared features have the same meaning for every
  entity type; each type has its own scorer; each section has its own objective.
*/

export type ExploreEntityType = "tool" | "model" | "post" | "video" | "person" | "topic" | "category";

export const ENTITY_TYPES: ExploreEntityType[] = ["tool", "model", "post", "video", "person", "topic", "category"];

/* The ranked Explore sections. Featured is editorial and never passes through
   here (D158). */
export type ExploreSectionId =
  | "for-you"
  | "trending"
  | "rising"
  | "new-and-recent"
  | "recommended-tools"
  | "recommended-models"
  | "people"
  | "topics"
  | "discussions"
  | "videos"
  | "continue-exploring";

/* Where a candidate came from. Retrieval labels some (new, trending, rising,
   popular, network); the pipeline labels the rest from the features that put
   them there (personalized, session, similar, exploration). */
export type ExploreSource =
  | "personalized"
  | "session"
  | "similar"
  | "network"
  | "new"
  | "trending"
  | "rising"
  | "popular"
  | "exploration";

/* Bucketed activity for a tool or model, from explore_entity_signals (D152). */
export type EntitySignals = {
  views24h: number;
  views7d: number;
  viewsPrev7d: number;
  viewers7d: number;
  viewersPrev7d: number;
  saves7d: number;
  savesPrev7d: number;
  reviews7d: number;
  compareAdds7d: number;
  postMentions7d: number;
  exploreImpressions30d: number;
  exploreClicks30d: number;
};

/* Counts of people the viewer follows, never who (D155, D136). */
export type NetworkProof = {
  savers: number;
  reviewers: number;
  posters: number;
  commenters: number;
  reposters: number;
  likers: number;
};

export const NO_NETWORK: NetworkProof = { savers: 0, reviewers: 0, posters: 0, commenters: 0, reposters: 0, likers: 0 };

/*
  The raw facts a scorer reads. Every field is optional because each type
  carries only its own. Numbers are real reads, never estimates: a missing
  field is absent, not zero standing in for unknown.
*/
export type ExploreFacts = {
  /* Tools */
  rating?: number | null;
  ratingCount?: number;
  /* Search's listing quality and penalty, 0..1 (search/ranking.ts). */
  listingQuality?: number;
  listingPenalty?: number;
  canonicalDomain?: string | null;
  /* Tools and models, from search_engagement */
  viewsTotal?: number;
  views30d?: number;
  saves?: number;
  reviews?: number;
  mentions?: number;
  signals?: EntitySignals;
  /* Models */
  provider?: string | null;
  family?: string | null;
  contextWindow?: number | null;
  hasPrice?: boolean;
  openWeights?: boolean | null;
  lifecycle?: string | null;
  evaluations?: number;
  verifiedEvaluations?: number;
  /* Posts and videos */
  body?: string;
  commentCount?: number;
  likeCount?: number;
  saveCount?: number;
  repostCount?: number;
  viewers?: number;
  engagementQuality?: number;
  contentQuality?: number;
  conversation?: number;
  completion?: number;
  rewatch?: number;
  shareRate?: number;
  perfScore?: number | null;
  stage?: string | null;
  spam?: number;
  bait?: number;
  duplicateOf?: string | null;
  nearDuplicateOf?: string | null;
  /* Rank in Community Intelligence's trending_v2 or rising_v2 list, 0 based. */
  trendRank?: number | null;
  risingRank?: number | null;
  /* Eligibility decided by Community Intelligence's own safety check. */
  communityEligible?: boolean;
  communityIneligibleReason?: string | null;
  toolId?: string | null;
  modelId?: string | null;
  /* People */
  mutualFollows?: number;
  followsViewer?: boolean;
  viewerFollows?: boolean;
  interaction?: number;
  recentPosts?: number;
  profileComplete?: number;
  peopleScore?: number;
  /* Topics */
  topicPosts?: number;
  topicUnits24h?: number;
  topicUnits7d?: number;
  topicParticipants24h?: number;
  topicParticipants7d?: number;
  topicVelocity?: number;
  /* Categories */
  categoryTools?: number;
  /* Everyone */
  network?: NetworkProof;
};

export type ExploreCandidate = {
  /* type:id, or category:slug */
  key: string;
  entityType: ExploreEntityType;
  refId: string;
  title: string;
  description: string | null;
  /* The creator or developer or author, for creator diversity. */
  ownerId: string | null;
  /* Prefixed interest keys: topic:, category:, tag:, provider:, modality:,
     author:, tool:, model:, term:, kind: */
  featureKeys: string[];
  /* The taxonomy key a shelf diversifies on (a topic or first category). */
  groupKey: string | null;
  createdAt: number;
  updatedAt: number;
  sources: ExploreSource[];
  facts: ExploreFacts;
};

/* Shared features, all 0..1, the same meaning for every type. */
export type ExploreFeatures = {
  personalRelevance: number;
  sessionRelevance: number;
  negative: number;
  novelty: number;
  discoveryDistance: number;
  quality: number;
  safety: number;
  freshness: number;
  popularity: number;
  momentum: number;
  attention: number;
  acceleration: number;
  networkProof: number;
  /* How strongly this candidate relates to what the viewer owns (saved,
     followed, collected): the "similar" source. */
  similarity: number;
};

export type DistanceBand = "near" | "adjacent" | "far";

/* Why an item is shown, as a code. Text lives in reasons.ts. A code is only
   produced when the feature behind it crossed its threshold. */
export type ExploreReasonCode =
  | "saved_similar"
  | "explored_topic"
  | "session_interest"
  | "interest"
  | "followed_author"
  | "network_saved"
  | "network_reviewed"
  | "network_posted"
  | "network_commented"
  | "network_reposted"
  | "trending"
  | "rising"
  | "new"
  | "exploration"
  | "mutual_follows"
  | "follows_you"
  | "shared_topics"
  | "resurfaced";

export type ExploreReason = { code: ExploreReasonCode; label: string | null; count: number | null };

/* Why a candidate is not on a shelf. What `&why=` answers. */
export type DropReason =
  | "ineligible"
  | "wrong_type"
  | "not_in_section"
  | "below_relevance_floor"
  | "below_quality_floor"
  | "source_quota"
  | "duplicate"
  | "diversity"
  | "section_full"
  | "already_trending"
  | "dismissed";

export type ExploreScored = {
  candidate: ExploreCandidate;
  features: ExploreFeatures;
  band: DistanceBand;
  /* The named parts the section objective weighed, 0..1. */
  parts: Record<string, number>;
  /* Objective sum before the gates. */
  value: number;
  /* After quality, safety and relevance gates. What orders the shelf. */
  final: number;
  primarySource: ExploreSource | null;
  reason: ExploreReason | null;
  /* Set by the placement stages, for debug. */
  exploration: boolean;
  duplicateOf: string | null;
};

export type ExploreDebugEntry = {
  key: string;
  entityType: ExploreEntityType;
  sources: ExploreSource[];
  primarySource: ExploreSource | null;
  band: DistanceBand;
  features: ExploreFeatures;
  parts: Record<string, number>;
  value: number;
  final: number;
  position: number;
  exploration: boolean;
  reason: ExploreReasonCode | null;
};

export type ExploreDrop = { key: string; reason: DropReason; detail: string | null };

export type SectionRanking = {
  section: ExploreSectionId;
  items: ExploreScored[];
  debug: ExploreDebugEntry[];
  dropped: ExploreDrop[];
  /* A true sentence when the section is empty for a known reason (thin data),
     never a claim that the platform is empty when it is not. */
  note: string | null;
};
