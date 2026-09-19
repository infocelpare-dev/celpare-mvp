import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createAnonClient } from "@/lib/supabase/server";
import { RANKING, interleaveAuthors, scoreOf, type Sort } from "./ranking";
import type { PostKind } from "./kinds";

/*
  Every community read lives here, the way every profile read lives in
  lib/profile/queries.ts. One place that knows which columns exist in the
  grant, and one place a privacy or moderation rule has to be got right.

  TWO TRAPS THIS FILE IS SHAPED AROUND, both learned the expensive way.

  1. `select *` on posts FAILS. The client grant is narrowed: anon and
     authenticated get fourteen named columns and NOT report_count or
     qualified_report_count. Selecting every column needs SELECT on every
     column, which is what took Ask Celpare's catalogue down in an earlier
     phase. So the column list below is explicit and matches the grant exactly.

  2. Privacy is already enforced underneath. Every select policy on posts,
     comments and reposts calls profile_shares(author_id, ...), so a query
     written here inherits it for free and a policy written without it does
     not. Nothing in this file re-implements privacy, and nothing in this file
     is the control.
*/

/* Matches the client SELECT grant on posts. Do not add a column to this
   string without adding it to the grant first. */
const POST_COLUMNS =
  "id, author_id, body, link_url, topic_id, created_at, like_count, comment_count, save_count, repost_count, status, kind, tool_id, model_id";

const AUTHOR_COLUMNS = "id, username, full_name, avatar_url";

/* The embedded relations, spelled with the constraint name rather than the
   table name. posts has two foreign keys into different tables and comments
   has two as well, so an ambiguous embed is a runtime error PostgREST reports
   and TypeScript cannot see. */
const POST_SELECT =
  POST_COLUMNS +
  ", author:profiles!posts_author_id_fkey(" +
  AUTHOR_COLUMNS +
  "), topic:topics!posts_topic_id_fkey(id, slug, name)" +
  ", tool:tools!posts_tool_id_fkey(id, slug, name, tagline, logo_url, pricing)" +
  ", model:models!posts_model_id_fkey(id, slug, name, provider)" +
  ", media:post_media(id, media_kind, url, width, height, sort_order)";

const COMMENT_SELECT =
  "id, post_id, author_id, body, created_at, like_count, status" +
  ", author:profiles!comments_author_id_fkey(" +
  AUTHOR_COLUMNS +
  ")";

export type Author = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type Topic = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
};

export type PostMedia = {
  id: string;
  media_kind: "image" | "video";
  url: string;
  width: number | null;
  height: number | null;
  sort_order: number;
};

export type AttachedTool = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  pricing: string | null;
};

export type AttachedModel = {
  id: string;
  slug: string;
  name: string;
  provider: string | null;
};

/* The kinds a post can BE. Defined once in ./kinds, which is also where the
   composer's list and the zod enum come from, so the three cannot drift. */
export type { PostKind } from "./kinds";

export type FeedPost = {
  id: string;
  author_id: string;
  body: string;
  link_url: string | null;
  topic_id: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  save_count: number;
  repost_count: number;
  status: string;
  kind: PostKind;
  tool_id: string | null;
  model_id: string | null;
  author: Author | null;
  topic: Pick<Topic, "id" | "slug" | "name"> | null;
  tool: AttachedTool | null;
  model: AttachedModel | null;
  media: PostMedia[];
};

export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  like_count: number;
  status: string;
  author: Author | null;
};

/* What the viewer has already done to the rows on screen, so a like renders
   filled on arrival rather than flickering after hydration. Empty for a
   signed out visitor, which is also what the policies would return. */
export type ViewerState = {
  liked: Set<string>;
  saved: Set<string>;
};

export const EMPTY_VIEWER_STATE: ViewerState = {
  liked: new Set<string>(),
  saved: new Set<string>(),
};

/*
  A signed out visitor reads through the anon client, which is the same path a
  crawler takes. That is deliberate: the public feed is verified against the
  policy anon actually gets, not against a session that happens to exist.
*/
export async function readerFor(signedIn: boolean): Promise<SupabaseClient> {
  return signedIn ? await createClient() : createAnonClient();
}

