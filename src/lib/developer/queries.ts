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
    .select("id, slug, name, tagline, logo_url, status, verified, submitted_at, created_at, tool_categories(categories(name))")
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
