import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminCommentRow,
  AdminModelRow,
  AdminPostRow,
  AdminReportRow,
  AdminToolRow,
  AdminUserDetail,
  AdminUserRow,
  AiAnalytics,
  AuditRow,
  CommunityAnalytics,
  GlobalHit,
  JobRunRow,
  Overview,
  RecommendationAnalytics,
  SearchAnalytics,
  SecurityEventRow,
  SettingRow,
  PostThread,
  StorageUsage,
  TaxonomyRow,
} from "./types";

/*
  Every read the admin dashboard performs, in one module.

  Two mechanisms, chosen per table rather than one blanket bypass:

    An ordinary select through the admin's own session, wherever the existing
    RLS policies already say what staff may see. Tools, models, posts, comments
    and reports all work this way, so the dashboard sits inside the same
    boundary as every other surface.

    An RPC only where the data is genuinely out of reach of any policy: an email
    address, auth.users, somebody else's AI usage, the audit log. Each of those
    checks a capability in SQL and raises 42501 when it is missing.

  The service role client is not imported here and must not be. Its one job
  stays what src/lib/supabase/admin.ts says it is: writing rows nobody may forge.
  An admin reading data reads it as themselves.
*/

/* A failed read is a zero, not a crash. An admin page that cannot load its
   fourth card should still render the other three, and the error belongs in the
   server log where it can be read rather than in a stack trace over the UI. */
function warn(where: string, error: { code?: string; message: string } | null) {
  if (error) console.error(`[admin] ${where} failed`, error.code, error.message);
}

export async function getOverview(db: SupabaseClient): Promise<Overview | null> {
  const { data, error } = await db.rpc("admin_overview");
  warn("overview", error);
  return (data as Overview) ?? null;
}

/* ------------------------------------------------------------------ users */

export type UserFilters = {
  search?: string;
  role?: string;
  plan?: string;
  status?: string;
  verified?: string;
  sort?: string;
  page?: number;
  perPage?: number;
};

export async function listUsers(
  db: SupabaseClient,
  filters: UserFilters,
): Promise<{ rows: AdminUserRow[]; total: number }> {
  const perPage = filters.perPage ?? 25;
  const { data, error } = await db.rpc("admin_list_users", {
    p_search: filters.search || null,
    p_role: filters.role || null,
    p_plan: filters.plan || null,
    p_status: filters.status || null,
    p_verified: filters.verified || null,
    p_sort: filters.sort || "created_desc",
    p_limit: perPage,
    p_offset: ((filters.page ?? 1) - 1) * perPage,
  });
  warn("list users", error);

  const rows = (data as AdminUserRow[]) ?? [];
  // total_count is a window function over the filtered set, so it is the same
  // on every row and absent when there are none.
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function getUserDetail(
  db: SupabaseClient,
  userId: string,
): Promise<AdminUserDetail | null> {
  const { data, error } = await db.rpc("admin_user_detail", { p_user_id: userId });
  warn("user detail", error);
  return (data as AdminUserDetail) ?? null;
}

/* ------------------------------------------------------------- developers */

export type AdminDeveloperRow = {
  id: string;
  handle: string;
  display_name: string | null;
  company: string | null;
  website_url: string | null;
  github_url: string | null;
  expertise: string[];
  verified: boolean;
  accepted_terms_at: string | null;
  terms_version: string | null;
  created_at: string;
  username: string | null;
  account_status: string;
  avatar_url: string | null;
  tools: number;
  models: number;
  pending: number;
};

/*
  Developers, with their catalogue counted alongside.

  Three queries rather than one join with aggregates: developer_profiles is
  small, tools and models are the tables that grow, and scanning each once is
  cheaper than a correlated subquery per developer. All three are RLS bounded.
*/
export async function listDevelopers(
  db: SupabaseClient,
  search?: string,
): Promise<AdminDeveloperRow[]> {
  let q = db
    .from("developer_profiles")
    .select(
      "id, handle, display_name, company, website_url, github_url, expertise, verified, accepted_terms_at, terms_version, created_at, profiles!inner(username, account_status, avatar_url)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (search) q = q.ilike("handle", `%${search}%`);

  const { data, error } = await q;
  warn("list developers", error);

  type Row = Omit<
    AdminDeveloperRow,
    "username" | "account_status" | "avatar_url" | "tools" | "models" | "pending"
  > & {
    profiles: {
      username: string | null;
      account_status: string;
      avatar_url: string | null;
    } | null;
  };

  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    username: r.profiles?.username ?? null,
    account_status: r.profiles?.account_status ?? "active",
    avatar_url: r.profiles?.avatar_url ?? null,
    tools: 0,
    models: 0,
    pending: 0,
  }));
  if (rows.length === 0) return rows;

  const ids = rows.map((r) => r.id);
  const [tools, models] = await Promise.all([
    db.from("tools").select("developer_id, status").in("developer_id", ids),
    db.from("models").select("developer_id, status").in("developer_id", ids),
  ]);

  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const t of (tools.data ?? []) as { developer_id: string; status: string }[]) {
    const row = byId.get(t.developer_id);
    if (!row) continue;
    row.tools += 1;
    if (t.status === "pending") row.pending += 1;
  }
  for (const m of (models.data ?? []) as { developer_id: string; status: string }[]) {
    const row = byId.get(m.developer_id);
    if (!row) continue;
    row.models += 1;
    if (m.status === "pending") row.pending += 1;
  }

  return rows;
}

