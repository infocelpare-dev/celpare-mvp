import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAnonClient, createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  Everything the public tool profile reads.

  Two clients on purpose, and the split matters.

  The TOOL and its public parts are read with the anon client, whose RLS policy
  allows status = 'approved' and nothing else. That is what makes the page
  correct for a signed out visitor and impossible to widen by accident.

  The VIEWER's own state, their reaction, their save, their review, is read
  with the session client, because those policies are all "user_id = auth.uid()".
  Nobody's reaction is ever read for anybody else: the public number comes off
  tools.like_count, which a trigger maintains.

  dislike_count is not read here at all. It is not in the client select grant.
*/

export type ToolLink = { kind: string; url: string };
export type ToolMedia = {
  id: string;
  kind: "cover" | "screenshot" | "video" | "link";
  /* Null only on a link update, which has nothing hosted to show. */
  url: string | null;
  caption: string | null;
  link_url: string | null;
  /* A launch post rather than part of the profile. These are what the
     developer announces after the tool is live; they never go through review
     and update_tool never touches them. */
  is_update: boolean;
  sort_order: number;
};

export type ToolReview = {
  id: string;
  user_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  updated_at: string;
  author: { username: string | null; full_name: string | null; avatar_url: string | null } | null;
};

export type ToolProfile = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  website_url: string | null;
  docs_url: string | null;
  logo_url: string | null;
  pricing: string | null;
  pricing_model: string | null;
  tags: string[];
  features: string[];
  platforms: string[];
  rating: number | null;
  rating_count: number;
  like_count: number;
  verified: boolean;
  status: string;
  source: string;
  developer_id: string | null;
  submitted_at: string;
  published_at: string | null;
  categories: string[];
  links: ToolLink[];
  media: ToolMedia[];
};

const TOOL_COLUMNS =
  "id, slug, name, tagline, description, website_url, docs_url, logo_url, pricing, pricing_model, tags, features, platforms, rating, rating_count, like_count, verified, status, source, developer_id, submitted_at, published_at";

export async function getToolProfile(slug: string): Promise<ToolProfile | null> {
  if (!isSupabaseConfigured()) return null;

  const db = createAnonClient();
  const { data, error } = await db
    .from("tools")
    .select(
      `${TOOL_COLUMNS}, tool_categories(categories(name)), tool_links(kind, url), tool_media(id, kind, url, caption, link_url, is_update, sort_order)`,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[tools] profile lookup failed", error.code, error.message);
    return null;
  }
  if (!data) return null;

  const row = data as unknown as ToolProfile & {
    tool_categories?: { categories?: { name: string } | null }[] | null;
    tool_links?: ToolLink[] | null;
    tool_media?: ToolMedia[] | null;
  };

  return {
    ...row,
    categories: (row.tool_categories ?? [])
      .map((tc) => tc.categories?.name)
      .filter((n): n is string => Boolean(n)),
    links: row.tool_links ?? [],
    media: (row.tool_media ?? []).sort((a, b) => a.sort_order - b.sort_order),
  };
}

/* Reviews, newest first, with the person who wrote each one. The join is a
   second query rather than a nested select: profiles has its own policy and
   embedding it here would silently drop rows it cannot read, which reads as a
   review that lost its author rather than as a permission problem. */
export async function getToolReviews(toolId: string, limit = 20): Promise<ToolReview[]> {
  if (!isSupabaseConfigured()) return [];
  const db = createAnonClient();

  const { data, error } = await db
    .from("tool_reviews")
    .select("id, user_id, rating, body, created_at, updated_at")
    .eq("tool_id", toolId)
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[tools] reviews failed", error.code, error.message);
    return [];
  }

  const rows = (data ?? []) as Omit<ToolReview, "author">[];
  if (rows.length === 0) return [];

  const { data: people } = await db
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .in("id", rows.map((r) => r.user_id));

  const byId = new Map(
    ((people ?? []) as { id: string; username: string | null; full_name: string | null; avatar_url: string | null }[])
      .map((p) => [p.id, p]),
  );

  return rows.map((r) => ({ ...r, author: byId.get(r.user_id) ?? null }));
}

