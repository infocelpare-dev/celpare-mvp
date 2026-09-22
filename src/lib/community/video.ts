import type { SupabaseClient } from "@supabase/supabase-js";
import { POST_SELECT, normalisePost, type FeedPost, type PostMedia } from "./queries";
import { RANKING } from "./ranking";

/*
  The video posts behind the vertical viewer.

  THERE IS NO RANKING IN HERE, DELIBERATELY. The brief is explicit that the
  recommendation algorithm is not being built yet, so this reuses the feed's
  existing ordering and nothing else: newest first, exactly what `New` gives,
  with the same visibility filters every other feed query applies.

  WHAT THIS FILE IS FOR IS THE SHAPE, NOT THE ORDER. The viewer takes a
  VideoPost[] and does not care where the list came from, so the later work of
  ranking, personalising or scoping to Following replaces this one function and
  touches nothing in the player. That separation is the point of the file
  existing at all rather than the query living in the page.
*/

/* A post that is known to have a video, with the video hoisted out of the media
   array so the player never has to search for it or handle the absent case. */
export type VideoPost = FeedPost & { video: PostMedia };

/* The first video attached to a post, or null. A post carries at most one, which
   tg_post_media_cap enforces, so `find` is the whole of the rule. */
export function videoOf(post: FeedPost): PostMedia | null {
  return post.media.find((m) => m.media_kind === "video") ?? null;
}

export function hasVideo(post: FeedPost): boolean {
  return videoOf(post) !== null;
}

/*
  Narrow a list of posts to the ones carrying a video.

  Used by the feed page so entering the viewer from a card costs no extra query:
  the posts are already on the server, and the viewer's list is the same objects
  filtered. That is also what makes the order match what the person was looking
  at, which is the whole reason tapping a video feels continuous rather than
  like being thrown somewhere else.
*/
export function toVideoPosts(posts: FeedPost[]): VideoPost[] {
  const out: VideoPost[] = [];
  for (const post of posts) {
    const video = videoOf(post);
    if (video) out.push({ ...post, video });
  }
  return out;
}

/*
  Video posts straight from the database, for arriving at the viewer directly by
  URL rather than through the feed.

  AN INNER JOIN ON post_media, NOT A FILTER AFTERWARDS. `media:post_media!inner(...)`
  makes the database return only posts that have a media row, and the media_kind
  filter applies to the joined rows, so a post with four images never crosses the
  wire to be discarded here. Fetching PAGE_SIZE posts and finding two of them
  have video would be the N+1 of pagination: a page that is mostly empty.

  It reads through whichever client the caller hands it, so a signed out visitor
  gets exactly what anon's policies allow and nothing is widened for this surface.
*/
export async function getVideoPosts(
  db: SupabaseClient,
  options: { limit?: number } = {},
): Promise<VideoPost[]> {
  const limit = Math.max(1, Math.min(options.limit ?? RANKING.PAGE_SIZE, 50));

  const { data, error } = await db
    .from("posts")
    .select(POST_SELECT.replace("media:post_media(", "media:post_media!inner("))
    .eq("status", "visible")
    .is("deleted_at", null)
    .eq("post_media.media_kind", "video")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[community] video feed failed", error.code, error.message);
    return [];
  }

  return toVideoPosts(((data as unknown as FeedPost[]) ?? []).map(normalisePost));
}

/*
  The list, with one post guaranteed to be in it and first.

  Opening /community/video/<id> has to show THAT video, even when it is old
  enough to have fallen outside the window, or the link somebody shared lands on
  somebody else's video. So the requested post is fetched on its own and put at
  the front, and the rest follow in feed order with it removed from its natural
  place rather than appearing twice.
*/
export async function getVideoPostsStartingAt(
  db: SupabaseClient,
  postId: string,
  options: { limit?: number } = {},
): Promise<VideoPost[]> {
  const [list, first] = await Promise.all([
    getVideoPosts(db, options),
    getVideoPost(db, postId),
  ]);

  if (!first) return list;
  return [first, ...list.filter((p) => p.id !== first.id)];
}

/*
  What the viewer has already done that the FEED does not need to know.

  ViewerState carries liked and saved, because a feed card shows both. It does
  not carry reposts or follows, and widening it would put two more queries on
  every render of /community for controls that are not there. So the viewer reads
  its own extra state here, and the cost stays on the surface that needs it.

  BOTH READ THROUGH THE CALLER'S CLIENT. follows_select_all lets a person read
  rows where they are the follower whatever the other account's privacy says, and
  reposts is theirs, so neither of these widens anything: a signed out visitor
  gets two empty sets because that is what the policies return.
*/
export type VideoViewerState = {
  reposted: Set<string>;
  /* Author ids, not post ids. Following is a fact about a person. */
  following: Set<string>;
};

export const EMPTY_VIDEO_VIEWER_STATE: VideoViewerState = {
  reposted: new Set<string>(),
  following: new Set<string>(),
};

export async function getVideoViewerState(
  db: SupabaseClient,
  viewerId: string | null,
  posts: VideoPost[],
): Promise<VideoViewerState> {
  if (!viewerId || posts.length === 0) return EMPTY_VIDEO_VIEWER_STATE;

  const postIds = posts.map((p) => p.id);
  const authorIds = [...new Set(posts.map((p) => p.author_id))];

  const [reposts, follows] = await Promise.all([
    db.from("reposts").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
    db
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId)
      .in("following_id", authorIds),
  ]);

  if (reposts.error) {
    console.error("[community] reposts failed", reposts.error.code, reposts.error.message);
  }
  if (follows.error) {
    console.error("[community] follows failed", follows.error.code, follows.error.message);
  }

  return {
    reposted: new Set(
      (reposts.data ?? []).map((r) => (r as { post_id: string }).post_id),
    ),
    following: new Set(
      (follows.data ?? []).map((r) => (r as { following_id: string }).following_id),
    ),
  };
}

/* One video post by id, or null when it does not exist, is not visible, or
   carries no video. All three are the same answer to the viewer: there is
   nothing here to play. */
export async function getVideoPost(
  db: SupabaseClient,
  postId: string,
): Promise<VideoPost | null> {
  const { data, error } = await db
    .from("posts")
    .select(POST_SELECT)
    .eq("id", postId)
    .eq("status", "visible")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[community] video post failed", error.code, error.message);
    return null;
  }
  if (!data) return null;

  const post = normalisePost(data as unknown as FeedPost);
  const video = videoOf(post);
  return video ? { ...post, video } : null;
}
