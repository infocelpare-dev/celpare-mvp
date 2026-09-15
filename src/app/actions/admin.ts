"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminActionSession } from "@/lib/admin/guard";
import type { Capability } from "@/lib/admin/capabilities";
import type { AdminState } from "@/lib/admin/action-state";

export type { AdminState };

/*
  Every write the admin dashboard performs.

  The doctrine from developer.ts holds and matters more here, because this
  surface can suspend a person and approve a listing:

    1. A zod allowlist on the way in. formData is never spread into a call.
    2. The RPC is the control, not this file. Every function below calls a
       SECURITY DEFINER routine that re-checks the capability in SQL, refuses to
       act above its own privilege, and writes the audit entry in the same
       transaction as the change. A perfect forgery of this file changes nothing.
    3. The capability check here is the second control, so that a form which
       should never have rendered gets a sentence rather than a database error.

  Nothing in here reads a role out of a cookie, a header or a form field. The
  only source of what the caller may do is profiles.role, read server side, and
  the capability matrix in the database.
*/


/*
  Turn a Postgres error into a sentence.

  The RPCs raise with stable tokens rather than prose so that the wording lives
  here, on the side that knows who is reading it. An unrecognised code is
  reported as itself: a message nobody wrote is better than a reassuring one
  that is wrong.
*/
function explain(error: { code?: string; message: string }): string {
  const m = error.message;

  if (m.includes("not_authorised")) return "Your role does not allow that.";
  if (m.includes("cannot_act_on_self")) return "You cannot do that to your own account.";
  if (m.includes("cannot_change_own_role")) return "You cannot change your own role.";
  if (m.includes("target_outranks_you"))
    return "That account holds the same or higher privileges than yours.";
  if (m.includes("last_super_admin"))
    return "That is the last super admin. Promote somebody else first.";
  if (m.includes("reason_required")) return "Give a reason. It goes in the audit log.";
  if (m.includes("user_not_found")) return "That account no longer exists.";
  if (m.includes("report_not_found")) return "That report no longer exists.";
  if (m.includes("content_not_found")) return "That content no longer exists.";
  if (m.includes("tool_not_found")) return "That tool no longer exists.";
  if (m.includes("model_not_found")) return "That model no longer exists.";
  if (m.includes("developer_not_found")) return "That developer profile no longer exists.";
  if (m.includes("unknown_setting")) return "That setting does not exist.";
  if (m.includes("unknown_taxonomy")) return "That is not a category or a topic.";
  if (m.includes("taxonomy_not_found")) return "That entry no longer exists.";
  if (m.includes("name_required")) return "Give it a name.";
  if (m.includes("invalid_slug"))
    return "A slug is lowercase letters, digits and single hyphens. No spaces.";
  if (m.includes("slug_taken")) return "That slug is already taken.";
  if (m.includes("taxonomy_in_use")) {
    const used = m.match(/taxonomy_in_use:(\d+)/)?.[1];
    return used
      ? `Still used by ${used} item${used === "1" ? "" : "s"}. Move them first.`
      : "Something still uses that. Move it first.";
  }
  if (m.includes("name_and_provider_required")) return "Name and provider are both required.";
  if (m.includes("invalid_context_window")) return "A context window cannot be negative.";
  if (m.includes("invalid_price")) return "A price cannot be negative.";
  if (m.startsWith("invalid_")) return "That value is not one of the allowed options.";

  console.error("[admin action] unmapped error", error.code, m);
  return `Could not complete that: ${m}`;
}

/*
  One shape for every action: check the capability, validate, call the RPC,
  revalidate, answer.

  Written once rather than eleven times, because the step that is easy to forget
  when copying a handler is the capability check, and a missing one here would
  mean the second control silently disappears for one action.
*/
async function run(
  capability: Capability,
  rpc: string,
  args: Record<string, unknown>,
  revalidate: string[],
  success: string,
): Promise<AdminState> {
  const gate = await adminActionSession(capability);
  if (!gate.ok) return { status: "error", message: gate.message };

  const { error } = await gate.session.db.rpc(rpc, args);
  if (error) return { status: "error", message: explain(error) };

  for (const path of revalidate) revalidatePath(path);
  return { status: "success", message: success };
}

const uuid = z.string().uuid("That is not a valid id.");
const reason = z
  .string()
  .trim()
  .min(3, "Give a reason. It goes in the audit log.")
  .max(1000, "Keep the reason under 1000 characters.");
const optionalReason = z.string().trim().max(1000).optional();

/* ------------------------------------------------------------------ users */

const statusSchema = z.object({
  userId: uuid,
  status: z.enum(["active", "suspended", "disabled", "deleted"]),
  reason: optionalReason,
  /* A suspension with an end date is a suspension; one without is indefinite.
     Both are legitimate, so this is optional rather than required. */
  until: z.string().trim().optional(),
});

