import type { CommentRow, RankContext } from "../types";

export const NOW = Date.parse("2026-10-29T12:00:00Z");
export const VIEWER = "viewer";
export const POST_TEXT = "Which AI coding assistant handles large TypeScript monorepos best? Cursor or Claude Code?";

export const ctx = (over: Partial<RankContext> = {}): RankContext => ({
  now: NOW,
  viewerId: VIEWER,
  postText: POST_TEXT,
  ...over,
});

export const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

let seq = 0;

export function row(over: Partial<CommentRow> = {}): CommentRow {
  seq += 1;
  const id = over.id ?? `c${String(seq).padStart(4, "0")}`;
  return {
    id,
    parentId: null,
    authorId: `author-${id}`,
    body: "A reasonable comment about something.",
    createdAt: hoursAgo(6),
    likeCount: 0,
    status: "visible",
    reportCount: 0,
    qualifiedReportCount: 0,
    author: { username: `user_${id}`, fullName: null, avatarUrl: null, status: "active" },
    isPostAuthor: false,
    trustedLikes: 0,
    newAccountLikes: 0,
    earlyLikes: 0,
    likes24h: 0,
    postAuthorLiked: false,
    viewerLiked: false,
    replyCount: 0,
    meaningfulReplies: 0,
    distinctRepliers: 0,
    postAuthorReplied: false,
    viewerFollows: false,
    followsViewer: false,
    viewerLikedAuthor: 0,
    viewerRepliedAuthor: 0,
    authorRepliedViewer: 0,
    viewerHid: false,
    viewerNotInterestedAuthor: 0,
    ...over,
  };
}

/* A comment that is on topic, well liked by established accounts and replied to. */
export const strong = (over: Partial<CommentRow> = {}) =>
  row({
    body: "Claude Code handled our TypeScript monorepo better: it reads the whole workspace and keeps types consistent across packages.",
    trustedLikes: 12,
    likeCount: 12,
    likes24h: 4,
    meaningfulReplies: 3,
    distinctRepliers: 3,
    replyCount: 3,
    ...over,
  });

/* A friend's low effort comment. */
export const friendWeak = (over: Partial<CommentRow> = {}) =>
  row({ body: "lol", viewerFollows: true, followsViewer: true, ...over });