export async function getTopics(db: SupabaseClient): Promise<Topic[]> {
  const { data, error } = await db
    .from("topics")
    .select("id, slug, name, description")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[community] topics failed", error.code, error.message);
    return [];
  }
  return (data as Topic[]) ?? [];
}

export async function getTopicBySlug(
  db: SupabaseClient,
  slug: string,
): Promise<Topic | null> {
  const { data, error } = await db
    .from("topics")
    .select("id, slug, name, description")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[community] topic lookup failed", error.code, error.message);
    return null;
  }
  return (data as Topic | null) ?? null;
}

/*
  How many visible posts exist, which is the only input to whether Top is
  offered as the default. A head count, so no rows cross the wire.
*/
export async function countVisiblePosts(db: SupabaseClient): Promise<number> {
  const { count, error } = await db
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "visible")
    .is("deleted_at", null);

  if (error) {
    console.error("[community] count failed", error.code, error.message);
    return 0;
  }
  return count ?? 0;
}

export type FeedScope = "for-you" | "following";

/*
  The candidate generator.

  For You pulls the most recent CANDIDATE_WINDOW visible posts and ranks them
  in memory. That is honest at this scale and dishonest at a much larger one:
  with more posts than the window, a genuinely high scoring old post falls
  outside the candidate set and can never surface. The threshold where that
  starts to matter is written down here rather than discovered later, and the
  answer at that point is a materialised score column plus a job to refresh it,
  not a bigger window.

  Following reads the viewer's own follow rows first. follows_select_all lets
  a person read rows where they are the follower regardless of the other
  account's privacy, so this works even when everybody they follow is private.
*/
export async function getFeed(
  db: SupabaseClient,
  options: {
    sort: Sort;
    scope: FeedScope;
    viewerId: string | null;
    topicId?: string | null;
  },
): Promise<FeedPost[]> {
  const { sort, scope, viewerId, topicId } = options;

  let authorIds: string[] | null = null;

  if (scope === "following") {
    if (!viewerId) return [];

    const { data: follows, error } = await db
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId);

    if (error) {
      console.error("[community] follows failed", error.code, error.message);
      return [];
    }

    authorIds = (follows ?? []).map(
      (f) => (f as { following_id: string }).following_id,
    );
    /* Following nobody is an empty feed, not the whole feed. Falling back to
       For You here would silently lie about what the tab means. */
    if (authorIds.length === 0) return [];
  }

  let q = db
    .from("posts")
    .select(POST_SELECT)
    .eq("status", "visible")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(sort === "new" ? RANKING.PAGE_SIZE : RANKING.CANDIDATE_WINDOW);

  if (authorIds) q = q.in("author_id", authorIds);
  if (topicId) q = q.eq("topic_id", topicId);

  const { data, error } = await q;

  if (error) {
    console.error("[community] feed failed", error.code, error.message);
    return [];
  }

  const rows = (data as unknown as FeedPost[]) ?? [];

  /* New is already ordered by the database and must not be reordered: the
     diversity rule is a ranking concern, and a person who asked for newest
     first means newest first. */
  if (sort === "new") return rows.map(normalisePost);

  const now = Date.now();
  const ranked = [...rows].sort((a, b) => scoreOf(b, now) - scoreOf(a, now));
  return interleaveAuthors(ranked).slice(0, RANKING.PAGE_SIZE).map(normalisePost);
}

/*
  One post. The author's own hidden or removed post is readable by them alone,
  which posts_select_auth already allows, so this does not filter on status:
  the page decides what to say about a post that is under review.
*/
export async function getPost(
  db: SupabaseClient,
  id: string,
): Promise<FeedPost | null> {
  const { data, error } = await db
    .from("posts")
    .select(POST_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[community] post failed", error.code, error.message);
    return null;
  }
  const post = (data as unknown as FeedPost | null) ?? null;
  return post ? normalisePost(post) : null;
}