export async function setUserStatus(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = statusSchema.safeParse({
    userId: formData.get("userId"),
    status: formData.get("status"),
    reason: formData.get("reason") ?? undefined,
    until: formData.get("until") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { userId, status, until } = parsed.data;
  if (status !== "active" && !parsed.data.reason) {
    return { status: "error", message: "Give a reason. It goes in the audit log." };
  }

  return run(
    "users.moderate",
    "admin_set_user_status",
    {
      p_user_id: userId,
      p_status: status,
      p_reason: parsed.data.reason ?? null,
      // datetime-local gives a wall clock string with no zone. Parsed here so an
      // unparseable value becomes an indefinite suspension rather than a crash.
      p_until: until ? (Number.isNaN(Date.parse(until)) ? null : new Date(until).toISOString()) : null,
    },
    ["/admin/users", `/admin/users/${userId}`, "/admin"],
    status === "active" ? "Account restored." : `Account ${status}.`,
  );
}

const roleSchema = z.object({
  userId: uuid,
  role: z.enum(["user", "support", "moderator", "dev_ops", "ai_ops", "admin", "super_admin"]),
  reason,
});

export async function setUserRole(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = roleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  return run(
    "users.role",
    "admin_set_user_role",
    { p_user_id: parsed.data.userId, p_role: parsed.data.role, p_reason: parsed.data.reason },
    ["/admin/users", `/admin/users/${parsed.data.userId}`, "/admin/security"],
    "Role changed.",
  );
}

const planSchema = z.object({
  userId: uuid,
  plan: z.enum(["free", "pro", "premium"]),
  reason,
});

export async function setUserPlan(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = planSchema.safeParse({
    userId: formData.get("userId"),
    plan: formData.get("plan"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  return run(
    "users.plan",
    "admin_set_user_plan",
    { p_user_id: parsed.data.userId, p_plan: parsed.data.plan, p_reason: parsed.data.reason },
    ["/admin/users", `/admin/users/${parsed.data.userId}`, "/admin/billing"],
    "Plan changed.",
  );
}

export async function warnUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({ userId: uuid, reason })
    .safeParse({ userId: formData.get("userId"), reason: formData.get("reason") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  return run(
    "users.moderate",
    "admin_warn_user",
    { p_user_id: parsed.data.userId, p_reason: parsed.data.reason },
    /* Also the moderation queue, where warning an author is now reachable
       without leaving the content that prompted it. */
    [`/admin/users/${parsed.data.userId}`, "/admin/community"],
    "Warning recorded.",
  );
}

/* ------------------------------------------------------------- community */

const contentSchema = z.object({
  entityType: z.enum(["post", "comment"]),
  entityId: uuid,
  status: z.enum(["visible", "hidden", "removed"]),
  reason: optionalReason,
});

export async function setContentStatus(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = contentSchema.safeParse({
    entityType: formData.get("entityType"),
    entityId: formData.get("entityId"),
    status: formData.get("status"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const label =
    parsed.data.status === "visible"
      ? "restored"
      : parsed.data.status === "hidden"
        ? "hidden"
        : "removed";

  return run(
    "content.moderate",
    "admin_set_content_status",
    {
      p_entity_type: parsed.data.entityType,
      p_entity_id: parsed.data.entityId,
      p_status: parsed.data.status,
      p_reason: parsed.data.reason ?? null,
    },
    ["/admin/community", "/admin/reports", "/admin"],
    `${parsed.data.entityType === "post" ? "Post" : "Comment"} ${label}.`,
  );
}

/* --------------------------------------------------------------- reports */

const resolveSchema = z.object({
  reportId: uuid,
  resolution: z.enum(["open", "investigating", "upheld", "dismissed"]),
  note: optionalReason,
  /* Optional on purpose. Upholding a report does not always mean removing the
     content, and a moderator should be able to say so. */
  contentAction: z.enum(["visible", "hidden", "removed"]).optional(),
});

export async function resolveReport(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const raw = formData.get("contentAction");
  const parsed = resolveSchema.safeParse({
    reportId: formData.get("reportId"),
    resolution: formData.get("resolution"),
    note: formData.get("note") ?? undefined,
    contentAction: raw && raw !== "" ? raw : undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  return run(
    "content.moderate",
    "admin_resolve_report",
    {
      p_report_id: parsed.data.reportId,
      p_resolution: parsed.data.resolution,
      p_note: parsed.data.note ?? null,
      p_content_action: parsed.data.contentAction ?? null,
    },
    ["/admin/reports", `/admin/reports/${parsed.data.reportId}`, "/admin/community", "/admin"],
    parsed.data.resolution === "investigating" ? "Report escalated." : "Report resolved.",
  );
}

export async function triageReport(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = z
    .object({
      reportId: uuid,
      priority: z.enum(["low", "normal", "high", "critical"]).optional(),
      assign: z.enum(["yes", "no"]).optional(),
    })
    .safeParse({
      reportId: formData.get("reportId"),
      priority: formData.get("priority") || undefined,
      assign: formData.get("assign") || undefined,
    });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  return run(
    "content.moderate",
    "admin_triage_report",
    {
      p_report_id: parsed.data.reportId,
      p_priority: parsed.data.priority ?? null,
      p_assign: parsed.data.assign ? parsed.data.assign === "yes" : null,
    },
    ["/admin/reports", `/admin/reports/${parsed.data.reportId}`],
    "Report updated.",
  );
}

/* ----------------------------------------------------------- submissions */

const reviewSchema = z.object({
  kind: z.enum(["tool", "model"]),
  id: uuid,
  decision: z.enum(["approve", "reject", "request_changes", "suspend", "restore"]),
  reason: optionalReason,
});

export async function reviewSubmission(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = reviewSchema.safeParse({
    kind: formData.get("kind"),
    id: formData.get("id"),
    decision: formData.get("decision"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const { kind, id, decision } = parsed.data;
  // Said here as well as in SQL so the person gets the sentence before the round
  // trip, not a database error after it.
  if (["reject", "request_changes", "suspend"].includes(decision) && !parsed.data.reason) {
    return {
      status: "error",
      message: "Give a reason. The developer has to act on it, so they get to read it.",
    };
  }

  const said: Record<string, string> = {
    approve: "Approved and published.",
    reject: "Rejected.",
    request_changes: "Sent back for changes.",
    suspend: "Suspended and returned to the queue.",
    restore: "Restored.",
  };

  return run(
    "submissions.review",
    "admin_review_submission",
    { p_kind: kind, p_id: id, p_decision: decision, p_reason: parsed.data.reason ?? null },
    ["/admin/submissions", `/admin/${kind}s`, `/admin/${kind}s/${id}`, "/admin"],
    said[decision] ?? "Done.",
  );
}

export async function setToolVerified(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = z
    .object({ id: uuid, verified: z.enum(["yes", "no"]), reason: optionalReason })
    .safeParse({
      id: formData.get("id"),
      verified: formData.get("verified"),
      reason: formData.get("reason") ?? undefined,
    });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  return run(
    "submissions.review",
    "admin_set_tool_verified",
    {
      p_id: parsed.data.id,
      p_verified: parsed.data.verified === "yes",
      p_reason: parsed.data.reason ?? null,
    },
    ["/admin/tools", `/admin/tools/${parsed.data.id}`],
    parsed.data.verified === "yes" ? "Tool verified." : "Verification removed.",
  );
}

export async function setDeveloperVerified(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = z
    .object({ id: uuid, verified: z.enum(["yes", "no"]), reason: optionalReason })
    .safeParse({
      id: formData.get("id"),
      verified: formData.get("verified"),
      reason: formData.get("reason") ?? undefined,
    });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  return run(
    "developers.manage",
    "admin_set_developer_verified",
    {
      p_id: parsed.data.id,
      p_verified: parsed.data.verified === "yes",
      p_reason: parsed.data.reason ?? null,
    },
    ["/admin/developers", `/admin/developers/${parsed.data.id}`],
    parsed.data.verified === "yes" ? "Developer verified." : "Verification removed.",
  );
}

/* -------------------------------------------------------------- settings */

export async function setSetting(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({
      scope: z.enum(["platform", "community"]),
      key: z.string().trim().min(2).max(60),
      value: z.string().max(4000),
      reason: optionalReason,
    })
    .safeParse({
      scope: formData.get("scope"),
      key: formData.get("key"),
      value: formData.get("value"),
      reason: formData.get("reason") ?? undefined,
    });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  /*
    Settings are jsonb, and the form posts a string. Parsed here so that a typo
    is rejected with a sentence rather than stored as the literal text "ture"
    and read back by report_hide_threshold() as nonsense.

    A bare word that is not valid JSON is treated as a string, so somebody
    typing an announcement does not have to remember the quotes.
  */
  let value: unknown;
  try {
    value = JSON.parse(parsed.data.value);
  } catch {
    const trimmed = parsed.data.value.trim();
    if (trimmed === "" ) {
      value = "";
    } else if (/^[\d.]+$/.test(trimmed) || trimmed === "true" || trimmed === "false") {
      // These only reach here if JSON.parse already failed, which means the
      // value is malformed rather than a plain number or boolean.
      return { status: "error", message: "That is not a valid value for this setting." };
    } else {
      value = trimmed;
    }
  }

  return run(
    "settings.manage",
    "admin_set_setting",
    {
      p_scope: parsed.data.scope,
      p_key: parsed.data.key,
      p_value: value,
      p_reason: parsed.data.reason ?? null,
    },
    ["/admin/settings", "/admin"],
    "Setting saved.",
  );
}


/* -------------------------------------------------------------- taxonomy */

/*
  Categories and topics, brief section 20.

  Both tables are the same shape and share one pair of routines, so these two
  actions carry a `kind` rather than being duplicated per table. The slug is
  validated again in SQL, because this action is a convenience and the RPC is
  the control.
*/
const taxonomySchema = z.object({
  kind: z.enum(["category", "topic"]),
  /* Absent when creating. An empty string posts from a form with no id, so it
     is normalised to undefined rather than failing uuid parsing. */
  id: uuid.optional(),
  slug: z
    .string()
    .trim()
    .min(2, "A slug needs at least two characters.")
    .max(60, "Keep the slug under 60 characters."),
  name: z.string().trim().min(1, "Give it a name.").max(80, "Keep the name under 80 characters."),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  reason: optionalReason,
});

export async function upsertTaxonomy(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const rawId = String(formData.get("id") ?? "").trim();

  const parsed = taxonomySchema.safeParse({
    kind: formData.get("kind"),
    id: rawId === "" ? undefined : rawId,
    slug: formData.get("slug") ?? "",
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? undefined,
    sortOrder: formData.get("sortOrder") ?? undefined,
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  return run(
    "settings.manage",
    "admin_upsert_taxonomy",
    {
      p_kind: parsed.data.kind,
      p_id: parsed.data.id ?? null,
      p_slug: parsed.data.slug,
      p_name: parsed.data.name,
      p_description: parsed.data.description ?? null,
      p_sort_order: parsed.data.sortOrder ?? 0,
      p_reason: parsed.data.reason ?? null,
    },
    ["/admin/taxonomy", "/admin/settings"],
    parsed.data.id ? "Saved." : "Added.",
  );
}

export async function deleteTaxonomy(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = z
    .object({ kind: z.enum(["category", "topic"]), id: uuid, reason: optionalReason })
    .safeParse({
      kind: formData.get("kind"),
      id: formData.get("id"),
      reason: formData.get("reason") ?? undefined,
    });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  return run(
    "settings.manage",
    "admin_delete_taxonomy",
    {
      p_kind: parsed.data.kind,
      p_id: parsed.data.id,
      p_reason: parsed.data.reason ?? null,
    },
    ["/admin/taxonomy"],
    "Deleted.",
  );
}

/* ---------------------------------------------------------------- models */

/*
  Model metadata, brief section 6.

  The slug is not here and cannot be changed from the dashboard: it is the
  model's public URL. Neither is status, which goes through
  admin_review_submission with the rest of the catalogue decisions, so that
  approving a model is one audited path rather than two.
*/
export async function updateModel(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({
      id: uuid,
      name: z.string().trim().min(1, "Give it a name.").max(120),
      provider: z.string().trim().min(1, "Name the provider.").max(60),
      description: z.string().trim().max(2000).optional(),
      contextWindow: z.coerce.number().int().min(0).max(100_000_000).optional(),
      inputPrice: z.coerce.number().min(0).max(100_000).optional(),
      outputPrice: z.coerce.number().min(0).max(100_000).optional(),
      /* Comma separated in the form, an array in the column. */
      modalities: z.string().trim().max(200).optional(),
      websiteUrl: z.string().trim().max(500).optional(),
      reason: optionalReason,
    })
    .safeParse({
      id: formData.get("id"),
      name: formData.get("name") ?? "",
      provider: formData.get("provider") ?? "",
      description: formData.get("description") ?? undefined,
      contextWindow: formData.get("contextWindow") || undefined,
      inputPrice: formData.get("inputPrice") || undefined,
      outputPrice: formData.get("outputPrice") || undefined,
      modalities: formData.get("modalities") ?? undefined,
      websiteUrl: formData.get("websiteUrl") ?? undefined,
      reason: formData.get("reason") ?? undefined,
    });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const modalities = parsed.data.modalities
    ? parsed.data.modalities
        .split(",")
        .map((m) => m.trim().toLowerCase())
        .filter(Boolean)
    : null;

  return run(
    "models.manage",
    "admin_update_model",
    {
      p_id: parsed.data.id,
      p_name: parsed.data.name,
      p_provider: parsed.data.provider,
      p_description: parsed.data.description ?? null,
      p_context_window: parsed.data.contextWindow ?? null,
      p_input_price_per_m: parsed.data.inputPrice ?? null,
      p_output_price_per_m: parsed.data.outputPrice ?? null,
      p_modalities: modalities,
      p_website_url: parsed.data.websiteUrl ?? null,
      p_reason: parsed.data.reason ?? null,
    },
    ["/admin/models", `/admin/models/${parsed.data.id}`],
    "Model updated.",
  );
}