/* ---------------------------------------------------------- tools, models */

const TOOL_COLUMNS =
  "id, slug, name, tagline, logo_url, status, verified, source, pricing_model, rating, rating_count, popularity_score, developer_id, submitted_at, created_at, published_at";

export type CatalogueFilters = {
  search?: string;
  status?: string;
  source?: string;
  sort?: string;
  page?: number;
  perPage?: number;
};

export async function listTools(
  db: SupabaseClient,
  filters: CatalogueFilters,
): Promise<{ rows: AdminToolRow[]; total: number }> {
  const perPage = filters.perPage ?? 25;
  const from = ((filters.page ?? 1) - 1) * perPage;

  let q = db.from("tools").select(TOOL_COLUMNS, { count: "exact" });

  if (filters.search) q = q.ilike("name", `%${filters.search}%`);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.source) q = q.eq("source", filters.source);

  const sort = filters.sort ?? "created_desc";
  if (sort === "created_asc") q = q.order("created_at", { ascending: true });
  else if (sort === "name_asc") q = q.order("name", { ascending: true });
  else if (sort === "popular") q = q.order("popularity_score", { ascending: false });
  else if (sort === "rating") q = q.order("rating", { ascending: false, nullsFirst: false });
  else q = q.order("created_at", { ascending: false });

  const { data, error, count } = await q.range(from, from + perPage - 1);
  warn("list tools", error);
  return { rows: (data as AdminToolRow[]) ?? [], total: count ?? 0 };
}

export async function getTool(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("tools")
    .select(
      `${TOOL_COLUMNS}, description, website_url, docs_url, pricing, tags, features, platforms, updated_at, tool_categories(categories(name, slug))`,
    )
    .eq("id", id)
    .maybeSingle();
  warn("get tool", error);
  return data;
}

export type ToolVerification = {
  tool_id: string;
  owner_email: string | null;
  canonical_domain: string | null;
  email_domain: string | null;
  domain_matches: boolean | null;
  domain_verified_at: string | null;
  domain_verified_by: string | null;
  domain_verified_note: string | null;
};