/* The distribution, computed from the same rows the average came from. Five
   numbers, so a person can see whether a 4.0 is everybody agreeing or a fight. */
export async function getRatingBreakdown(toolId: string): Promise<Record<1 | 2 | 3 | 4 | 5, number>> {
  const empty = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  if (!isSupabaseConfigured()) return empty;

  const db = createAnonClient();
  const { data, error } = await db
    .from("tool_reviews")
    .select("rating")
    .eq("tool_id", toolId)
    .eq("status", "visible");

  if (error) return empty;
  for (const row of (data ?? []) as { rating: number }[]) {
    const r = row.rating as 1 | 2 | 3 | 4 | 5;
    if (empty[r] !== undefined) empty[r] += 1;
  }
  return empty;
}

export type ViewerState = {
  signedIn: boolean;
  userId: string | null;
  reaction: 1 | -1 | null;
  saved: boolean;
  myReview: { id: string; rating: number; body: string | null } | null;
  reported: boolean;
  isOwner: boolean;
};

export async function getViewerState(toolId: string, developerId: string | null): Promise<ViewerState> {
  const blank: ViewerState = {
    signedIn: false, userId: null, reaction: null, saved: false,
    myReview: null, reported: false, isOwner: false,
  };
  if (!isSupabaseConfigured()) return blank;

  const db: SupabaseClient = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return blank;

  const [reaction, saved, review, report] = await Promise.all([
    db.from("tool_reactions").select("value").eq("tool_id", toolId).maybeSingle(),
    db.from("user_saved_tools").select("tool_id").eq("tool_id", toolId).maybeSingle(),
    db.from("tool_reviews").select("id, rating, body").eq("tool_id", toolId).eq("user_id", user.id).maybeSingle(),
    db.from("reports").select("id").eq("entity_type", "tool").eq("entity_id", toolId).maybeSingle(),
  ]);

  return {
    signedIn: true,
    userId: user.id,
    reaction: (reaction.data?.value as 1 | -1 | undefined) ?? null,
    saved: Boolean(saved.data),
    myReview: (review.data as ViewerState["myReview"]) ?? null,
    reported: Boolean(report.data),
    /* What the OWNER may see, not what they may do. Every write is still
       checked in the database; this only decides whether Edit renders. */
    isOwner: developerId != null && developerId === user.id,
  };
}

export type RelatedTool = { slug: string; name: string; tagline: string | null; logo_url: string | null };

/*
  Related tools, by shared tags. Deliberately not a recommendation model: the
  brief says not to invent one during this work, and a tag overlap is a filter
  a person can predict and argue with.
*/
export async function getRelatedTools(tool: ToolProfile, limit = 4): Promise<RelatedTool[]> {
  if (!isSupabaseConfigured() || tool.tags.length === 0) return [];

  const db = createAnonClient();
  const { data, error } = await db
    .from("tools")
    .select("slug, name, tagline, logo_url")
    .overlaps("tags", tool.tags)
    .neq("id", tool.id)
    .order("popularity_score", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[tools] related failed", error.code, error.message);
    return [];
  }
  return (data ?? []) as RelatedTool[];
}

export type DeveloperCard = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  otherTools: { slug: string; name: string }[];
};

export async function getDeveloperCard(developerId: string | null, excludeToolId: string): Promise<DeveloperCard | null> {
  if (!isSupabaseConfigured() || !developerId) return null;
  const db = createAnonClient();

  const [{ data: profile }, { data: dev }, { data: others }] = await Promise.all([
    db.from("profiles").select("id, username, full_name, avatar_url").eq("id", developerId).maybeSingle(),
    db.from("developer_profiles").select("verified").eq("id", developerId).maybeSingle(),
    db.from("tools").select("slug, name").eq("developer_id", developerId).neq("id", excludeToolId).limit(5),
  ]);

  if (!profile) return null;
  return {
    ...(profile as Omit<DeveloperCard, "verified" | "otherTools">),
    verified: Boolean((dev as { verified?: boolean } | null)?.verified),
    otherTools: (others ?? []) as { slug: string; name: string }[],
  };
}
