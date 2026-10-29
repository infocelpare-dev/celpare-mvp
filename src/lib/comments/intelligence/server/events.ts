import "server-only";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { COMMENT_ALGORITHM, COMMENT_MODES, type CommentMode } from "../config";

/*
  Comment events (D216), in their own table so they never reach another
  engine's analytics. Written with the service role only; the user id always
  comes from the session, never from a body. Positions and the mode are kept so
  a later learner can correct for exposure (a comment shown tenth is liked less
  for being tenth). No text, no IP, nothing about other people. Returns whether
  the write landed; callers that only log ignore it.
*/

export const COMMENT_EVENTS = ["impression", "like", "unlike", "reply", "hide", "not_interested", "report"] as const;
export type CommentEventKind = (typeof COMMENT_EVENTS)[number];

export type CommentEvent = {
  commentId: string;
  /* Looked up when absent, so an action that only knows the comment can log it. */
  postId?: string | null;
  event: CommentEventKind;
  mode?: CommentMode | null;
  position?: number | null;
  depth?: number | null;
  reason?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON = /^[a-z_]{1,40}$/;
const ALGORITHM = /^[a-z]+(_[a-z]+)*_v[0-9]+$/;

export async function recordCommentEvents(input: {
  userId: string | null;
  sessionId?: string | null;
  algorithm?: string | null;
  events: CommentEvent[];
}): Promise<boolean> {
  if (!hasServiceRole()) return false;
  const events = input.events.filter((e) => UUID.test(e.commentId)).slice(0, 60);
  if (events.length === 0) return false;

  try {
    const db = createAdminClient();

    /* One lookup for the post of every comment, and the post's author, so a
       reply by the post author is marked as one. */
    const ids = [...new Set(events.map((e) => e.commentId))];
    const { data, error } = await db
      .from("comments")
      .select("id, post_id, post:posts!comments_post_id_fkey(author_id)")
      .in("id", ids);
    if (error) {
      console.error("[comments] event lookup failed", error.code, error.message);
      return false;
    }
    const meta = new Map(
      ((data as unknown as { id: string; post_id: string; post: { author_id: string } | null }[]) ?? []).map((r) => [r.id, r]),
    );

    const algorithm = input.algorithm && ALGORITHM.test(input.algorithm) ? input.algorithm : COMMENT_ALGORITHM;
    const rows = events.flatMap((e) => {
      const m = meta.get(e.commentId);
      if (!m) return [];
      const byPostAuthor = e.event === "reply" && input.userId !== null && m.post?.author_id === input.userId;
      const reason = byPostAuthor ? "post_author" : e.reason && REASON.test(e.reason) ? e.reason : null;
      return [
        {
          user_id: input.userId,
          /* Only for somebody with no account, as the feed does. */
          session_id: input.userId ? null : (input.sessionId ?? null),
          post_id: m.post_id,
          comment_id: e.commentId,
          event: e.event,
          mode: e.mode && (COMMENT_MODES as readonly string[]).includes(e.mode) ? e.mode : null,
          position: e.position == null ? null : Math.max(0, Math.min(500, Math.trunc(e.position))),
          depth: e.depth == null ? null : Math.max(0, Math.min(200, Math.trunc(e.depth))),
          algorithm,
          reason,
        },
      ];
    });
    if (rows.length === 0) return false;
    const { error: insertError } = await db.from("comment_events").insert(rows);
    if (insertError) {
      console.error("[comments] events failed", insertError.code, insertError.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[comments] events threw", err);
    return false;
  }
}
