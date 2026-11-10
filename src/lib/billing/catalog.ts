/*
  Billing vocabulary (phase BILL, D239). Pure: no database, no React, so the
  form, the emails, the admin queue and the tests all read the same words.

  The amount a request is billed is NOT computed here. The database reads it
  from public.billing_prices when the request is submitted; the page shows the
  price from plans.ts, and a test keeps the two equal.
*/

export const BILLING_KINDS = ["individual", "developer", "sponsorship"] as const;
export type BillingKind = (typeof BILLING_KINDS)[number];

export const BILLING_PERIODS = ["monthly", "yearly"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

/* Statuses on the request. pending, under_review and invoice_sent are the
   Payoneer flow (D239), kept for history; the rest are the USDT checkout (D256). */
export const REQUEST_STATUSES = [
  "pending",
  "under_review",
  "invoice_sent",
  "awaiting_payment",
  "partially_paid",
  "expired",
  "paid",
  "rejected",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/* Statuses on the subscription. */
export type SubscriptionStatus = "active" | "expired" | "cancelled";

/* The one label a person sees, across request and subscription. */
export type DisplayStatus =
  | "Pending"
  | "Awaiting Payment"
  | "Partly Paid"
  | "Not Paid"
  | "Under Review"
  | "Invoice Sent"
  | "Paid"
  | "Active"
  | "Rejected"
  | "Expired";

/* Which plans each kind can buy, and what they are called. */
export const PAID_PLANS: Record<BillingKind, Record<string, string>> = {
  individual: { pro: "Pro", premium: "Premium" },
  developer: { pro: "Developer Pro", elite: "Developer Elite" },
  sponsorship: { sponsored: "Sponsored placement" },
};

/* Sponsorship is sold monthly only (lib/sponsored/config.ts). */
export function periodsFor(kind: BillingKind): BillingPeriod[] {
  return kind === "sponsorship" ? ["monthly"] : ["monthly", "yearly"];
}

export function isPaidPlan(kind: string, plan: string): kind is BillingKind {
  return (BILLING_KINDS as readonly string[]).includes(kind) && plan in PAID_PLANS[kind as BillingKind];
}

export function planLabel(kind: BillingKind, plan: string): string {
  return PAID_PLANS[kind]?.[plan] ?? plan;
}

export function periodLabel(period: BillingPeriod): string {
  return period === "yearly" ? "Yearly" : "Monthly";
}

export function displayStatus(
  request: { status: RequestStatus; activated_at?: string | null },
  subscription?: { status: SubscriptionStatus } | null,
): DisplayStatus {
  if (request.status === "rejected") return "Rejected";
  if (request.status === "awaiting_payment") return "Awaiting Payment";
  if (request.status === "partially_paid") return "Partly Paid";
  if (request.status === "expired") return "Not Paid";
  if (request.status === "paid" && request.activated_at) {
    if (subscription?.status === "expired") return "Expired";
    return "Active";
  }
  switch (request.status) {
    case "pending":
      return "Pending";
    case "under_review":
      return "Under Review";
    case "invoice_sent":
      return "Invoice Sent";
    default:
      return "Paid";
  }
}

/* What the person should expect next, in one sentence. */
export const NEXT_STEP: Record<DisplayStatus, string> = {
  Pending: "We received your request and will review it shortly.",
  "Awaiting Payment": "Finish paying in USDT on the NOWPayments page. Your plan turns on as soon as the payment confirms.",
  "Partly Paid": "Less than the price arrived, so nothing was switched on. We will email you to settle it.",
  "Not Paid": "This checkout closed without a payment. Nothing was charged.",
  "Under Review": "We are checking your details before sending an invoice.",
  "Invoice Sent": "An invoice was sent to your billing email by Payoneer.",
  Paid: "Your payment is confirmed. Your plan is being switched on.",
  Active: "Your plan is active.",
  Rejected: "This request was not accepted. The reason is shown below.",
  Expired: "This plan has ended and your account is back on Free.",
};

/* Integer cents to a price, never through float arithmetic on money. */
export function formatMoney(cents: number, currency = "USD"): string {
  const whole = Math.trunc(cents / 100);
  const part = String(Math.abs(cents % 100)).padStart(2, "0");
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${whole.toLocaleString("en-US")}.${part}`;
}

/* Two letter country codes, checked again by the database. */
export function isCountryCode(v: string): boolean {
  return /^[A-Za-z]{2}$/.test(v.trim());
}
