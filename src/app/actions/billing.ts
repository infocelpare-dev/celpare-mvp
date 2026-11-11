"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { adminActionSession } from "@/lib/admin/guard";
import type { AdminState } from "@/lib/admin/action-state";
import type { Capability } from "@/lib/admin/capabilities";
import {
  BILLING_KINDS,
  BILLING_PERIODS,
  isCountryCode,
  isPaidPlan,
  periodLabel,
  periodsFor,
  planLabel,
  type BillingKind,
  type BillingPeriod,
} from "@/lib/billing/catalog";
import { coinLabel, isPayCoin } from "@/lib/billing/coins";
import { createInvoice, isNowpaymentsUrl, nowpaymentsConfigured } from "@/lib/billing/nowpayments";
import { activationEmailInfo, requestSummary } from "@/lib/billing/notify";
import { emailBillingCustomer, emailBillingPaymentLink } from "@/lib/email/dispatch";
import { siteUrl } from "@/lib/email/layout";
import { track } from "@/lib/statsig/server";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  Billing actions (phase CRYPTO, D256 to D260; Payoneer, D239, is gone).

  Every write is a database function that checks who is calling and moves a
  request one allowed step (migrations billing_manual_v1, crypto_billing_v1).
  These actions only validate the form, call that function, open the
  NOWPayments page, and explain refusals in plain words. Nothing here decides a
  price, a status or who may act: the database does. Payment is confirmed only
  by the signed webhook (app/api/billing/nowpayments/ipn), never by a page the
  customer returns to.
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

const checkoutSchema = z
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
    billingName: z.string().trim().min(1, "Enter the name for the receipt.").max(120, "Keep the name under 120 characters."),
    billingEmail: z.string().trim().email("Enter a valid email address.").max(254),
    country: z.string().trim().refine(isCountryCode, "Choose your country."),
    company: optionalText(120),
    address: optionalText(500),
    taxId: optionalText(64),
    payCurrency: z.string().trim().refine(isPayCoin, "Choose the coin you will pay with."),
    accept: z.literal("on", { message: "Confirm you have read how payment and refunds work." }),
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

function explainCheckout(message: string): string {
  if (message.includes("request_already_open"))
    return "A payment for this plan is already on its way. Wait for it to confirm, or see your billing page.";
  if (message.includes("developer_required"))
    return "Developer plans and sponsorship need a developer account. Turn on Developer Mode and accept the developer terms first.";
  if (message.includes("tool_not_eligible")) return "Only your own approved tools can be sponsored.";
  if (message.includes("too_many_requests")) return "Too many checkouts today. Try again tomorrow.";
  if (message.includes("invalid_plan")) return "That plan is not available.";
  if (message.includes("not_authorised")) return "Sign in to buy a plan.";
  return "We could not start the payment. Try again in a moment.";
}

export async function startCheckout(_prev: BillingFormState, formData: FormData): Promise<BillingFormState> {
  if (!isSupabaseConfigured() || !hasServiceRole() || !nowpaymentsConfigured()) {
    return { status: "error", message: "Payments are not switched on yet. Try again later." };
  }

  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
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
  if (!user) return { status: "error", message: "Sign in to buy a plan." };

  /* The request is created as the person, so RLS and the definer function's own
     checks decide whether they may buy this; the price comes from the database. */
  const { data: requestId, error } = await supabase.rpc("billing_start_checkout", {
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
  });
  if (error || typeof requestId !== "string") {
    if (error) console.error("[billing] checkout refused", error.message);
    return { status: "error", message: explainCheckout(error?.message ?? "") };
  }

  const { data: row } = await supabase
    .from("billing_requests")
    .select("amount_cents")
    .eq("id", requestId)
    .maybeSingle<{ amount_cents: number }>();
  if (!row) return { status: "error", message: "We could not start the payment. Try again in a moment." };

  let paymentUrl: string;
  try {
    const invoice = await createInvoice({
      requestId,
      amountCents: row.amount_cents,
      description: `Celpare ${planLabel(v.kind as BillingKind, v.plan)}, ${periodLabel(v.period as BillingPeriod)}`,
      origin: siteUrl(""),
      payCurrency: v.payCurrency,
    });
    /* Only the server records the invoice: billing_attach_checkout is service role only. */
    const { error: attachError } = await createAdminClient().rpc("billing_attach_checkout", {
      p_request: requestId,
      p_invoice_id: invoice.id,
      p_url: invoice.invoice_url,
      p_pay_currency: v.payCurrency,
    });
    if (attachError) throw new Error(attachError.message);
    paymentUrl = invoice.invoice_url;
  } catch (e) {
    /* The unpaid request is replaced by the next attempt (billing_start_checkout). */
    const why = e instanceof Error ? e.message : String(e);
    console.error("[billing] NOWPayments invoice failed", why);
    /* A coin switched off in the NOWPayments dashboard is refused with a 400. */
    if (/ 400: /.test(why)) {
      return {
        status: "error",
        message: `${coinLabel(v.payCurrency)} is not available right now. Choose another coin.`,
        fields: { payCurrency: "Choose another coin." },
      };
    }
    return { status: "error", message: "The payment page could not be opened. Try again in a minute." };
  }

  revalidatePath("/settings/billing");
  if (!isNowpaymentsUrl(paymentUrl)) return { status: "error", message: "The payment page could not be opened." };
  /* Statsig (D264): the first step of the paid funnel; purchase comes from the webhook. */
  await track("checkout_started", {
    userId: user.id,
    value: row.amount_cents / 100,
    metadata: { kind: v.kind, plan: v.plan, period: v.period, coin: v.payCurrency },
  });
  redirect(paymentUrl);
}