/*
  The owner email, which is deliberately hard to get at.

  No client role holds SELECT on tools.owner_email, so this cannot be a column
  in getTool above. It comes through tool_verification_state, a SECURITY
  DEFINER function that allows the tool's own developer or a holder of
  submissions.review and refuses everybody else at 42501.

  THREE OUTCOMES, NOT TWO, and the distinction is the point.

  The first version returned null for both "there is no owner email" and "the
  read failed", so a dropped connection to Supabase rendered as the sentence
  "No owner email on this submission". That is a page inventing a fact about a
  record it could not read, and a reviewer would have sent a perfectly good
  submission back over it. Seen happening in dev, with a real fetch failure.

  An unreadable result never unlocks approval: the caller reads
  domain_verified_at off the row, and there is no row.
*/
export type ToolVerificationResult =
  | { state: "ok"; row: ToolVerification }
  | { state: "none" }
  | { state: "unreadable" };

export async function getToolVerification(
  db: SupabaseClient,
  id: string,
): Promise<ToolVerificationResult> {
  const { data, error } = await db.rpc("tool_verification_state", { p_id: id });
  if (error) {
    warn("tool verification", error);
    return { state: "unreadable" };
  }
  const row = (Array.isArray(data) ? data[0] : data) as ToolVerification | undefined;
  if (!row) return { state: "unreadable" };
  if (!row.owner_email) return { state: "none" };
  return { state: "ok", row };
}

export async function listModels(
  db: SupabaseClient,
  filters: CatalogueFilters,
): Promise<{ rows: AdminModelRow[]; total: number }> {
  const perPage = filters.perPage ?? 25;
  const from = ((filters.page ?? 1) - 1) * perPage;

  let q = db
    .from("models")
    .select(
      "id, slug, name, provider, status, context_window, input_price_per_m, output_price_per_m, modalities, developer_id, submitted_at, created_at",
      { count: "exact" },
    );

  if (filters.search) q = q.ilike("name", `%${filters.search}%`);
  if (filters.status) q = q.eq("status", filters.status);

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(from, from + perPage - 1);
  warn("list models", error);
  return { rows: (data as AdminModelRow[]) ?? [], total: count ?? 0 };
}

export async function getModel(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("models").select("*").eq("id", id).maybeSingle();
  warn("get model", error);
  return data;
}

/*
  The submission queue. Tools and models in one list, because a reviewer works
  through a queue rather than through two tables, and pending means the same
  thing on both.
*/
export type Submission = {
  kind: "tool" | "model";
  id: string;
  name: string;
  slug: string;
  status: string;
  developer_id: string | null;
  submitted_at: string;
  tagline: string | null;
  provider: string | null;
  /*
    This one cannot be approved until a reviewer records that the owner email
    replied. The queue reads it so Approve can be off with a reason, rather
    than throwing the reviewer at a refusal they have no way to act on from
    here. See admin_review_submission, which is what actually refuses.
  */
  needs_domain_confirm: boolean;
};

type ToolQueueRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  status: string;
  developer_id: string | null;
  submitted_at: string;
  source: string;
  domain_verified_at: string | null;
};

type ModelQueueRow = {
  id: string;
  slug: string;
  name: string;
  provider: string | null;
  status: string;
  developer_id: string | null;
  submitted_at: string;
};

export async function listSubmissions(
  db: SupabaseClient,
  status = "pending",
): Promise<Submission[]> {
  const toolQuery = db
    .from("tools")
    .select(
      "id, slug, name, tagline, status, developer_id, submitted_at, source, domain_verified_at",
    )
    .order("submitted_at", { ascending: true })
    .limit(100);
  const modelQuery = db
    .from("models")
    .select("id, slug, name, provider, status, developer_id, submitted_at")
    .order("submitted_at", { ascending: true })
    .limit(100);

  const [tools, models] = await Promise.all([
    status === "all" ? toolQuery : toolQuery.eq("status", status),
    status === "all" ? modelQuery : modelQuery.eq("status", status),
  ]);
  warn("submissions: tools", tools.error);
  warn("submissions: models", models.error);

  const out: Submission[] = [
    ...((tools.data ?? []) as ToolQueueRow[]).map((t) => ({
      kind: "tool" as const,
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      developer_id: t.developer_id,
      submitted_at: t.submitted_at,
      tagline: t.tagline,
      provider: null,
      /*
        Only a developer submission is gated. An admin seed or an import has no
        owner to write to, and admin_review_submission does not ask one of those
        for a confirmation either.
      */
      needs_domain_confirm:
        t.source === "developer_submission" && t.domain_verified_at === null,
    })),
    ...((models.data ?? []) as ModelQueueRow[]).map((m) => ({
      kind: "model" as const,
      id: m.id,
      name: m.name,
      slug: m.slug,
      status: m.status,
      developer_id: m.developer_id,
      submitted_at: m.submitted_at,
      tagline: null,
      provider: m.provider,
      /* Models have no domain ownership check. 4T built it for tools only. */
      needs_domain_confirm: false,
    })),
  ];

  // Oldest first. A review queue that sorts newest first starves the bottom.
  return out.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
}

