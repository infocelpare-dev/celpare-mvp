import { createClient, createAnonClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POST_SELECT, type FeedPost } from "@/lib/community/queries";

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
  "id, username, full_name, avatar_url, bio, location, website_url, interests, skills, is_developer, plan, created_at, follower_count, following_count, is_private, show_replies, show_follows, show_saved_tools, show_saved_models, developer_profiles(handle)";

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
    Privacy, added 2026-09-18. These decide what RENDERS. They are not the
    control: profile_shares() in the database is, and every policy and shared
    reader calls it. Somebody who forges a request past this file still gets
    nothing back, which is verified live rather than assumed from the text.
  */
  is_private: boolean;
  show_replies: boolean;
  show_follows: boolean;
  show_saved_tools: boolean;
  show_saved_models: boolean;
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
  | "collections"
  | "recent";

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
export function visibleTabs(isOwner: boolean, profile: Profile): TabKey[] {
  /*
    Order is founder instruction 2026-09-14: Tools sits next to Posts, and
    Models next to Tools. What somebody uses is the point of this product, so
    it outranks what they wrote. The conversation tabs follow.
  */
  if (!isOwner) {
    /*
      A private account has no sections at all. The page still renders the
      picture, the name, the counts and a Follow button, and says it is
      private. Founder instruction 2026-09-18.
    */
    if (profile.is_private) return [];

    const open: TabKey[] = ["posts"];
    if (profile.show_saved_tools) open.push("tools");
    if (profile.show_saved_models) open.push("models");
    if (profile.show_replies) open.push("replies");
    open.push("media", "reposts");
    return open;
  }

  /*
    Recent sits last, and only ever here. It is the searches you ran and the
    tools you opened, which is the most sensitive thing on the account, so
    there is no setting that publishes it and no branch above that could put it
    on somebody else's profile. Founder decision 2026-09-18.
  */
  const tabs: TabKey[] = [
    "posts", "tools", "models", "replies", "media", "reposts", "liked", "saved",
  ];
  /*
    EVERY PLAN HAS COLLECTIONS NOW. Founder decision 2026-09-21: free went from
    zero to one, so the tab is no longer a dead end on a free account and the gate
    that hid it is gone with the reason for it.

    The plan is not read here at all any more, and that is the point: how many
    collections a plan allows is one number, it lives in plan_limits, and
    uc_plan_cap enforces it in the database. A copy of that rule in a function
    that decides what to RENDER is how the two drift.
  */
  tabs.push("collections");
  tabs.push("recent");
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

/* Does this person follow the viewer (4BA). Through my_follow_state, which
   answers only about edges touching the caller, so a private account that
   hides its follow list still tells you it follows YOU. */
export async function followsViewer(
  db: SupabaseClient,
  viewerId: string | null,
  targetId: string,
): Promise<boolean> {
  if (!viewerId || viewerId === targetId) return false;
  const { data, error } = await db.rpc("my_follow_state", { p_ids: [targetId] });
  if (error) {
    console.error("[profile] follow state failed", error.code, error.message);
    return false;
  }
  return Boolean((data as { follows_me: boolean }[] | null)?.[0]?.follows_me);
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

/*
  A post on a profile IS a post in the feed. Founder instruction 2026-09-19:
  the Posts tab was showing a stripped summary with no author, no media, no
  attachment and no actions, because this type and its query were written in
  4K, before the feed existed.

  So PostRow is now FeedPost, and the tabs render the same PostCard. The alias
  stays rather than being renamed across five call sites, and points at the one
  definition so the two cannot drift again.
*/
export type PostRow = FeedPost;

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

/* One thing you did: a search you ran or a tool you opened. Shaped by
   my_recent_activity, which is the only way to read either event table. */
export type RecentRow = {
  kind: "search" | "tool";
  occurred_at: string;
  label: string;
  href: string;
  detail: string | null;
};

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
  recent?: RecentRow[];
}> {
  switch (tab) {
    case "posts": {
      let q = db
        .from("posts")
        .select(POST_SELECT)
        .eq("author_id", profile.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      /* A visitor sees only visible posts. The owner also sees their hidden
         ones, because being told your post was hidden is the least a person is
         owed, and there is no notification path yet to tell them otherwise. */
      if (!isOwner) q = q.eq("status", "visible");
      const { data } = await q;
      return { posts: (data as unknown as FeedPost[]) ?? [] };
    }

    case "media": {
      /*
        MEDIA MEANS MEDIA. This filtered on `link_url is not null` until
        2026-09-19, which was right when a post could only ever carry a link
        and wrong the moment 4AE gave posts real images and video: a plain
        link post was listed under an image icon, and an actual photo was not
        listed at all.

        It filters on `kind` rather than joining post_media, because kind is
        DERIVED from the attachments by createPost and is a plain indexed
        column. The join would ask the same question the derivation already
        answered.
      */
      let q = db
        .from("posts")
        .select(POST_SELECT)
        .eq("author_id", profile.id)
        .is("deleted_at", null)
        .in("kind", ["image", "video"])
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (!isOwner) q = q.eq("status", "visible");
      const { data } = await q;
      return { posts: (data as unknown as FeedPost[]) ?? [] };
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
        .select(`created_at, posts!inner(${POST_SELECT})`)
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      /* The join is what makes a repost of a removed post disappear: the inner
         join hits `posts`, and posts RLS already hides it. That is the whole
         argument for reposts being their own table. */
      const rows = (data ?? []) as unknown as { posts: FeedPost }[];
      return { posts: rows.map((r) => r.posts).filter(Boolean) };
    }

    case "liked": {
      const { data } = await db
        .from("likes")
        .select(`created_at, posts!inner(${POST_SELECT})`)
        .eq("user_id", profile.id)
        .eq("entity_type", "post")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      const rows = (data ?? []) as unknown as { posts: FeedPost }[];
      return { posts: rows.map((r) => r.posts).filter(Boolean) };
    }

    case "saved": {
      const { data } = await db
        .from("saves")
        .select(`created_at, posts!inner(${POST_SELECT})`)
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      const rows = (data ?? []) as unknown as { posts: FeedPost }[];
      return { posts: rows.map((r) => r.posts).filter(Boolean) };
    }

    /*
      Saved tools and models read two different ways, and the reason is the
      `note` column.

      A save can carry a private annotation: "too expensive", "ask legal", "the
      one that broke the build". `note` is in the SELECT column grant, and a
      column grant is role wide and cannot be narrowed per row, so widening the
      row policy to publish a shared list would publish the notes with it.
      Somebody switching on "show my saved tools" is publishing a list of
      tools, not their diary.

      So the owner reads the table, notes and all, and everybody else reads
      public_saved_tools, which is SECURITY DEFINER, checks profile_shares()
      and has no note column to return. anon holds no grant on either table.
    */
    case "tools": {
      if (!isOwner) {
        const { data, error } = await db.rpc("public_saved_tools", {
          p_owner: profile.id,
          p_limit: PAGE_SIZE,
        });
        if (error) console.error("[profile] shared tools failed", error.code, error.message);
        return { tools: (data as ToolRow[]) ?? [] };
      }
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
      if (!isOwner) {
        const { data, error } = await db.rpc("public_saved_models", {
          p_owner: profile.id,
          p_limit: PAGE_SIZE,
        });
        if (error) console.error("[profile] shared models failed", error.code, error.message);
        return { models: (data as ModelRow[]) ?? [] };
      }
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

    /*
      Recent is the one tab that does not read a table.

      search_events and tool_view_events are ungranted to anon and to
      authenticated, on purpose: they are the analytics tables, and a client
      that can filter them can also count somebody else's. my_recent_activity
      is SECURITY DEFINER and answers only for auth.uid(), so there is no
      profile.id to pass and no way to ask for another person's history.

      That is also why isOwner is not consulted here. It cannot leak: the
      database returns the CALLER's rows regardless of whose profile is being
      rendered. visibleTabs keeps the tab off other people's profiles, and this
      would return the viewer's own list rather than theirs even if it did not.
    */
    case "recent": {
      if (!isOwner) return { recent: [] };
      const { data, error } = await db.rpc("my_recent_activity", { p_limit: PAGE_SIZE });
      if (error) {
        console.error("[profile] recent failed", error.code, error.message);
        return { recent: [] };
      }
      return { recent: (data as RecentRow[]) ?? [] };
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

/*
  Who follows somebody, and who they follow. Founder instruction 2026-09-19:
  the counts were text, and a count you cannot open is a fact with no answer
  behind it.

  RLS IS THE CONTROL AND IT IS STRICTER THAN THE LABEL, which is worth knowing
  before reading an empty list as a bug. follows_select_all admits a row when
  the reader is either side of it, OR when BOTH profiles share follows. So:

  - Your own lists always come back in full, because you are one side of every
    row in them.
  - A stranger reading somebody else's list gets only the rows where the person
    on the other end also shares. A follower who has gone private is absent
    rather than rendered as a locked placeholder, because a placeholder would
    republish the fact that they follow, which is the thing being hidden.

  The count on the profile is a plain column on `profiles` and is not filtered
  the same way, so a list can be shorter than the number above it. That gap is
  real and is G46 rather than something this query should paper over by
  inventing rows it cannot read.
*/
export type FollowPerson = {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

const FOLLOW_PERSON_COLUMNS = "id, username, full_name, avatar_url, bio";

export async function getFollowers(
  db: SupabaseClient,
  profileId: string,
): Promise<FollowPerson[]> {
  const { data } = await db
    .from("follows")
    /* Spelled with the constraint name. `follows` has two foreign keys into
       profiles, so an unqualified embed is a runtime error PostgREST reports
       and TypeScript cannot see, the same trap POST_SELECT documents. */
    .select(`created_at, person:profiles!follows_follower_id_fkey(${FOLLOW_PERSON_COLUMNS})`)
    .eq("following_id", profileId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = (data ?? []) as unknown as { person: FollowPerson | null }[];
  return rows.map((r) => r.person).filter((p): p is FollowPerson => Boolean(p));
}

export async function getFollowing(
  db: SupabaseClient,
  profileId: string,
): Promise<FollowPerson[]> {
  const { data } = await db
    .from("follows")
    .select(`created_at, person:profiles!follows_following_id_fkey(${FOLLOW_PERSON_COLUMNS})`)
    .eq("follower_id", profileId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  const rows = (data ?? []) as unknown as { person: FollowPerson | null }[];
  return rows.map((r) => r.person).filter((p): p is FollowPerson => Boolean(p));
}
