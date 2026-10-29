import type { FeatureName } from "./config";

/*
  One comment with everything ranking needs, as comment_rank_features returns
  it (camel cased). Built on the server only: post_author_liked, report counts
  and the viewer's history never reach a browser, only the order they produce.
*/
export type CommentRow = {
  id: string;
  parentId: string | null;
  authorId: string;
  body: string;
  createdAt: string;
  likeCount: number;
  status: string;
  reportCount: number;
  qualifiedReportCount: number;
  author: { username: string | null; fullName: string | null; avatarUrl: string | null; status: string | null };
  isPostAuthor: boolean;
  trustedLikes: number;
  newAccountLikes: number;
  earlyLikes: number;
  likes24h: number;
  postAuthorLiked: boolean;
  viewerLiked: boolean;
  replyCount: number;
  meaningfulReplies: number;
  distinctRepliers: number;
  postAuthorReplied: boolean;
  viewerFollows: boolean;
  followsViewer: boolean;
  viewerLikedAuthor: number;
  viewerRepliedAuthor: number;
  authorRepliedViewer: number;
  viewerHid: boolean;
  viewerNotInterestedAuthor: number;
};

/* What a comment is being read against. */
export type RankContext = {
  /* Fixed for one request, so the same inputs always give the same order. */
  now: number;
  viewerId: string | null;
  postText: string;
};

export type Features = Record<FeatureName, number>;

export type PenaltyName =
  | "many_reports"
  | "links"
  | "repeated_chars"
  | "shouting"
  | "link_only"
  | "same_author_duplicate"
  | "copied_text"
  | "new_account_likes"
  | "early_burst"
  | "not_interested_author";

export type SevereReason = "not_visible" | "qualified_report" | "author_suspended";

export type Penalties = {
  applied: Partial<Record<PenaltyName, number>>;
  /* 0..PENALTY.cap, the share of the positive score removed. */
  total: number;
  severe: SevereReason | null;
};

export type Relation = "friend" | "following" | null;

/* A short, public reason code for events and analytics. Never shown to users
   as "because your friend X". */
export type ReasonCode =
  | "own"
  | "friend"
  | "following"
  | "post_author"
  | "helpful"
  | "relevant"
  | "discussed"
  | "fresh"
  | "newest";

export type Scored = {
  row: CommentRow;
  features: Features;
  contributions: Features;
  penalties: Penalties;
  positive: number;
  score: number;
  relation: Relation;
  reason: ReasonCode;
  pinned: boolean;
};
