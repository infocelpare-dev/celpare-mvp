import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIMITS } from "./options";
import { declaredFrom, NO_DECLARED, type DeclaredInterests } from "./prior";

/*
  Reads for onboarding (phase ONB). Every read goes through the caller's own
  session, so RLS decides what comes back: the answers row is own rows only,
  and onboarded_at, which is not selectable, comes through my_onboarding().
*/

export type OnboardingState = {
  onboardedAt: string | null;
  createdAt: string | null;
  answers: Record<string, unknown> | null;
};

export async function getOnboarding(db: SupabaseClient): Promise<OnboardingState | null> {
  const { data, error } = await db.rpc("my_onboarding");
  if (error) {
    console.error("[onboarding] state failed", error.code, error.message);
    return null;
  }
  if (!data) return null;
  const d = data as { onboarded_at: string | null; created_at: string | null; answers: Record<string, unknown> | null };
  return { onboardedAt: d.onboarded_at, createdAt: d.created_at, answers: d.answers };
}

/*
  The prior for the engines. Null viewer or a failed read is "nothing
  declared", never an error: ranking must not fail because of onboarding.
*/
export async function loadDeclared(db: SupabaseClient, viewerId: string | null): Promise<DeclaredInterests> {
  if (!viewerId) return NO_DECLARED;
  const { data, error } = await db.from("user_onboarding")
    .select("role, goals, category_ids, topic_ids, tool_ids")
    .eq("user_id", viewerId)
    .maybeSingle();
  if (error) {
    console.error("[onboarding] declared failed", error.code, error.message);
    return NO_DECLARED;
  }
  return declaredFrom(data);
}

/*
  The picks as the feature keys the engines use: Explore and search name a
  category by its lowercased name (explore normalize.ts), topics and tools by
  id. One place, so the key shape is decided once.
*/
export async function declaredKeys(db: SupabaseClient, d: DeclaredInterests): Promise<string[]> {
  const keys = [...d.topicIds.map((t) => `topic:${t}`), ...d.toolIds.map((t) => `tool:${t}`)];
  if (d.categoryIds.length > 0) {
    const { data, error } = await db.from("categories").select("name").in("id", d.categoryIds);
    if (error) console.error("[onboarding] category keys failed", error.code, error.message);
    for (const c of (data ?? []) as { name: string }[]) keys.push(`category:${c.name.trim().toLowerCase()}`);
  }
  return keys;
}

/* Admin: counts only, through admin_onboarding_summary (analytics.read, D226). */
export type Count = { key: string; count: number };
export type OnboardingSummary = {
  window_days: number;
  totals: { signups: number; started: number; completed: number; skipped_all: number; answered_heard: number };
  heard_from: Count[];
  heard_other: Count[];
  refs: Count[];
  roles: Count[];
  goals: Count[];
  categories: Count[];
  topics: Count[];
  tools: Count[];
};

export async function getOnboardingSummary(db: SupabaseClient, days: number): Promise<OnboardingSummary | null> {
  const { data, error } = await db.rpc("admin_onboarding_summary", { p_days: days });
  if (error) {
    console.error("[onboarding] summary failed", error.code, error.message);
    return null;
  }
  return data as OnboardingSummary;
}

export type Option = { id: string; slug: string; name: string };
export type ToolOption = Option & { logoUrl: string | null; verified: boolean; categoryIds: string[] };

export async function loadOptions(db: SupabaseClient): Promise<{
  categories: Option[];
  topics: Option[];
  tools: ToolOption[];
}> {
  const [cats, tops, tools, links] = await Promise.all([
    db.from("categories").select("id, slug, name").order("sort_order").order("name"),
    db.from("topics").select("id, slug, name").order("sort_order").order("name"),
    db.from("tools").select("id, slug, name, logo_url, verified").eq("status", "approved").order("name").limit(300),
    db.from("tool_categories").select("tool_id, category_id").limit(3000),
  ]);
  for (const r of [cats, tops, tools, links]) {
    if (r.error) console.error("[onboarding] options failed", r.error.code, r.error.message);
  }
  const byTool = new Map<string, string[]>();
  for (const l of (links.data ?? []) as { tool_id: string; category_id: string }[]) {
    const list = byTool.get(l.tool_id) ?? [];
    list.push(l.category_id);
    byTool.set(l.tool_id, list);
  }
  return {
    categories: (cats.data ?? []) as Option[],
    topics: (tops.data ?? []) as Option[],
    tools: ((tools.data ?? []) as { id: string; slug: string; name: string; logo_url: string | null; verified: boolean }[]).map(
      (t) => ({ id: t.id, slug: t.slug, name: t.name, logoUrl: t.logo_url, verified: t.verified, categoryIds: byTool.get(t.id) ?? [] }),
    ),
  };
}

export type Suggestion = {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  followers: number;
  /* Posts in the topics they picked, in the window read. */
  matches: number;
};

/*
  People to follow on the last step: authors of recent visible posts in the
  topics picked, most matching posts first, then followers. Public accounts
  only, never yourself, never somebody you already follow. With no topics, the
  most active authors overall. A suggestion is only ever drawn from public
  posts, so it reveals nothing a visitor could not see on the feed.
*/
export async function suggestPeople(
  db: SupabaseClient,
  viewerId: string,
  topicIds: string[],
): Promise<Suggestion[]> {
  let q = db.from("posts")
    .select("author_id, topic_id")
    .eq("status", "visible")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(400);
  if (topicIds.length > 0) q = q.in("topic_id", topicIds);
  const [{ data: posts, error }, { data: following }] = await Promise.all([
    q,
    db.from("follows").select("following_id").eq("follower_id", viewerId).limit(1000),
  ]);
  if (error) {
    console.error("[onboarding] people failed", error.code, error.message);
    return [];
  }
  const followed = new Set(((following ?? []) as { following_id: string }[]).map((f) => f.following_id));
  const counts = new Map<string, number>();
  for (const p of (posts ?? []) as { author_id: string }[]) {
    if (p.author_id === viewerId || followed.has(p.author_id)) continue;
    counts.set(p.author_id, (counts.get(p.author_id) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const { data: people, error: pErr } = await db.from("profiles")
    .select("id, username, full_name, avatar_url, follower_count, is_private, account_status")
    .in("id", [...counts.keys()].slice(0, 100));
  if (pErr) {
    console.error("[onboarding] people profiles failed", pErr.code, pErr.message);
    return [];
  }
  return ((people ?? []) as {
    id: string; username: string; full_name: string | null; avatar_url: string | null;
    follower_count: number; is_private: boolean; account_status: string;
  }[])
    .filter((p) => !p.is_private && p.account_status === "active" && p.username)
    .map((p) => ({
      id: p.id,
      username: p.username,
      fullName: p.full_name,
      avatarUrl: p.avatar_url,
      followers: p.follower_count ?? 0,
      matches: counts.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.matches - a.matches || b.followers - a.followers || a.username.localeCompare(b.username))
    .slice(0, LIMITS.PEOPLE);
}
