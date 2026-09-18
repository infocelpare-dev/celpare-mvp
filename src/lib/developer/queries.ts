import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
  Developer Mode data, and the one place that decides what a developer is.

  THE RULE, because it is the whole security model:

    profiles.is_developer  is a PREFERENCE. It means "show me the developer
                           interface". It is client writable and grants nothing.

    developer_profiles     with accepted_terms_at set is the AUTHORIZATION.
                           Every write policy on tools and models reads it, and
                           none of them reads the flag.

  So `gate()` below decides what to RENDER. It is not the control. A person who
  edits the flag in the database still cannot submit anything, because the
  policies never consult it. Verified live: check D2 in the tracker.
*/

export type DeveloperProfile = {
  id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  company: string | null;
  website_url: string | null;
  github_url: string | null;
  description: string | null;
  expertise: string[];
  logo_url: string | null;
  verified: boolean;
  accepted_terms_at: string | null;
  created_at: string;
};

const DEV_COLUMNS =
  "id, handle, display_name, bio, company, website_url, github_url, description, expertise, logo_url, verified, accepted_terms_at, created_at";

/* The current terms. Bump this when the text changes and everybody re-accepts. */
export const DEVELOPER_TERMS_VERSION = "2026-09-14";

export type DeveloperGate =
  | { state: "signed-out" }
  /* The flag is off. Not an error: most people are not developers. */
  | { state: "mode-off"; userId: string }
  /* Flag on, no developer profile yet. Needs the identity and the terms. */
  | { state: "needs-onboarding"; userId: string; profile: DeveloperProfile | null }
  /* Flag on, profile exists, terms accepted. The workspace is open. */
  | { state: "active"; userId: string; profile: DeveloperProfile };

export async function gate(): Promise<{ gate: DeveloperGate; db: SupabaseClient | null }> {
  if (!isSupabaseConfigured()) return { gate: { state: "signed-out" }, db: null };

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) return { gate: { state: "signed-out" }, db };

  const { data: account } = await db
    .from("profiles")
    .select("is_developer")
    .eq("id", user.id)
    .maybeSingle();

  if (!account?.is_developer) {
    return { gate: { state: "mode-off", userId: user.id }, db };
  }

  const { data } = await db
    .from("developer_profiles")
    .select(DEV_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  const profile = (data as DeveloperProfile | null) ?? null;

  if (!profile || !profile.accepted_terms_at) {
    return { gate: { state: "needs-onboarding", userId: user.id, profile }, db };
  }

  return { gate: { state: "active", userId: user.id, profile }, db };
}

export async function getDeveloperProfile(
  db: SupabaseClient,
  userId: string,
): Promise<DeveloperProfile | null> {
  const { data } = await db
    .from("developer_profiles")
    .select(DEV_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  return (data as DeveloperProfile | null) ?? null;
}

export type SubmissionStatus =
  | "draft"
  | "pending"
  | "changes_required"
  | "approved"
  | "rejected";

export type DeveloperTool = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  status: SubmissionStatus;
  verified: boolean;
  submitted_at: string;
  created_at: string;
  /* Set when a reviewer confirmed the owner email replied. owner_email itself
     is readable by nobody through the table, but the timestamp is, so a
     developer can see where their own submission stands. */
  domain_verified_at: string | null;
  categories?: string[];
};

export type DeveloperModel = {
  id: string;
  slug: string;
  name: string;
  provider: string | null;
  status: SubmissionStatus;
  submitted_at: string;
  created_at: string;
};

/*
  Own rows only. That is enforced by RLS, not by this filter: the `eq` below is
  a query, and tools_select_auth is what makes it a boundary. Both are here on
  purpose, the same way the AI boundary keeps two independent controls.
*/
export async function getMyTools(
  db: SupabaseClient,
  userId: string,
): Promise<DeveloperTool[]> {
  const { data, error } = await db
    .from("tools")
    .select("id, slug, name, tagline, logo_url, status, verified, submitted_at, created_at, domain_verified_at, tool_categories(categories(name))")
    .eq("developer_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[developer] my tools failed", error.code, error.message);
    return [];
  }

  type Row = Omit<DeveloperTool, "categories"> & {
    tool_categories?: { categories?: { name: string } | null }[] | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    ...row,
    categories: (row.tool_categories ?? [])
      .map((tc) => tc.categories?.name)
      .filter((n): n is string => Boolean(n)),
  }));
}

