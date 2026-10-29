import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { getComments, getLikedComments, type Comment, type FeedPost } from "@/lib/community/queries";
import { buildThread, type CommentNode } from "@/lib/community/thread";
import { COMMENT_ALGORITHM, LIMITS, type CommentMode } from "../config";
import { debugRows, type DebugRow } from "../explain";
import { rankReplies, rankRoots, takePage, type NewestCursor } from "../rank";
import type { CommentRow, ReasonCode, Relation, Scored } from "../types";

/*
  Comment Intelligence v1, the server half (guide 20).

  WHO READS WHAT (D216, after D125). The ranking functions are EXECUTE for the
  service role only, because their rows carry things no browser may see: report
  counts, whether the post author liked a comment, the viewer's own history.
  This module is the only caller. The viewer id comes from the verified session
  (getUser), never from a request body, and the functions re-apply the
  comments_select_auth rule for that viewer. What leaves the server is the
  order, public comment fields, the viewer's own relation to each author, and,
  for an admin who asked, the debug rows.

  NO CACHE (D219). Threads are small and the result is personal, so each
  request ranks afresh: a follow, a hide, a removal or a deletion is reflected
  on the very next read, and there is nothing to invalidate.
*/

export type RankedComment = Comment & {
  relation: Relation;
  /* Position of a root in the whole ranked list, for impression events; null on replies. */
  position: number | null;
  reason: ReasonCode;
};

export type CommentPage = {
  algorithm: string;
  mode: CommentMode;
  nodes: CommentNode<RankedComment>[];
  likedIds: string[];
  /* Root ids shown so far, this page included. The client sends them back for the next page. */
  seen: string[];
  next: NewestCursor | null;
  hasMore: boolean;
  /* Every comment the viewer may see on the post, replies included. */
  total: number;
  debug: DebugRow[] | null;
};

type RpcRow = {
  id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
  like_count: number;
  status: string;
  report_count: number;
  qualified_report_count: number;
  author_username: string | null;
  author_full_name: string | null;
  author_avatar_url: string | null;
  author_status: string | null;
  is_post_author: boolean;
  trusted_likes: number;
  new_account_likes: number;
  early_likes: number;
  likes_24h: number;
  post_author_liked: boolean;
  viewer_liked: boolean;
  reply_count: number;
  meaningful_replies: number;
  distinct_repliers: number;
  post_author_replied: boolean;
  viewer_follows: boolean;
  follows_viewer: boolean;
  viewer_liked_author: number;
  viewer_replied_author: number;
  author_replied_viewer: number;
  viewer_hid: boolean;
  viewer_not_interested_author: number;
};

export function toRow(r: RpcRow): CommentRow {
  return {
    id: r.id,
    parentId: r.parent_id,
    authorId: r.author_id,
    body: r.body,
    createdAt: r.created_at,
    likeCount: r.like_count ?? 0,
    status: r.status,
    reportCount: r.report_count ?? 0,
    qualifiedReportCount: r.qualified_report_count ?? 0,
    author: {
      username: r.author_username,
      fullName: r.author_full_name,
      avatarUrl: r.author_avatar_url,
      status: r.author_status,
    },
    isPostAuthor: r.is_post_author,
    trustedLikes: r.trusted_likes ?? 0,
    newAccountLikes: r.new_account_likes ?? 0,
    earlyLikes: r.early_likes ?? 0,
    likes24h: r.likes_24h ?? 0,
    postAuthorLiked: r.post_author_liked,
    viewerLiked: r.viewer_liked,
    replyCount: r.reply_count ?? 0,
    meaningfulReplies: r.meaningful_replies ?? 0,
    distinctRepliers: r.distinct_repliers ?? 0,
    postAuthorReplied: r.post_author_replied,
    viewerFollows: r.viewer_follows,
    followsViewer: r.follows_viewer,
    viewerLikedAuthor: r.viewer_liked_author ?? 0,
    viewerRepliedAuthor: r.viewer_replied_author ?? 0,
    authorRepliedViewer: r.author_replied_viewer ?? 0,
    viewerHid: r.viewer_hid,
    viewerNotInterestedAuthor: r.viewer_not_interested_author ?? 0,
  };
}

/* What a comment is read against for relevance and language: the post's words
   and what it is about. */
export function postTextOf(post: FeedPost): string {
  return [post.body, post.tool?.name, post.tool?.tagline, post.model?.name, post.topic?.name]
    .filter(Boolean)
    .join("\n");
}

function toComment(s: Scored, postId: string, position: number | null): RankedComment {
  const r = s.row;
  return {
    id: r.id,
    post_id: postId,
    parent_id: r.parentId,
    author_id: r.authorId,
    body: r.body,
    created_at: r.createdAt,
    like_count: r.likeCount,
    status: r.status,
    author: r.author.username
      ? { id: r.authorId, username: r.author.username, full_name: r.author.fullName, avatar_url: r.author.avatarUrl }
      : null,
    relation: s.relation,
    position,
    reason: s.reason,
  };
}

