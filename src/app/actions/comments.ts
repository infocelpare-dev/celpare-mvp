"use server";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  getComments,
  getLikedComments,
  readerFor,
} from "@/lib/community/queries";
import { buildThread, type CommentNode } from "@/lib/community/thread";

/*
  Read one post's whole thread, for a surface that is not a page.

  WHY AN ACTION AND NOT A ROUTE. The video viewer opens comments in a sheet over
  the video rather than navigating away, so the data has to arrive after the page
  has rendered. Nothing here writes, so there is no CSRF surface to worry about,
  and an action keeps the types shared with the server rendered post page instead
  of inventing a JSON contract that only this one caller understands.

  IT WIDENS NOTHING. The reader is the same readerFor the post page uses, so a
  signed out visitor reads through anon and gets exactly what the policies allow:
  comments_select_anon already tests the post is visible AND profile_shares on the
  comment's author. A private account's replies do not appear here for the same
  reason they do not appear there.
*/

export type ThreadResult = {
  nodes: CommentNode[];
  likedIds: string[];
  viewerId: string | null;
  signedIn: boolean;
  /* Everything the viewer may see, replies included. Not posts.comment_count,
     which counts rows this person may not be allowed to read. */
  total: number;
};

const EMPTY: ThreadResult = {
  nodes: [],
  likedIds: [],
  viewerId: null,
  signedIn: false,
  total: 0,
};

export async function loadCommentThread(postId: string): Promise<ThreadResult> {
  if (!isSupabaseConfigured()) return EMPTY;

  /* A uuid or nothing. Cheaper than zod for one field and the database would
     refuse a malformed id anyway. */
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return EMPTY;

  let signedIn = false;
  let viewerId: string | null = null;

  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    signedIn = Boolean(user);
    viewerId = user?.id ?? null;
  } catch {
    /* Signed out is a perfectly good state for reading comments. */
  }

  const reader = await readerFor(signedIn);
  const comments = await getComments(reader, postId);

  const likedIds = signedIn
    ? [
        ...(await getLikedComments(
          reader,
          viewerId,
          comments.map((c) => c.id),
        )),
      ]
    : [];

  const nodes = buildThread(comments);

  return {
    nodes,
    likedIds,
    viewerId,
    signedIn,
    /* The flat length, not a walk of the tree: every comment that came back is
       one the viewer may see, whether it is a root or a reply. */
    total: comments.length,
  };
}