export async function getMyModels(
  db: SupabaseClient,
  userId: string,
): Promise<DeveloperModel[]> {
  const { data, error } = await db
    .from("models")
    .select("id, slug, name, provider, status, submitted_at, created_at")
    .eq("developer_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[developer] my models failed", error.code, error.message);
    return [];
  }
  return (data as DeveloperModel[]) ?? [];
}

export type DeveloperStats = {
  tools: number;
  models: number;
  pending: number;
  approvedTools: number;
  approvedModels: number;
  rejected: number;
  drafts: number;
};

/*
  Counted from the rows themselves. Nothing here is estimated, and a zero is
  rendered as a zero rather than hidden or rounded up (D13, D30).
*/
export function statsFrom(
  tools: DeveloperTool[],
  models: DeveloperModel[],
): DeveloperStats {
  const count = (rows: { status: SubmissionStatus }[], s: SubmissionStatus) =>
    rows.filter((r) => r.status === s).length;

  return {
    tools: tools.length,
    models: models.length,
    pending: count(tools, "pending") + count(models, "pending"),
    approvedTools: count(tools, "approved"),
    approvedModels: count(models, "approved"),
    rejected: count(tools, "rejected") + count(models, "rejected"),
    drafts: count(tools, "draft") + count(models, "draft"),
  };
}

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  draft: "Draft",
  pending: "Pending review",
  changes_required: "Changes required",
  approved: "Approved",
  rejected: "Rejected",
};

/*
  The categories a submission may be filed under.

  Public reference data: `categories` grants SELECT to anon and authenticated
  and its policy is `true`, so this needs no session and no service role. There
  is no write path anywhere in the product, by design. Categories change by
  migration, the same rule `topics` follows in 4.3, because a category people
  browse by is structure rather than content.
*/
export async function listCategories(): Promise<{ id: string; name: string }[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  if (error) {
    console.error("[developer] categories read failed", error.code, error.message);
    return [];
  }
  return data ?? [];
}

/*
  One tool, as its owner, shaped for the edit form.

  RLS is the ownership check, not the `.eq` below: tools_select lets a
  developer read their own rows whatever the status, and a row belonging to
  somebody else simply is not returned. The filter is there so a wrong id reads
  as "not found" rather than as somebody else's tool.

  The child tables are read separately because PostgREST embedding would need a
  foreign key hint per table and this is three plain reads. Categories became
  readable to their owner in the same change that added this: until then the
  policy allowed approved tools only, so an owner could not read back the
  categories of their own draft.
*/
export type ToolForEdit = {
  id: string;
  slug: string;
  status: SubmissionStatus;
  values: Record<string, string | string[]>;
};

export async function getToolForEdit(
  db: SupabaseClient,
  userId: string,
  id: string,
): Promise<ToolForEdit | null> {
  const { data: tool, error } = await db
    .from("tools")
    .select(
      "id, slug, name, tagline, description, website_url, docs_url, logo_url, pricing, pricing_model, tags, status, developer_id",
    )
    .eq("id", id)
    .eq("developer_id", userId)
    .maybeSingle();

  if (error || !tool) {
    if (error) console.error("[developer] tool for edit failed", error.code, error.message);
    return null;
  }

  const [cats, links, media, verification] = await Promise.all([
    db.from("tool_categories").select("category_id").eq("tool_id", id),
    db.from("tool_links").select("kind, url").eq("tool_id", id),
    db.from("tool_media").select("kind, url, sort_order").eq("tool_id", id).order("sort_order"),
    /*
      The owner email, which no client role can SELECT off the column. This RPC
      is the only door and it allows the tool's own developer, which is exactly
      who is standing here.

      Prefilling it matters more than it looks. The field is required, so
      without this every edit would mean retyping the address from memory, and
      a single character different is a DIFFERENT address: update_tool would
      read that as the owner changing it and throw the domain confirmation
      away, sending a live tool back for verification over a typo.
    */
    db.rpc("tool_verification_state", { p_id: id }),
  ]);

  const vRow = (Array.isArray(verification.data) ? verification.data[0] : verification.data) as
    | { owner_email: string | null }
    | undefined;
  const ownerEmail = vRow?.owner_email ?? null;

  const linkRows = (links.data ?? []) as { kind: string; url: string }[];
  const mediaRows = (media.data ?? []) as { kind: string; url: string }[];

  /* demo and github have fields of their own on the form. Everything else is
     an "other link" row, which is why they are split rather than listed. */
  const other = linkRows.filter((l) => l.kind !== "demo" && l.kind !== "github");

  return {
    id: tool.id,
    slug: tool.slug,
    status: tool.status as SubmissionStatus,
    values: {
      slug: tool.slug,
      name: tool.name ?? "",
      tagline: tool.tagline ?? "",
      description: tool.description ?? "",
      websiteUrl: tool.website_url ?? "",
      docsUrl: tool.docs_url ?? "",
      logoUrl: tool.logo_url ?? "",
      pricing: tool.pricing ?? "",
      pricingModel: tool.pricing_model ?? "",
      tags: (tool.tags ?? []).join(", "),
      ownerEmail: ownerEmail ?? "",
      demoUrl: linkRows.find((l) => l.kind === "demo")?.url ?? "",
      githubUrl: linkRows.find((l) => l.kind === "github")?.url ?? "",
      otherLinkKind: other.map((l) => l.kind),
      otherLinkUrl: other.map((l) => l.url),
      /* No coverUrl: the form no longer has the field. update_tool deletes
         every non update media row and reinserts what the form sent, so an
         older tool's cover row is cleared the first time its owner saves an
         edit. That is the intended drain for a retired field, not a loss: the
         image is still in storage, and nothing rendered it after 2026-09-18. */
      screenshotUrl: mediaRows.filter((m) => m.kind === "screenshot").map((m) => m.url),
      videoUrl: mediaRows.filter((m) => m.kind === "video").map((m) => m.url),
      categories: ((cats.data ?? []) as { category_id: string }[]).map((c) => c.category_id),
    },
  };
}

