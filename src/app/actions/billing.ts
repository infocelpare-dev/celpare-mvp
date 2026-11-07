"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { adminActionSession } from "@/lib/admin/guard";
import type { AdminState } from "@/lib/admin/action-state";
import type { Capability } from "@/lib/admin/capabilities";
import {
  BILLING_KINDS,
  BILLING_PERIODS,
  formatMoney,
  isCountryCode,
  isPaidPlan,
  periodLabel,
  periodsFor,
  planLabel,
  type BillingKind,
  type BillingPeriod,
} from "@/lib/billing/catalog";
import { emailBillingAlert, emailBillingCustomer } from "@/lib/email/dispatch";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  Billing actions (phase BILL, D239 to D242).

  Every write is a database function that checks who is calling and moves a
  request one allowed step (migration billing_manual_v1). These actions only
  validate the form, call that function, explain its refusals in plain words,
  and send the emails after the response. Nothing here decides a price, a
  status or who may act: the database does.
*/

export type BillingFormState = {
  status: "idle" | "success" | "error";
  message: string;
  fields?: Partial<Record<string, string>>;
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : undefined));

const submitSchema = z
  .object({
    kind: z.enum(BILLING_KINDS),
    plan: z.string().trim().min(1),
    period: z.enum(BILLING_PERIODS),
    toolId: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined))
      .pipe(z.string().uuid("Choose one of your tools.").optional()),
    billingName: z.string().trim().min(1, "Enter the name for the invoice.").max(120, "Keep the name under 120 characters."),
    billingEmail: z.string().trim().email("Enter a valid email address.").max(254),
    country: z.string().trim().refine(isCountryCode, "Choose your country."),
    company: optionalText(120),
    address: optionalText(500),
    taxId: optionalText(64),
    note: optionalText(1000),
    accept: z.literal("on", { message: "Confirm you have read how billing and refunds work." }),
  })
  .superRefine((v, ctx) => {
    if (!isPaidPlan(v.kind, v.plan)) {
      ctx.addIssue({ code: "custom", path: ["plan"], message: "Choose a paid plan." });
    }
    if (!periodsFor(v.kind).includes(v.period)) {
      ctx.addIssue({ code: "custom", path: ["period"], message: "That billing period is not offered for this plan." });
    }
    if (v.kind === "sponsorship" && !v.toolId) {
      ctx.addIssue({ code: "custom", path: ["toolId"], message: "Choose the tool to sponsor." });
    }
  });

function explainSubmit(message: string): string {
  if (message.includes("request_already_open"))
    return "You already have an open request for this kind of plan. Follow it in your billing settings.";
  if (message.includes("developer_required"))
    return "Developer plans and sponsorship need a developer account. Turn on Developer Mode and accept the developer terms first.";
  if (message.includes("tool_not_eligible")) return "Only your own approved tools can be sponsored.";
  if (message.includes("too_many_requests")) return "Too many requests today. Try again tomorrow.";
  if (message.includes("invalid_plan")) return "That plan is not available.";
  if (message.includes("not_authorised")) return "Sign in to request a plan.";
  return "We could not send your request. Try again in a moment.";
}

export async function submitBillingRequest(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Billing is not available right now." };

  const parsed = submitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fields[key] ??= issue.message;
    }
    return { status: "error", message: "Check the highlighted fields.", fields };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in to request a plan." };

  const { data: id, error } = await supabase.rpc("billing_submit_request", {
    p_kind: v.kind,
    p_plan: v.plan,
    p_period: v.period,
    p_tool_id: v.toolId ?? null,
    p_billing_name: v.billingName,
    p_billing_email: v.billingEmail,
    p_country: v.country.toUpperCase(),
    p_company: v.company ?? null,
    p_address: v.address ?? null,
    p_tax_id: v.taxId ?? null,
    p_note: v.note ?? null,
  });
  if (error || typeof id !== "string") {
    if (error) console.error("[billing] submit refused", error.message);
    return { status: "error", message: explainSubmit(error?.message ?? "") };
  }

  // Read the amount the database billed, not one computed here.
  const { data: row } = await supabase
    .from("billing_requests")
    .select("amount_cents, currency")
    .eq("id", id)
    .maybeSingle();
  const kind = v.kind as BillingKind;
  const info = {
    plan: planLabel(kind, v.plan),
    period: periodLabel(v.period as BillingPeriod),
    amount: row ? formatMoney(row.amount_cents, row.currency) : "",
  };
  after(() =>
    Promise.all([
      emailBillingCustomer(user.id, "received", info),
      emailBillingAlert({
        ...info,
        billingName: v.billingName,
        billingEmail: v.billingEmail,
        country: v.country.toUpperCase(),
        requestId: id,
      }),
    ]),
  );

  revalidatePath("/settings/billing");
  return { status: "success", message: "Request sent. We will review it and email you." };
}

/* ------------------------------------------------------------------ admin */

function explainAdmin(message: string): string {
  if (message.includes("not_authorised")) return "Your role does not allow that.";
  if (message.includes("invalid_transition")) return "This request has moved on since the page loaded. Reload it.";
  if (message.includes("verification_required"))
    return "Tick the box to confirm you saw this payment in your Payoneer account.";
  if (message.includes("payment_ref_required")) return "Enter the Payoneer transaction id.";
  if (message.includes("invoice_ref_required")) return "Enter the Payoneer invoice reference.";
  if (message.includes("reason_required")) return "Give a reason. The customer sees it.";
  if (message.includes("not_activatable")) return "Only a paid request that is not yet active can be activated.";
  if (message.includes("invoice_not_paid")) return "Mark the invoice paid first.";
  if (message.includes("account_gone")) return "That account was deleted, so there is nothing to activate.";
  if (message.includes("developer_not_found")) return "That account has no developer profile any more.";
  if (message.includes("request_not_found")) return "That request no longer exists.";
  return "That did not work. Try again, and check the audit log if it repeats.";
}

