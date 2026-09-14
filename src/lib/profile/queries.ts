import { createClient, createAnonClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
  Every profile read lives here, so there is one place that knows which columns
  are public and which tabs a viewer is entitled to.

  There is no generated types file in this repo, so the shape is declared
  locally, the way tools/[slug]/page.tsx declares its Tool. Two things that are
  deliberately NOT in this type, because they are not in the SELECT grant and
  must never reach a page: `email`, and anything from auth.users.
*/

/* The public columns. This list is the whole public surface of a person. */
const PUBLIC_COLUMNS =
  "id, username, full_name, avatar_url, bio, location, website_url, interests, skills, is_developer, plan, created_at, follower_count, following_count, developer_profiles(handle)";

export type Profile = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website_url: string | null;
  interests: string[];
  skills: string[];
  is_developer: boolean;
  plan: "free" | "pro" | "premium";
  created_at: string;
  follower_count: number;
  following_count: number;
  /*
    Present only when this person actually became a developer: agreed to the
    terms and had a developer profile created. `is_developer` is just the UI
    preference and is NOT what the badge reads, otherwise somebody who flipped
    the switch and never agreed would wear it.
  */
  developer_profiles?: { handle: string } | null;
};

export type TabKey =
  | "posts"
  | "replies"
  | "media"
  | "reposts"
  | "liked"
  | "saved"
  | "tools"
  | "models"
  | "collections";

/*
  Which tabs this viewer may see on this profile.

  Owner only tabs are owner only in the database as well: `saves`, `likes` and
  `user_saved_tools` have no cross user select policy, so a visitor asking for
  ?tab=saved on somebody else's profile gets zero rows rather than a leak. This
  function decides what to RENDER. It is not the control, and it is not relied
  on as one.

  Collections are absent rather than empty on a free account, because
  05-pricing-plans.md prices them at zero for free. A tab that can never hold
  anything is not an empty state, it is a dead end.
*/
export function visibleTabs(isOwner: boolean, plan: Profile["plan"]): TabKey[] {
  /*
    Order is founder instruction 2026-09-14: Tools sits next to Posts, and
    Models next to Tools. What somebody uses is the point of this product, so
    it outranks what they wrote. The conversation tabs follow.
  */
  if (!isOwner) return ["posts", "replies", "media", "reposts"];

  const tabs: TabKey[] = [
    "posts", "tools", "models", "replies", "media", "reposts", "liked", "saved",
  ];
  if (plan !== "free") tabs.push("collections");
  return tabs;
}

export function isTabKey(value: string | undefined, allowed: TabKey[]): value is TabKey {
  return typeof value === "string" && (allowed as string[]).includes(value);
}

/*
  A signed out visitor reads through the anon client, which is the same path a
  crawler takes, so /u/[username] is verified against the policy anon actually
  gets rather than against a session that happens to be lying around.
*/
export async function readerFor(signedIn: boolean): Promise<SupabaseClient> {
  return signedIn ? await createClient() : createAnonClient();
}

export async function getProfileByUsername(
  db: SupabaseClient,
  username: string,
): Promise<Profile | null> {
  const { data, error } = await db
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .eq("username", username)
    .maybeSingle();

  if (error) {
    console.error("[profile] lookup failed", error.code, error.message);
    return null;
  }
  return (data as Profile | null) ?? null;
}

export async function getProfileById(
  db: SupabaseClient,
  id: string,
): Promise<Profile | null> {
  const { data, error } = await db
    .from("profiles")
    .select(PUBLIC_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[profile] lookup failed", error.code, error.message);
    return null;
  }
  return (data as Profile | null) ?? null;
}

/* Is the viewer following this person. Null when signed out. */
export async function isFollowing(
  db: SupabaseClient,
  viewerId: string | null,
  targetId: string,
): Promise<boolean> {
  if (!viewerId || viewerId === targetId) return false;
  const { data } = await db
    .from("follows")
    .select("follower_id")
    .eq("follower_id", viewerId)
    .eq("following_id", targetId)
    .maybeSingle();
  return Boolean(data);
}

export type PostRow = {
  id: string;
  body: string;
  link_url: string | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  save_count: number;
  repost_count: number;
  status: string;
};

export type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  like_count: number;
  post_id: string;
};

export type ToolRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  pricing: string | null;
};

export type ModelRow = {
  id: string;
  slug: string;
  name: string;
  provider: string | null;
  description: string | null;
};

