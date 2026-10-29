/*
  Comment Intelligence v1 (comment_intelligence_v1, guide 20, D213 to D219).

  Every number here is a provisional engineering default, chosen by reasoning
  rather than measured: Celpare had 14 comments when this was written, which is
  not evidence of anything. They live in one place so changing one is an edit
  here and a version bump, never a hunt through the pipeline.
*/

export const COMMENT_ALGORITHM = "comment_intelligence_v1";

export const COMMENT_MODES = ["top", "following", "newest"] as const;
export type CommentMode = (typeof COMMENT_MODES)[number];

/* The positive score is a weighted sum of features in 0..1. The weights sum to
   1, so a comment's positive score is also in 0..1 and two versions compare. */
export const WEIGHTS = {
  relevance: 0.14,
  relationship: 0.16,
  affinity: 0.08,
  helpful: 0.18,
  replies: 0.1,
  postAuthor: 0.08,
  freshness: 0.1,
  velocity: 0.06,
  language: 0.03,
  quality: 0.07,
} as const;

export type FeatureName = keyof typeof WEIGHTS;

/* Relationship strength. A friend is a mutual follow (D123). Being followed BY
   someone is weak on purpose: it says nothing about whether you want to read them. */
export const RELATIONSHIP = { friend: 1, following: 0.7, followedBy: 0.3 } as const;

export const FEATURE = {
  /* Hours for freshness to halve. */
  freshnessHalfLifeHours: 24,
  /* Likes needed for helpful to reach one half. A smoothing prior: two likes on
     a new comment are not proof, and nothing is divided by an unknown exposure. */
  helpfulPrior: 5,
  /* A like from an account younger than seven days counts this much. */
  newAccountLikeWeight: 0.25,
  repliesPrior: 3,
  velocityPrior: 3,
  affinityScale: 6,
  /* Relevance saturates: three shared meaningful words is as good as ten. */
  relevanceScale: 2,
} as const;

/*
  Penalties are applied AFTER the positive score, multiplicatively, and never
  feed it. A friend's spam sinks exactly as far as a stranger's.
*/
export const PENALTY = {
  manyReports: 0.5,
  links: 0.4,
  repeatedChars: 0.15,
  shouting: 0.15,
  linkOnly: 0.25,
  sameAuthorDuplicate: 0.5,
  copiedText: 0.3,
  newAccountLikes: 0.3,
  earlyBurst: 0.2,
  notInterestedAuthor: 0.6,
  /* The most any combination of ordinary penalties can remove. */
  cap: 0.95,
} as const;

/* Severe means the comment is ordered after every comment without it, whatever
   its positive score: not visible, a qualified report, or a suspended author. */
export const SEVERE = { reportsForPenalty: 3, qualifiedReports: 1 } as const;

export const DIVERSITY = {
  /* The visible top section a single author or a copy may not dominate. */
  window: 10,
  perAuthor: 2,
  nearDuplicate: 0.7,
} as const;

export const LIMITS = {
  pageSize: 20,
  /* Root ids a client may send back as already shown. */
  maxSeen: 400,
  poolSize: 300,
  repliesPerPage: 400,
  /* A viewer's own comment from the last few minutes is shown first in Top, so
     posting one never looks like it vanished. */
  ownFreshMinutes: 15,
} as const;
