"use server";

import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getPost, readerFor } from "@/lib/community/queries";
import { COMMENT_MODES } from "@/lib/comments/intelligence/config";
import { loadCommentPage, type CommentPage } from "@/lib/comments/intelligence/server/engine";
import { recordCommentEvents } from "@/lib/comments/intelligence/server/events";

/*
  Read one page of a post's comments, in Top, Following or Newest.

  WHY AN ACTION AND NOT A ROUTE. The video viewer opens comments in a sheet over
  the video, and both surfaces page with "Show more comments", so the data has to
  arrive after the page has rendered. Nothing here writes, and an action keeps
  the types shared with the server rendered post page.

  IT WIDENS NOTHING. The post is read through the viewer's own client, so a post
  they may not see returns an empty page. The viewer id comes from the session,
  and the ranking functions apply the comment policy for that viewer (guide 20).
*/

export type ThreadResult = CommentPage & {
  viewerId: string | null;
  signedIn: boolean;
};

const UUID = z.string().uuid();

const pageSchema = z.object({
  postId: UUID,
  mode: z.enum(COMMENT_MODES),
  seen: z.array(UUID).max(400),
  cursor: z
    .object({ createdAt: z.string().datetime({ offset: true }), id: UUID })
    .nullable(),
});

const EMPTY: ThreadResult = {
  algorithm: "comment_intelligence_v1",
  mode: "top",
  nodes: [],
  likedIds: [],
  seen: [],
  next: null,
  hasMore: false,
  total: 0,
  debug: null,
  viewerId: null,
  signedIn: false,
};

/* Who is asking: from the session, never from the request. */
async function sessionViewer(): Promise<string | null> {
  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    return user?.id ?? null;
  } catch {
    /* Signed out is a perfectly good state for reading comments. */
    return null;
  }
}

async function isModerator(signedIn: boolean): Promise<boolean> {
  if (!signedIn) return false;
  try {
    const db = await createClient();
    const { data } = await db.rpc("is_moderator");
    return data === true;
  } catch {
    return false;
  }
}

export async function loadComments(input: {
  postId: string;
  mode: (typeof COMMENT_MODES)[number];
  seen?: string[];
  cursor?: { createdAt: string; id: string } | null;
}): Promise<ThreadResult> {
  if (!isSupabaseConfigured()) return EMPTY;
  const parsed = pageSchema.safeParse({
    postId: input.postId,
    mode: input.mode,
    seen: input.seen ?? [],
    cursor: input.cursor ?? null,
  });
  if (!parsed.success) return EMPTY;

  const viewerId = await sessionViewer();
  const signedIn = viewerId !== null;
  /* Following needs somebody to follow. Signed out, it is an empty list. */
  if (parsed.data.mode === "following" && !signedIn) {
    return { ...EMPTY, mode: "following" };
  }

  /* Independent reads, together: each one is a round trip to the database. */
  const reader = await readerFor(signedIn);
  const [post, moderator] = await Promise.all([getPost(reader, parsed.data.postId), isModerator(signedIn)]);
  if (!post) return { ...EMPTY, viewerId, signedIn };

  const page = await loadCommentPage({
    reader,
    post,
    viewerId,
    moderator,
    mode: parsed.data.mode,
    seen: parsed.data.seen,
    cursor: parsed.data.cursor,
    debug: false,
  });
  return { ...page, viewerId, signedIn };
}

/*
  Hide one comment for me, or hide it as Not interested (which also ranks that
  person lower for me in comments, and nowhere else). Stored as comment events
  and read back by the ranking. The comment must be one the viewer can see,
  checked through their own client, so this cannot probe for hidden ids.
*/
export async function hideComment(commentId: string, kind: "hide" | "not_interested"): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Not connected." };
  if (!UUID.safeParse(commentId).success || (kind !== "hide" && kind !== "not_interested")) {
    return { ok: false, message: "That did not work." };
  }
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, message: "Sign in first." };

  const { data, error } = await db.from("comments").select("id, post_id, author_id").eq("id", commentId).maybeSingle();
  if (error || !data) return { ok: false, message: "That comment is gone." };
  if (data.author_id === user.id) return { ok: false, message: "That is your own comment." };

  const saved = await recordCommentEvents({
    userId: user.id,
    events: [{ commentId, postId: data.post_id, event: kind }],
  });
  if (!saved) return { ok: false, message: "Could not hide that. Try again." };
  return { ok: true, message: kind === "hide" ? "Comment hidden." : "You will see less from this person in comments." };
}