export type CollectionRow = {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  item_count: number;
};

const POST_COLUMNS =
  "id, body, link_url, created_at, like_count, comment_count, save_count, repost_count, status";

const PAGE_SIZE = 20;

/*
  One function per tab. Each returns real rows or an empty array. Nothing here
  invents content, and nothing falls back to "popular" when a person has
  written nothing, which is the mistake the tool search made once already.
*/
export async function getTabRows(
  db: SupabaseClient,
  tab: TabKey,
  profile: Profile,
  isOwner: boolean,
): Promise<{
  posts?: PostRow[];
  comments?: CommentRow[];
  tools?: ToolRow[];
  models?: ModelRow[];
  collections?: CollectionRow[];
}> {
  switch (tab) {
    case "posts": {
      let q = db
        .from("posts")
        .select(POST_COLUMNS)
        .eq("author_id", profile.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      /* A visitor sees only visible posts. The owner also sees their hidden
         ones, because being told your post was hidden is the least a person is
         owed, and there is no notification path yet to tell them otherwise. */
      if (!isOwner) q = q.eq("status", "visible");
      const { data } = await q;
      return { posts: (data as PostRow[]) ?? [] };
    }

    case "media": {
      let q = db
        .from("posts")
        .select(POST_COLUMNS)
        .eq("author_id", profile.id)
        .is("deleted_at", null)
        .not("link_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (!isOwner) q = q.eq("status", "visible");
      const { data } = await q;
      return { posts: (data as PostRow[]) ?? [] };
    }

    case "replies": {
      let q = db
        .from("comments")
        .select("id, body, created_at, like_count, post_id")
        .eq("author_id", profile.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (!isOwner) q = q.eq("status", "visible");
      const { data } = await q;
      return { comments: (data as CommentRow[]) ?? [] };
    }

    case "reposts": {
      const { data } = await db
        .from("reposts")
        .select(`created_at, posts!inner(${POST_COLUMNS})`)
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      /* The join is what makes a repost of a removed post disappear: the inner
         join hits `posts`, and posts RLS already hides it. That is the whole
         argument for reposts being their own table. */
      const rows = (data ?? []) as unknown as { posts: PostRow }[];
      return { posts: rows.map((r) => r.posts).filter(Boolean) };
    }

    case "liked": {
      const { data } = await db
        .from("likes")
        .select(`created_at, posts!inner(${POST_COLUMNS})`)
        .eq("user_id", profile.id)
        .eq("entity_type", "post")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      const rows = (data ?? []) as unknown as { posts: PostRow }[];
      return { posts: rows.map((r) => r.posts).filter(Boolean) };
    }

    case "saved": {
      const { data } = await db
        .from("saves")
        .select(`created_at, posts!inner(${POST_COLUMNS})`)
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      const rows = (data ?? []) as unknown as { posts: PostRow }[];
      return { posts: rows.map((r) => r.posts).filter(Boolean) };
    }

    case "tools": {
      const { data } = await db
        .from("user_saved_tools")
        .select("created_at, tools!inner(id, slug, name, tagline, logo_url, pricing)")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      const rows = (data ?? []) as unknown as { tools: ToolRow }[];
      return { tools: rows.map((r) => r.tools).filter(Boolean) };
    }

    case "models": {
      const { data } = await db
        .from("user_saved_models")
        .select("created_at, models!inner(id, slug, name, provider, description)")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      const rows = (data ?? []) as unknown as { models: ModelRow }[];
      return { models: rows.map((r) => r.models).filter(Boolean) };
    }

    case "collections": {
      const { data } = await db
        .from("user_collections")
        .select("id, name, description, is_public, item_count")
        .eq("user_id", profile.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      return { collections: (data as CollectionRow[]) ?? [] };
    }
  }
}

/* The featured strip, ordered by sort_order rather than by recency. */
export async function getFeaturedTools(
  db: SupabaseClient,
  profileId: string,
): Promise<ToolRow[]> {
  const { data } = await db
    .from("profile_featured_tools")
    .select("sort_order, tools!inner(id, slug, name, tagline, logo_url, pricing)")
    .eq("profile_id", profileId)
    .order("sort_order", { ascending: true });
  const rows = (data ?? []) as unknown as { tools: ToolRow }[];
  return rows.map((r) => r.tools).filter(Boolean);
}
