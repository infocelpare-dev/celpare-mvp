import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";

/*
  Platform telemetry: searches, tool views, security events and job runs.

  WHY THE SERVICE ROLE, AND WHY IT IS NOT A WIDENING OF D21.

  src/lib/ai/usage.ts already carries the argument in full and this is the same
  shape of write. Every value in these rows is computed here, from what the
  server already knows. Nothing is read back, nothing is returned to a browser,
  and no row is written from a request body.

  The alternative is an insert policy for anon and authenticated, and that is
  worse in an obvious way: an endpoint anybody can post to, writing the rows the
  spend and abuse dashboards are read from. Somebody could manufacture a
  thousand zero result searches for a competitor's name, or bury a real burst of
  failed logins under invented ones. Analytics nobody can forge is worth more
  than analytics that needs no key.

  A failed login has no session at all, which settles it for security events on
  its own: there is nobody to write as.

  Everything here is fire and forget. Telemetry must never fail the request it
  is describing, so every function swallows its own errors after logging them.
  If the service role key is absent these degrade to nothing, exactly the way
  usage recording does, and the product keeps working with a thinner trail.
*/

function unavailable(what: string): boolean {
  if (hasServiceRole()) return false;
  // One line per event would drown the log. This is the same trade usage.ts
  // makes and is the reason that warning is worded the way it is.
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[telemetry] ${what} not recorded: no SUPABASE_SERVICE_ROLE_KEY`);
  }
  return true;
}

/* Trim, collapse runs of whitespace, lowercase, cap. Two people typing
   "Video Editor" and "video  editor" are looking for the same thing, and a
   popular queries list that splits them is not a popular queries list. */
function normalize(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 200);
}

export type SearchSource = "explore" | "ask" | "api" | "admin";

export async function recordSearch(input: {
  query: string;
  resultCount: number;
  userId?: string | null;
  source?: SearchSource;
}): Promise<void> {
  const query = input.query.trim().slice(0, 200);
  if (!query) return;
  if (unavailable("search")) return;

  try {
    const { error } = await createAdminClient().from("search_events").insert({
      user_id: input.userId ?? null,
      query,
      normalized: normalize(query),
      result_count: Math.max(0, Math.trunc(input.resultCount)),
      source: input.source ?? "explore",
    });
    if (error) console.error("[telemetry] search insert failed", error.code, error.message);
  } catch (err) {
    console.error("[telemetry] search insert threw", err);
  }
}

export type ViewSource =
  | "direct"
  | "search"
  | "explore"
  | "ask"
  | "recommendation"
  | "community";

export async function recordToolView(input: {
  toolId: string;
  userId?: string | null;
  source?: ViewSource;
  query?: string | null;
}): Promise<void> {
  if (unavailable("tool view")) return;

  try {
    const { error } = await createAdminClient().from("tool_view_events").insert({
      tool_id: input.toolId,
      user_id: input.userId ?? null,
      source: input.source ?? "direct",
      query: input.query ? input.query.trim().slice(0, 200) : null,
    });
    if (error) console.error("[telemetry] tool view insert failed", error.code, error.message);
  } catch (err) {
    console.error("[telemetry] tool view insert threw", err);
  }
}

export type SecurityEventKind =
  | "login_failed"
  | "login_blocked"
  | "signup_blocked"
  | "captcha_failed"
  | "permission_denied"
  | "rate_limited"
  | "admin_denied"
  | "suspicious";

export async function recordSecurityEvent(input: {
  kind: SecurityEventKind;
  severity?: "low" | "medium" | "high" | "critical";
  userId?: string | null;
  /* An email typed into a login form is a claim about an account, not proof of
     one. Stored so a burst against a single address is visible, never joined to
     a profile and never shown as "this person failed to log in". */
  subject?: string | null;
  ip?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  if (unavailable("security event")) return;

  try {
    const { error } = await createAdminClient().from("security_events").insert({
      kind: input.kind,
      severity: input.severity ?? "low",
      user_id: input.userId ?? null,
      subject: input.subject ? input.subject.slice(0, 320) : null,
      ip: input.ip ?? null,
      // Never a password, a token or a captcha response. Callers pass reasons
      // and counts; there is no path here that receives a credential.
      detail: input.detail ?? {},
    });
    if (error) console.error("[telemetry] security insert failed", error.code, error.message);
  } catch (err) {
    console.error("[telemetry] security insert threw", err);
  }
}

/*
  Job run bookkeeping.

  There is no scheduler. This exists so the one maintenance routine that does
  run, refresh_tool_terms, leaves a record, and so a scheduler added later has
  somewhere to write without a second design.
*/
export async function startJobRun(job: string): Promise<string | null> {
  if (unavailable("job run")) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("job_runs")
      .insert({ job, status: "running" })
      .select("id")
      .single();
    if (error) {
      console.error("[telemetry] job start failed", error.code, error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    console.error("[telemetry] job start threw", err);
    return null;
  }
}

export async function finishJobRun(
  id: string | null,
  outcome: { ok: boolean; error?: string; detail?: Record<string, unknown> },
): Promise<void> {
  if (!id || unavailable("job run")) return;
  try {
    const db = createAdminClient();
    const { data } = await db.from("job_runs").select("started_at").eq("id", id).single();
    const startedAt = (data as { started_at: string } | null)?.started_at;
    const finished = new Date();

    await db
      .from("job_runs")
      .update({
        status: outcome.ok ? "succeeded" : "failed",
        finished_at: finished.toISOString(),
        duration_ms: startedAt ? finished.getTime() - new Date(startedAt).getTime() : null,
        error: outcome.error ? outcome.error.slice(0, 2000) : null,
        detail: outcome.detail ?? {},
      })
      .eq("id", id);
  } catch (err) {
    console.error("[telemetry] job finish threw", err);
  }
}

/*
  The client address, as far as it can be trusted.

  X-Forwarded-For is set by whatever proxy is in front of the app and can be
  forged if nothing overwrites it. Recorded anyway, because in the one place it
  matters, a burst of failed logins, a forged address is itself the signal that
  something automated is at work. It is never used to authorise anything.
*/
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}
