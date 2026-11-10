import "server-only";
import { formatMoney, periodLabel, planLabel, type BillingKind, type BillingPeriod } from "@/lib/billing/catalog";
import type { BillingEmailInput } from "@/lib/email/messages";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  What the billing emails say, read with the service role because the webhook
  has no signed in person. Used by the webhook and by the admin's manual
  Activate, so both send the same words.
*/

type Row = {
  user_id: string | null;
  kind: BillingKind;
  plan: string;
  period: BillingPeriod;
  amount_cents: number;
  currency: string;
  billing_name: string;
  billing_email: string;
  country: string;
};

export async function requestSummary(requestId: string) {
  const db = createAdminClient();
  const [{ data: r }, { data: inv }] = await Promise.all([
    db
      .from("billing_requests")
      .select("user_id, kind, plan, period, amount_cents, currency, billing_name, billing_email, country")
      .eq("id", requestId)
      .maybeSingle<Row>(),
    db.from("invoices").select("number").eq("request_id", requestId).maybeSingle<{ number: string }>(),
  ]);
  if (!r) return null;
  const email: BillingEmailInput = {
    plan: planLabel(r.kind, r.plan),
    period: periodLabel(r.period),
    amount: formatMoney(r.amount_cents, r.currency),
    invoiceNumber: inv?.number,
  };
  return { row: r, email };
}

export async function activationEmailInfo(requestId: string, subscriptionId: string) {
  const s = await requestSummary(requestId);
  if (!s) return null;
  const { data: sub } = await createAdminClient()
    .from("subscriptions")
    .select("current_period_end")
    .eq("id", subscriptionId)
    .maybeSingle<{ current_period_end: string }>();
  const endsOn = sub
    ? new Date(sub.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : undefined;
  return { userId: s.row.user_id, email: { ...s.email, endsOn } };
}