export async function getComments(
  db: SupabaseClient,
  postId: string,
): Promise<Comment[]> {
  const { data, error } = await db
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[community] comments failed", error.code, error.message);
    return [];
  }
  return (data as unknown as Comment[]) ?? [];
}

/*
  Which of these posts the viewer has liked and saved.

  Two narrow queries rather than a join, because likes and saves have no cross
  user select policy at all: the only rows that come back are the viewer's own,
  and asking for them by id keeps it that way explicitly rather than relying on
  the policy to trim a wider request.
*/
export async function getViewerState(
  db: SupabaseClient,
  viewerId: string | null,
  postIds: string[],
): Promise<ViewerState> {
  if (!viewerId || postIds.length === 0) return EMPTY_VIEWER_STATE;

  const [likes, saves] = await Promise.all([
    db
      .from("likes")
      .select("entity_id")
      .eq("user_id", viewerId)
      .eq("entity_type", "post")
      .in("entity_id", postIds),
    db
      .from("saves")
      .select("entity_id")
      .eq("user_id", viewerId)
      .eq("entity_type", "post")
      .in("entity_id", postIds),
  ]);

  if (likes.error) {
    console.error("[community] likes failed", likes.error.code, likes.error.message);
  }
  if (saves.error) {
    console.error("[community] saves failed", saves.error.code, saves.error.message);
  }

  return {
    liked: new Set(
      (likes.data ?? []).map((r) => (r as { entity_id: string }).entity_id),
    ),
    saved: new Set(
      (saves.data ?? []).map((r) => (r as { entity_id: string }).entity_id),
    ),
  };
}

/* Which comments on this page the viewer has liked. Same reasoning as above. */
export async function getLikedComments(
  db: SupabaseClient,
  viewerId: string | null,
  commentIds: string[],
): Promise<Set<string>> {
  if (!viewerId || commentIds.length === 0) return new Set<string>();

  const { data, error } = await db
    .from("likes")
    .select("entity_id")
    .eq("user_id", viewerId)
    .eq("entity_type", "comment")
    .in("entity_id", commentIds);

  if (error) {
    console.error("[community] comment likes failed", error.code, error.message);
    return new Set<string>();
  }
  return new Set((data ?? []).map((r) => (r as { entity_id: string }).entity_id));
}


/*
  PostgREST does not promise an order for an embedded list unless one is asked
  for, and an unordered gallery puts the third photo first often enough to be
  noticed and rarely enough to be missed in testing. Sorting here rather than
  per query means every surface that reads a post gets the same order, and a
  new caller cannot forget it.

  It also guarantees `media` is an array. An embed with no rows comes back as
  [], but a post selected without the embed would leave it undefined, and a
  card that maps over undefined is a 500.
*/
export function normalisePost(post: FeedPost): FeedPost {
  const media = Array.isArray(post.media) ? [...post.media] : [];
  media.sort((a, b) => a.sort_order - b.sort_order);
  return { ...post, media };
}

/*
  The tools a post can attach.

  Approved only, so a post cannot point at something withdrawn or still in
  review, and ordered by name because a person picking from a list is looking
  one up rather than browsing it.
*/
export async function getAttachableTools(
  db: SupabaseClient,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db
    .from("tools")
    .select("id, name")
    .eq("status", "approved")
    .order("name", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[community] tools lookup failed", error.code, error.message);
    return [];
  }
  return (data as { id: string; name: string }[]) ?? [];
}

/*
  The models a post can attach.

  `models` is EMPTY today, so this returns []. The composer renders no model
  option at all in that case rather than an empty dropdown, which is the same
  choice FeaturedShelf makes when nothing is featured: an empty control implies
  there should be something in it, and D30 rules out inventing one.
*/
export async function getAttachableModels(
  db: SupabaseClient,
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db
    .from("models")
    .select("id, name")
    .eq("status", "approved")
    .order("name", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[community] models lookup failed", error.code, error.message);
    return [];
  }
  return (data as { id: string; name: string }[]) ?? [];
}