/* ------------------------------------------------------------------ admin */

function explainAdmin(message: string): string {
  if (message.includes("not_authorised")) return "Your role does not allow that.";
  if (message.includes("invalid_transition")) return "This request has moved on since the page loaded. Reload it.";
  if (message.includes("reason_required")) return "Give a reason. The customer sees it.";
  if (message.includes("not_activatable")) return "Only a paid request that is not yet active can be activated.";
  if (message.includes("invoice_not_paid")) return "This payment has not finished yet.";
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
): Promise<{ state: AdminState; result?: unknown }> {
  const gate = await adminActionSession(capability);
  if (!gate.ok) return { state: { status: "error", message: gate.message } };
  const { data, error } = await gate.session.db.rpc(rpc, args);
  if (error) {
    console.error(`[billing] ${rpc} refused`, error.message);
    return { state: { status: "error", message: explainAdmin(error.message) } };
  }
  revalidatePath("/admin/billing");
  revalidatePath(`/admin/billing/${requestId}`);
  return { state: { status: "success", message: success }, result: data };
}

/* Closes a checkout that will not complete: a part payment settled with the
   customer outside Celpare, or an abandoned one. */
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
    "Request closed.",
  );
  return state;
}

/*
  Emails the customer a reminder to finish an unpaid checkout (D262), from
  billing@celpare.com to the account's own sign in address. The email links to
  /settings/billing, where Continue to payment opens the NOWPayments page; it
  never carries the payment link itself. If the checkout has no NOWPayments
  invoice yet (the first attempt failed), one is created here first.
*/
export async function billingSendPaymentLink(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const p = id.safeParse(formData.get("requestId"));
  if (!p.success) return { status: "error", message: p.error.issues[0].message };
  const gate = await adminActionSession("billing.manage");
  if (!gate.ok) return { status: "error", message: gate.message };
  if (!hasServiceRole() || !nowpaymentsConfigured()) {
    return { status: "error", message: "Payments are not switched on on this server (NOWPayments keys missing)." };
  }

  const { data: r } = await gate.session.db
    .from("billing_requests")
    .select("id, user_id, kind, plan, period, amount_cents, status")
    .eq("id", p.data)
    .maybeSingle<{ id: string; user_id: string | null; kind: BillingKind; plan: string; period: BillingPeriod; amount_cents: number; status: string }>();
  if (!r) return { status: "error", message: "That request no longer exists." };
  if (r.status !== "awaiting_payment") {
    return {
      status: "error",
      message: "Only an unpaid checkout can be sent. A closed one cannot be reopened: the customer starts again from the pricing page.",
    };
  }

  const admin = createAdminClient();
  const { data: inv } = await admin.from("invoices").select("payment_url").eq("request_id", r.id).maybeSingle<{ payment_url: string | null }>();
  if (!inv) {
    try {
      const invoice = await createInvoice({
        requestId: r.id,
        amountCents: r.amount_cents,
        description: `Celpare ${planLabel(r.kind, r.plan)}, ${periodLabel(r.period)}`,
        origin: siteUrl(""),
      });
      const { error } = await admin.rpc("billing_attach_checkout", {
        p_request: r.id,
        p_invoice_id: invoice.id,
        p_url: invoice.invoice_url,
      });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error("[billing] admin invoice failed", e instanceof Error ? e.message : e);
      return { status: "error", message: "NOWPayments did not create the payment page. Try again in a minute." };
    }
  }

  const summary = await requestSummary(r.id);
  if (!summary) return { status: "error", message: "That request no longer exists." };
  const sent = await emailBillingPaymentLink(r.user_id, summary.email);

  await admin.rpc("admin_audit", {
    p_action: "billing.payment_link_sent",
    p_entity_type: "billing_request",
    p_entity_id: r.id,
    p_entity_label: summary.row.billing_email,
    p_reason: null,
    p_before: null,
    p_after: { result: sent.result, by: gate.session.userId, by_username: gate.session.username },
  });
  revalidatePath(`/admin/billing/${r.id}`);

  if (sent.result === "sent") return { status: "success", message: `Sent from billing@celpare.com to ${sent.to}.` };
  if (sent.result === "no_address") return { status: "error", message: "This account has no email address, so nothing was sent." };
  if (sent.result === "skipped") return { status: "error", message: "Email is not set up on this server (RESEND_API_KEY), so nothing was sent." };
  return { status: "error", message: "The email did not send. Try again in a minute." };
}

/* The webhook activates on its own. This is the safety net for a paid request
   that did not (for example the activation raised after payment was recorded). */
export async function billingActivate(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const p = id.safeParse(formData.get("requestId"));
  if (!p.success) return { status: "error", message: p.error.issues[0].message };
  const { state, result } = await adminStep("billing.verify", "admin_billing_activate", { p_id: p.data }, p.data, "Plan activated.");
  if (state.status === "success" && typeof result === "string") {
    const info = await activationEmailInfo(p.data, result);
    if (info) after(() => emailBillingCustomer(info.userId, "activated", info.email));
    revalidatePath("/admin/users");
  }
  return state;
}