export type LoadInput = {
  /* The viewer's own client (RLS), used for the visible total and the fallback. */
  reader: SupabaseClient;
  post: FeedPost;
  viewerId: string | null;
  moderator: boolean;
  mode: CommentMode;
  seen: string[];
  cursor: NewestCursor | null;
  debug: boolean;
};

export async function loadCommentPage(input: LoadInput): Promise<CommentPage> {
  const { post, viewerId, mode } = input;
  const seen = input.seen.slice(0, LIMITS.maxSeen);

  if (!hasServiceRole()) return fallback(input, await visibleTotal(input.reader, post.id));

  /* The count and the pool are independent, so they travel together: the
     database answers in milliseconds and the round trips are what cost. */
  const db = createAdminClient();
  const [total, pool] = await Promise.all([
    visibleTotal(input.reader, post.id),
    db.rpc("comment_rank_pool", {
    p_viewer: viewerId,
    p_moderator: input.moderator,
    p_post: post.id,
    p_mode: mode,
    p_exclude: mode === "newest" ? [] : seen,
    p_before: mode === "newest" ? (input.cursor?.createdAt ?? null) : null,
    p_before_id: mode === "newest" ? (input.cursor?.id ?? null) : null,
    /* Newest asks for spare rows, because visibility is applied after the limit. */
    p_limit: mode === "newest" ? LIMITS.pageSize * 3 + 1 : LIMITS.poolSize,
    }),
  ]);
  if (pool.error) {
    console.error("[comments] pool failed", pool.error.code, pool.error.message);
    return fallback(input, total);
  }

  const ctx = { now: Date.now(), viewerId, postText: postTextOf(post) };
  const rootRows = ((pool.data as RpcRow[]) ?? []).map(toRow);
  const ranked = rankRoots(rootRows, ctx, mode);
  const page = takePage(ranked, mode, mode === "newest" ? 0 : seen.length);

  let replies: Scored[] = [];
  if (page.roots.length > 0) {
    const res = await db.rpc("comment_rank_replies", {
      p_viewer: viewerId,
      p_moderator: input.moderator,
      p_post: post.id,
      p_roots: page.roots.map((s) => s.row.id),
      p_limit: LIMITS.repliesPerPage,
    });
    if (res.error) {
      console.error("[comments] replies failed", res.error.code, res.error.message);
    } else {
      const replyRows = ((res.data as RpcRow[]) ?? []).map(toRow);
      const bodies = new Map<string, string>([...rootRows, ...replyRows].map((r) => [r.id, r.body]));
      replies = rankReplies(replyRows, ctx, mode, bodies);
    }
  }

  const offset = mode === "newest" ? input.seen.length : seen.length;
  const comments = [
    ...page.roots.map((s, i) => toComment(s, post.id, offset + i)),
    ...replies.map((s) => toComment(s, post.id, null)),
  ];

  return {
    algorithm: COMMENT_ALGORITHM,
    mode,
    nodes: buildThread(comments),
    likedIds: [...page.roots, ...replies].filter((s) => s.row.viewerLiked).map((s) => s.row.id),
    seen: [...input.seen, ...page.roots.map((s) => s.row.id)].slice(0, LIMITS.maxSeen),
    next: page.next,
    hasMore: page.hasMore,
    total,
    debug: input.debug ? debugRows([...page.roots, ...replies]) : null,
  };
}

/* Through the viewer's own client, so the count is exactly what RLS lets them see. */
async function visibleTotal(reader: SupabaseClient, postId: string): Promise<number> {
  const { count, error } = await reader
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId)
    .is("deleted_at", null);
  if (error) {
    console.error("[comments] count failed", error.code, error.message);
    return 0;
  }
  return count ?? 0;
}

/*
  Without the service role (a local setup without the key) the thread still
  works: the old read, oldest first, in one page. Never personalised, never
  ranked, and it says so in the algorithm field.
*/
async function fallback(input: LoadInput, total: number): Promise<CommentPage> {
  const comments = await getComments(input.reader, input.post.id);
  const liked = await getLikedComments(input.reader, input.viewerId, comments.map((c) => c.id));
  const ranked: RankedComment[] = comments.map((c, i) => ({
    ...c,
    relation: null,
    position: c.parent_id ? null : i,
    reason: "newest",
  }));
  return {
    algorithm: "chronological_fallback",
    mode: input.mode,
    nodes: buildThread(ranked),
    likedIds: [...liked],
    seen: [],
    next: null,
    hasMore: false,
    total,
    debug: null,
  };
}
