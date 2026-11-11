import { planLabel, type BillingKind, type BillingPeriod } from "./catalog";

/*
  Revenue, MRR and ARR for /admin/revenue (phase STAT, D265). Pure, integer
  cents throughout, so the tests can pin every number.

  WHAT COUNTS. Only money that arrived: a request the NOWPayments webhook marked
  paid. A plan granted by hand on the account page has no invoice and is not
  revenue. Nothing renews by itself (D256), so "recurring" here means the
  monthly value of the paid plans running today: a yearly plan counts a twelfth
  of its price each month, and a plan whose period has ended counts nothing.

  ARR is MRR times twelve. It is a run rate, not a forecast: with no automatic
  renewal, it says what a year would bring if every running plan were bought
  again at the end of its period.
*/

export type PaidRequest = {
  user_id: string | null;
  kind: BillingKind;
  plan: string;
  period: BillingPeriod;
  amount_cents: number;
  currency: string;
  activated_at: string | null;
  subscription_id: string | null;
  /* The subscription the request switched on. PostgREST may give an object or a list. */
  subscriptions:
    | { status: string; current_period_end: string | null }
    | { status: string; current_period_end: string | null }[]
    | null;
};

export type PaidInvoice = {
  amount_cents: number;
  currency: string;
  paid_at: string;
  billing_requests: { kind: BillingKind; plan: string; period: BillingPeriod } | null;
};

export function monthlyCents(amountCents: number, period: BillingPeriod): number {
  return period === "yearly" ? Math.round(amountCents / 12) : amountCents;
}

function subOf(r: PaidRequest) {
  return Array.isArray(r.subscriptions) ? (r.subscriptions[0] ?? null) : r.subscriptions;
}

/* Running today: active and its period not over. */
export function isRunning(r: PaidRequest, now: Date): boolean {
  const s = subOf(r);
  if (!s || s.status !== "active") return false;
  if (!s.current_period_end) return true;
  return new Date(s.current_period_end).getTime() > now.getTime();
}

export type Recurring = {
  mrrCents: number;
  arrCents: number;
  payingAccounts: number;
  runningPlans: number;
  /* MRR per plan label, largest first. */
  byPlan: { label: string; mrrCents: number; plans: number }[];
};

/*
  One subscription can be paid more than once (bought again before it ended);
  only its latest paid request sets what it is worth now.
*/
export function recurring(requests: PaidRequest[], now: Date): Recurring {
  const latest = new Map<string, PaidRequest>();
  for (const r of requests) {
    if (r.currency !== "USD" || !r.activated_at || !isRunning(r, now)) continue;
    const key = r.subscription_id ?? `${r.user_id}:${r.kind}:${r.plan}:${r.activated_at}`;
    const seen = latest.get(key);
    if (!seen || (seen.activated_at ?? "") < r.activated_at) latest.set(key, r);
  }

  let mrr = 0;
  const accounts = new Set<string>();
  const plans = new Map<string, { mrrCents: number; plans: number }>();
  for (const r of latest.values()) {
    const m = monthlyCents(r.amount_cents, r.period);
    mrr += m;
    if (r.user_id) accounts.add(r.user_id);
    const label = planLabel(r.kind, r.plan);
    const p = plans.get(label) ?? { mrrCents: 0, plans: 0 };
    p.mrrCents += m;
    p.plans += 1;
    plans.set(label, p);
  }

  return {
    mrrCents: mrr,
    arrCents: mrr * 12,
    payingAccounts: accounts.size,
    runningPlans: latest.size,
    byPlan: [...plans.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.mrrCents - a.mrrCents),
  };
}

const DAY = 86_400_000;

export type Collected = {
  last30Cents: number;
  previous30Cents: number;
  allTimeCents: number;
  payments: number;
  /* The last twelve calendar months in UTC, oldest first, including empty ones. */
  byMonth: { month: string; cents: number; payments: number }[];
  byPlan: { label: string; cents: number; payments: number }[];
};

export function collected(invoices: PaidInvoice[], now: Date): Collected {
  const t = now.getTime();
  let last30 = 0;
  let prev30 = 0;
  let all = 0;
  let count = 0;

  const months: { month: string; cents: number; payments: number }[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ month: d.toISOString().slice(0, 7), cents: 0, payments: 0 });
  }
  const monthIndex = new Map(months.map((m, i) => [m.month, i]));
  const plans = new Map<string, { cents: number; payments: number }>();

  for (const inv of invoices) {
    if (inv.currency !== "USD") continue;
    const at = new Date(inv.paid_at).getTime();
    if (Number.isNaN(at) || at > t) continue;
    all += inv.amount_cents;
    count += 1;
    const age = t - at;
    if (age < 30 * DAY) last30 += inv.amount_cents;
    else if (age < 60 * DAY) prev30 += inv.amount_cents;

    const i = monthIndex.get(inv.paid_at.slice(0, 7));
    if (i !== undefined) {
      months[i]!.cents += inv.amount_cents;
      months[i]!.payments += 1;
    }

    const r = inv.billing_requests;
    const label = r ? planLabel(r.kind, r.plan) : "Unknown plan";
    const p = plans.get(label) ?? { cents: 0, payments: 0 };
    p.cents += inv.amount_cents;
    p.payments += 1;
    plans.set(label, p);
  }

  return {
    last30Cents: last30,
    previous30Cents: prev30,
    allTimeCents: all,
    payments: count,
    byMonth: months,
    byPlan: [...plans.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.cents - a.cents),
  };
}

/* Checkouts opened in a window and how many of them were paid. */
export function checkoutFunnel(
  requests: { status: string; created_at: string; provider: string | null }[],
  now: Date,
  days: number,
): { started: number; paid: number } {
  const since = now.getTime() - days * DAY;
  let started = 0;
  let paid = 0;
  for (const r of requests) {
    if (r.provider !== "nowpayments") continue;
    if (new Date(r.created_at).getTime() < since) continue;
    started += 1;
    if (r.status === "paid") paid += 1;
  }
  return { started, paid };
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