const id = z.string().uuid("That is not a valid request.");

async function adminStep(
  capability: Capability,
  rpc: string,
  args: Record<string, unknown>,
  requestId: string,
  success: string,
): Promise<{ state: AdminState; db?: Awaited<ReturnType<typeof createClient>>; result?: unknown }> {
  const gate = await adminActionSession(capability);
  if (!gate.ok) return { state: { status: "error", message: gate.message } };
  const { data, error } = await gate.session.db.rpc(rpc, args);
  if (error) {
    console.error(`[billing] ${rpc} refused`, error.message);
    return { state: { status: "error", message: explainAdmin(error.message) } };
  }
  revalidatePath("/admin/billing");
  revalidatePath(`/admin/billing/${requestId}`);
  return { state: { status: "success", message: success }, db: gate.session.db, result: data };
}

type EmailRow = {
  user_id: string | null;
  kind: BillingKind;
  plan: string;
  period: BillingPeriod;
  amount_cents: number;
  currency: string;
};

async function emailInfo(db: Awaited<ReturnType<typeof createClient>>, requestId: string) {
  const { data } = await db
    .from("billing_requests")
    .select("user_id, kind, plan, period, amount_cents, currency")
    .eq("id", requestId)
    .maybeSingle<EmailRow>();
  if (!data) return null;
  return {
    userId: data.user_id,
    info: {
      plan: planLabel(data.kind, data.plan),
      period: periodLabel(data.period),
      amount: formatMoney(data.amount_cents, data.currency),
    },
  };
}

export async function billingStartReview(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const p = id.safeParse(formData.get("requestId"));
  if (!p.success) return { status: "error", message: p.error.issues[0].message };
  const { state } = await adminStep("billing.manage", "admin_billing_start_review", { p_id: p.data }, p.data, "Marked under review.");
  return state;
}

export async function billingMarkInvoiceSent(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const p = z
    .object({
      requestId: id,
      invoiceRef: z.string().trim().min(1, "Enter the Payoneer invoice reference.").max(120),
      dueOn: z
        .string()
        .trim()
        .optional()
        .transform((v) => (v ? v : undefined))
        .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker.").optional()),
    })
    .safeParse(Object.fromEntries(formData));
  if (!p.success) return { status: "error", message: p.error.issues[0].message };

  const { state, db, result } = await adminStep(
    "billing.manage",
    "admin_billing_mark_invoice_sent",
    {
      p_id: p.data.requestId,
      p_invoice_ref: p.data.invoiceRef,
      p_due_at: p.data.dueOn ? `${p.data.dueOn}T23:59:59Z` : null,
    },
    p.data.requestId,
    "Invoice recorded as sent.",
  );
  if (state.status === "success" && db) {
    const e = await emailInfo(db, p.data.requestId);
    if (e) {
      const invoiceNumber = typeof result === "string" ? result : undefined;
      after(() => emailBillingCustomer(e.userId, "invoice_sent", { ...e.info, invoiceNumber }));
    }
  }
  return state;
}

export async function billingReject(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const p = z
    .object({
      requestId: id,
      reason: z.string().trim().min(3, "Give a reason. The customer sees it.").max(1000),
    })
    .safeParse(Object.fromEntries(formData));
  if (!p.success) return { status: "error", message: p.error.issues[0].message };
  const { state } = await adminStep(
    "billing.manage",
    "admin_billing_reject",
    { p_id: p.data.requestId, p_reason: p.data.reason },
    p.data.requestId,
    "Request rejected.",
  );
  return state;
}

export async function billingMarkPaid(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const p = z
    .object({
      requestId: id,
      paymentRef: z.string().trim().min(1, "Enter the Payoneer transaction id.").max(120),
      verified: z.literal("on", { message: "Tick the box to confirm you saw this payment in your Payoneer account." }),
      note: optionalText(1000),
    })
    .safeParse(Object.fromEntries(formData));
  if (!p.success) return { status: "error", message: p.error.issues[0].message };
  const { state } = await adminStep(
    "billing.verify",
    "admin_billing_mark_paid",
    {
      p_id: p.data.requestId,
      p_payment_ref: p.data.paymentRef,
      p_verified_in_payoneer: true,
      p_note: p.data.note ?? null,
    },
    p.data.requestId,
    "Payment verified. Activate the plan next.",
  );
  return state;
}

export async function billingActivate(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const p = id.safeParse(formData.get("requestId"));
  if (!p.success) return { status: "error", message: p.error.issues[0].message };
  const { state, db, result } = await adminStep(
    "billing.verify",
    "admin_billing_activate",
    { p_id: p.data },
    p.data,
    "Plan activated.",
  );
  if (state.status === "success" && db) {
    const e = await emailInfo(db, p.data);
    let endsOn: string | undefined;
    if (typeof result === "string") {
      const { data: sub } = await db
        .from("subscriptions")
        .select("current_period_end")
        .eq("id", result)
        .maybeSingle<{ current_period_end: string }>();
      if (sub) {
        endsOn = new Date(sub.current_period_end).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        });
      }
    }
    if (e) after(() => emailBillingCustomer(e.userId, "activated", { ...e.info, endsOn }));
    revalidatePath("/admin/users");
  }
  return state;
}