/* ------------------------------------------------------------- analytics */

/*
  The developer analytics board.

  Every number comes from `developer_tool_analytics`, one SECURITY DEFINER
  function, one round trip. It is scoped by ownership in SQL: every branch
  joins `tools` and tests `developer_id = auth.uid()`, and there is no tool id
  parameter, so a developer can ask for their own numbers or for nothing.
  Verified live: two developers, two tools, neither sees the other's traffic,
  and anon is refused 42501 on the function itself.

  Read the comment at the top of that function before changing any of this. The
  short version: `tool_view_events` stays closed to clients, and the answer is
  an aggregate rather than a row policy, because a row policy would still hand
  every developer a filterable cursor over everybody's traffic.
*/

export type AnalyticsWindow = 1 | 7 | 30;

export const ANALYTICS_WINDOWS: { days: AnalyticsWindow; label: string; short: string }[] = [
  { days: 1, label: "Last 24 hours", short: "24h" },
  { days: 7, label: "Last 7 days", short: "7 days" },
  { days: 30, label: "Last 30 days", short: "30 days" },
];

export function isAnalyticsWindow(value: string | undefined): value is `${AnalyticsWindow}` {
  return value === "1" || value === "7" || value === "30";
}

export type ToolAnalytics = {
  days: number;
  tool_count: number;
  totals: { views: number; savers: number; reviews: number; viewers: number };
  previous: { views: number; savers: number; reviews: number };
  lifetime: { views: number; savers: number; reviews: number; rating: number | null };
  by_day: { day: string; value: number }[];
  by_tool: { name: string; slug: string; value: number; saves: number }[];
  by_source: { label: string; value: number }[];
  by_query: { label: string; value: number }[];
};

const EMPTY_ANALYTICS: ToolAnalytics = {
  days: 7,
  tool_count: 0,
  totals: { views: 0, savers: 0, reviews: 0, viewers: 0 },
  previous: { views: 0, savers: 0, reviews: 0 },
  lifetime: { views: 0, savers: 0, reviews: 0, rating: null },
  by_day: [],
  by_tool: [],
  by_source: [],
  by_query: [],
};

export async function getToolAnalytics(
  db: SupabaseClient,
  days: AnalyticsWindow,
): Promise<ToolAnalytics> {
  const { data, error } = await db.rpc("developer_tool_analytics", { p_days: days });

  if (error) {
    console.error("[developer] analytics failed", error.code, error.message);
    return { ...EMPTY_ANALYTICS, days };
  }

  /* The function has a `where auth.uid() is not null` guard, so a session that
     expired between the page load and this call returns no row rather than an
     error. An empty board is the honest render for that. */
  return (data as ToolAnalytics | null) ?? { ...EMPTY_ANALYTICS, days };
}