/* -------------------------------------------------------------- community */

/*
  The moderation lists go through RPCs rather than an ordinary select.

  report_count and qualified_report_count are not in the client SELECT grant on
  posts or comments, and they should not be: how many people have reported
  something is moderation signal. With it readable, an author can tell whether
  a post is one report away from being auto hidden, and somebody organising a
  brigade can watch it land.

  Selecting them through the session therefore fails with 42501, which is the
  same trap that broke search_tools when a grant was narrowed. So these two read
  through capability checked routines, and ordinary reads of posts and comments
  are untouched.
*/
export async function listPosts(
  db: SupabaseClient,
  opts: { status?: string; reported?: boolean; page?: number; perPage?: number },
): Promise<{ rows: AdminPostRow[]; total: number }> {
  const perPage = opts.perPage ?? 25;
  const { data, error } = await db.rpc("admin_list_posts", {
    p_status: opts.status ?? null,
    p_reported: opts.reported ?? false,
    p_limit: perPage,
    p_offset: ((opts.page ?? 1) - 1) * perPage,
  });
  warn("list posts", error);
  const rows = (data as (AdminPostRow & { total_count: number })[]) ?? [];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function listComments(
  db: SupabaseClient,
  opts: { status?: string; reported?: boolean; page?: number; perPage?: number },
): Promise<{ rows: AdminCommentRow[]; total: number }> {
  const perPage = opts.perPage ?? 25;
  const { data, error } = await db.rpc("admin_list_comments", {
    p_status: opts.status ?? null,
    p_reported: opts.reported ?? false,
    p_limit: perPage,
    p_offset: ((opts.page ?? 1) - 1) * perPage,
  });
  warn("list comments", error);
  const rows = (data as (AdminCommentRow & { total_count: number })[]) ?? [];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/* The one item a report is about, with the same two counters beside it. */
export async function getContent(
  db: SupabaseClient,
  entityType: "post" | "comment",
  entityId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.rpc("admin_get_content", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  warn("get content", error);
  return (data as Record<string, unknown>) ?? null;
}

/* A post, its comments and every report filed against any of them. One call,
   because report_count is not in the client grant and these cannot be ordinary
   selects. */
export async function getPostThread(
  db: SupabaseClient,
  postId: string,
): Promise<PostThread | null> {
  const { data, error } = await db.rpc("admin_post_thread", { p_post_id: postId });
  warn("post thread", error);
  return (data as PostThread) ?? null;
}

/* ---------------------------------------------------------------- reports */

export type ReportFilters = {
  status?: string;
  entityType?: string;
  reason?: string;
  priority?: string;
  page?: number;
  perPage?: number;
};

export async function listReports(
  db: SupabaseClient,
  filters: ReportFilters,
): Promise<{ rows: AdminReportRow[]; total: number }> {
  const perPage = filters.perPage ?? 25;
  const from = ((filters.page ?? 1) - 1) * perPage;

  let q = db.from("reports").select("*", { count: "exact" });

  if (filters.status === "open") q = q.in("status", ["open", "investigating"]);
  else if (filters.status) q = q.eq("status", filters.status);
  if (filters.entityType) q = q.eq("entity_type", filters.entityType);
  if (filters.reason) q = q.eq("reason", filters.reason);
  if (filters.priority) q = q.eq("priority", filters.priority);

  const { data, error, count } = await q
    // Oldest first inside the queue. Priority is a separate column and is
    // sorted in the page, because text ordering would put 'normal' above
    // 'critical' and quietly bury the thing that matters most.
    .order("created_at", { ascending: true })
    .range(from, from + perPage - 1);
  warn("list reports", error);

  const rank: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
  const rows = ((data as AdminReportRow[]) ?? []).sort(
    (a, b) => (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2),
  );
  return { rows, total: count ?? 0 };
}

export async function getReport(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("reports").select("*").eq("id", id).maybeSingle();
  warn("get report", error);
  return (data as AdminReportRow) ?? null;
}

/* Every report filed against the same item, so a detail page can say this is
   one of five rather than showing one voice. */
export async function getRelatedReports(
  db: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<AdminReportRow[]> {
  const { data, error } = await db
    .from("reports")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  warn("related reports", error);
  return (data as AdminReportRow[]) ?? [];
}

export type ModerationActionRow = {
  id: string;
  target_user: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
};

export async function listModerationActions(
  db: SupabaseClient,
  opts: { entityType?: string; entityId?: string; targetUser?: string; limit?: number },
): Promise<ModerationActionRow[]> {
  let q = db
    .from("moderation_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.entityType) q = q.eq("entity_type", opts.entityType);
  if (opts.entityId) q = q.eq("entity_id", opts.entityId);
  if (opts.targetUser) q = q.eq("target_user", opts.targetUser);

  const { data, error } = await q;
  warn("moderation actions", error);
  return (data as ModerationActionRow[]) ?? [];
}

/* -------------------------------------------------------------- analytics */

export async function getAiAnalytics(
  db: SupabaseClient,
  days = 30,
): Promise<AiAnalytics | null> {
  const { data, error } = await db.rpc("admin_ai_analytics", { p_days: days });
  warn("ai analytics", error);
  return (data as AiAnalytics) ?? null;
}

export async function getSearchAnalytics(
  db: SupabaseClient,
  days = 30,
): Promise<SearchAnalytics | null> {
  const { data, error } = await db.rpc("admin_search_analytics", { p_days: days });
  warn("search analytics", error);
  return (data as SearchAnalytics) ?? null;
}

export async function getRecommendationAnalytics(
  db: SupabaseClient,
  days = 30,
): Promise<RecommendationAnalytics | null> {
  const { data, error } = await db.rpc("admin_recommendation_analytics", { p_days: days });
  warn("recommendation analytics", error);
  return (data as RecommendationAnalytics) ?? null;
}

export async function getCommunityAnalytics(
  db: SupabaseClient,
  days = 30,
): Promise<CommunityAnalytics | null> {
  const { data, error } = await db.rpc("admin_community_analytics", { p_days: days });
  warn("community analytics", error);
  return (data as CommunityAnalytics) ?? null;
}

/* ------------------------------------------------- audit, security, jobs */

export async function listAudit(
  db: SupabaseClient,
  filters: {
    search?: string;
    action?: string;
    entityType?: string;
    page?: number;
    perPage?: number;
  },
): Promise<{ rows: AuditRow[]; total: number }> {
  const perPage = filters.perPage ?? 50;
  const { data, error } = await db.rpc("admin_list_audit", {
    p_search: filters.search || null,
    p_action: filters.action || null,
    p_entity_type: filters.entityType || null,
    p_actor: null,
    p_limit: perPage,
    p_offset: ((filters.page ?? 1) - 1) * perPage,
  });
  warn("list audit", error);
  const rows = (data as AuditRow[]) ?? [];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

export async function listSecurityEvents(
  db: SupabaseClient,
  filters: { kind?: string; severity?: string; page?: number; perPage?: number },
): Promise<{ rows: SecurityEventRow[]; total: number }> {
  const perPage = filters.perPage ?? 50;
  const from = ((filters.page ?? 1) - 1) * perPage;

  let q = db.from("security_events").select("*", { count: "exact" });
  if (filters.kind) q = q.eq("kind", filters.kind);
  if (filters.severity) q = q.eq("severity", filters.severity);

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(from, from + perPage - 1);
  warn("security events", error);
  return { rows: (data as SecurityEventRow[]) ?? [], total: count ?? 0 };
}

export async function listJobRuns(db: SupabaseClient): Promise<JobRunRow[]> {
  const { data, error } = await db
    .from("job_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(100);
  warn("job runs", error);
  return (data as JobRunRow[]) ?? [];
}

/* --------------------------------------------------------------- settings */

/* Both stores in one list. community_settings stays where it is because
   report_hide_threshold() reads it; platform_settings is everything else. The
   page presents them as one thing because to an administrator they are. */
export async function listSettings(db: SupabaseClient): Promise<SettingRow[]> {
  const [platform, community] = await Promise.all([
    db
      .from("platform_settings")
      .select("key, category, value, description, updated_at")
      .order("key"),
    db.from("community_settings").select("key, value, description, updated_at").order("key"),
  ]);
  warn("platform settings", platform.error);
  warn("community settings", community.error);

  return [
    ...((platform.data ?? []) as Omit<SettingRow, "scope">[]).map((r) => ({
      ...r,
      scope: "platform" as const,
    })),
    ...((community.data ?? []) as Omit<SettingRow, "scope" | "category">[]).map((r) => ({
      ...r,
      category: "moderation",
      scope: "community" as const,
    })),
  ];
}

/* --------------------------------------------------------------- taxonomy */

/* Categories and topics, with the usage count that decides whether a slug can
   be renamed cheaply. The tables themselves are publicly readable, so this RPC
   exists only for that count. */
export async function listTaxonomy(
  db: SupabaseClient,
  kind: "category" | "topic",
): Promise<TaxonomyRow[]> {
  const { data, error } = await db.rpc("admin_list_taxonomy", { p_kind: kind });
  warn(`list ${kind}`, error);
  return (data as TaxonomyRow[]) ?? [];
}

/* ---------------------------------------------------------------- storage */

/* Bucket sizes, brief sections 1 and 18. storage.objects is not in the public
   schema and no client role can read it, so this goes through a capability
   checked routine that returns counts and bytes and never a path or an owner. */
export async function getStorageUsage(db: SupabaseClient): Promise<StorageUsage | null> {
  const { data, error } = await db.rpc("admin_storage_usage");
  warn("storage usage", error);
  return (data as StorageUsage) ?? null;
}

/* ---------------------------------------------------------- global search */

export async function globalSearch(db: SupabaseClient, query: string): Promise<GlobalHit[]> {
  if (!query || query.trim().length < 2) return [];
  const { data, error } = await db.rpc("admin_global_search", {
    p_query: query.trim(),
    p_limit: 6,
  });
  warn("global search", error);
  return (data as GlobalHit[]) ?? [];
}

/* -------------------------------------------------------------- lookups */

export type MiniProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  account_status: string;
  role: string;
};

/*
  Resolve a batch of author or owner ids to something renderable.

  A separate query rather than a join on every list, because the lists above
  come from five different tables and this is the one shape they all need. One
  round trip for a page of rows, not one per row.
*/
export async function profilesByIds(
  db: SupabaseClient,
  ids: (string | null | undefined)[],
): Promise<Map<string, MiniProfile>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (unique.length === 0) return new Map();

  const { data, error } = await db
    .from("profiles")
    .select("id, username, full_name, avatar_url, account_status, role")
    .in("id", unique);
  warn("profiles by ids", error);

  return new Map(((data ?? []) as MiniProfile[]).map((p) => [p.id, p]));
}
