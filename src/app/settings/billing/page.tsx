import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { BackLink } from "@/components/ui/back-link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import {
  displayStatus,
  formatMoney,
  NEXT_STEP,
  periodLabel,
  planLabel,
  type BillingKind,
  type BillingPeriod,
  type RequestStatus,
  type SubscriptionStatus,
} from "@/lib/billing/catalog";
import { isBillingOpen } from "@/lib/platform/settings";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Billing",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/*
  The customer's billing (phase BILL, D239): what they are on, until when,
  every request with its status and history, and the invoices. Read through
  RLS, which answers with the caller's own rows only. A failed read says so,
  never renders as "no billing" (rule 13, D99).
*/

type Req = {
  id: string;
  kind: BillingKind;
  plan: string;
  period: BillingPeriod;
  amount_cents: number;
  currency: string;
  status: RequestStatus;
  reject_reason: string | null;
  activated_at: string | null;
  created_at: string;
  subscription_id: string | null;
  tools: { name: string } | null;
};
type Sub = {
  id: string;
  kind: BillingKind;
  plan: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  tools: { name: string } | null;
};
type Inv = {
  request_id: string;
  number: string;
  status: string;
  sent_at: string;
  paid_at: string | null;
  payment_url: string | null;
};
type Ev = { request_id: string; to_status: string; created_at: string };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const EVENT_LABEL: Record<string, string> = {
  pending: "Request sent",
  awaiting_payment: "Checkout opened",
  partially_paid: "Part payment received",
  expired: "Closed unpaid",
  under_review: "Under review",
  invoice_sent: "Invoice sent",
  paid: "Payment confirmed",
  active: "Plan activated",
  rejected: "Not accepted",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const checkout = (await searchParams).checkout;
  if (!isSupabaseConfigured()) redirect("/community");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/get-started");

  const [open, reqs, subs, invs, evs] = await Promise.all([
    isBillingOpen(),
    supabase
      .from("billing_requests")
      .select(
        "id, kind, plan, period, amount_cents, currency, status, reject_reason, activated_at, created_at, subscription_id, tools(name)",
      )
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<Req[]>(),
    supabase
      .from("subscriptions")
      .select("id, kind, plan, status, current_period_start, current_period_end, tools(name)")
      .order("current_period_end", { ascending: false })
      .limit(50)
      .returns<Sub[]>(),
    supabase.from("invoices").select("request_id, number, status, sent_at, paid_at, payment_url").limit(100).returns<Inv[]>(),
    supabase.from("billing_events").select("request_id, to_status, created_at").order("id").limit(500).returns<Ev[]>(),
  ]);

  const failed = reqs.error || subs.error || invs.error || evs.error;
  const requests = reqs.data ?? [];
  const subscriptions = subs.data ?? [];
  const active = subscriptions.filter((s) => s.status === "active");
  const subById = new Map(subscriptions.map((s) => [s.id, s]));
  const invByReq = new Map((invs.data ?? []).map((i) => [i.request_id, i]));
  const evByReq = new Map<string, Ev[]>();
  for (const e of evs.data ?? []) evByReq.set(e.request_id, [...(evByReq.get(e.request_id) ?? []), e]);

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />} signedIn>
      <Container className="max-w-[640px] py-10 sm:py-14">
        <BackLink href="/settings" label="Back to settings" className="mb-5" />
        <h1 className="text-[clamp(1.6rem,4vw,2.1rem)] font-medium leading-tight tracking-[-0.03em]">Billing</h1>

        {/* Back from NOWPayments. The return page proves nothing: only the
            signed webhook confirms a payment, so this only says what to expect. */}
        {checkout === "paid" || checkout === "partial" ? (
          <div role="status" className="mt-6 rounded-2xl border border-border p-5">
            <p className="text-[15px] font-medium">
              {checkout === "paid" ? "Payment sent. Waiting for confirmation." : "Part of the payment arrived."}
            </p>
            <p className="mt-1 text-[14px] text-muted">
              {checkout === "paid"
                ? "Your plan switches on by itself once the blockchain confirms the payment, usually within minutes. We email you when it does. Reload this page to see it."
                : "Less than the price arrived, so the plan is not on yet. Send the rest from the same NOWPayments page, or write to billing@celpare.com."}
            </p>
          </div>
        ) : checkout === "cancelled" ? (
          <div role="status" className="mt-6 rounded-2xl border border-border p-5">
            <p className="text-[15px] font-medium">Payment not finished</p>
            <p className="mt-1 text-[14px] text-muted">Nothing was charged. You can pay again from the checkout below or from pricing.</p>
          </div>
        ) : null}

        {failed ? (
          <div role="alert" className="mt-6 rounded-2xl border border-foreground p-5">
            <p className="text-[15px] font-medium">Your billing could not be loaded.</p>
            <p className="mt-1 text-[14px] text-muted">
              This is on our side. Reload the page, or write to billing@celpare.com if it keeps happening.
            </p>
          </div>
        ) : (
          <>
            <section className="mt-8">
              <h2 className="text-[17px] font-medium tracking-[-0.01em]">Your plans</h2>
              {active.length ? (
                <ul className="mt-4 space-y-3">
                  {active.map((s) => (
                    <li key={s.id} className="rounded-2xl border border-border p-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[15px] font-medium">
                          {planLabel(s.kind, s.plan)}
                          {s.tools?.name ? <span className="font-normal text-muted"> for {s.tools.name}</span> : null}
                        </p>
                        <StatusBadge label="Active" />
                      </div>
                      <p className="mt-2 text-[14px] text-muted">
                        Since {day(s.current_period_start)}. Active until {day(s.current_period_end)}. It does not
                        renew automatically: pay for the next period from pricing before it ends to keep it.
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[15px] text-muted">You are on the Free plan.</p>
              )}
              {open ? (
                <ButtonLink href="/pricing" variant="outline" className="mt-5">
                  See paid plans
                </ButtonLink>
              ) : null}
            </section>

            <section className="mt-12 border-t border-border pt-10">
              <h2 className="text-[17px] font-medium tracking-[-0.01em]">Payments</h2>
              {requests.length ? (
                <ul className="mt-4 space-y-4">
                  {requests.map((r) => {
                    const sub = r.subscription_id ? subById.get(r.subscription_id) : null;
                    const label = displayStatus(r, sub);
                    const inv = invByReq.get(r.id);
                    const history = evByReq.get(r.id) ?? [];
                    return (
                      <li key={r.id} className="rounded-2xl border border-border p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[15px] font-medium">
                              {planLabel(r.kind, r.plan)}
                              {r.tools?.name ? <span className="font-normal text-muted"> for {r.tools.name}</span> : null}
                            </p>
                            <p className="mt-0.5 text-[14px] text-muted">
                              {periodLabel(r.period)}, {formatMoney(r.amount_cents, r.currency)}. Sent {day(r.created_at)}.
                            </p>
                          </div>
                          <StatusBadge label={label} />
                        </div>
                        <p className="mt-3 text-[14px]">{NEXT_STEP[label]}</p>
                        {r.status === "awaiting_payment" && inv?.payment_url && inv.payment_url.startsWith("https://") ? (
                          <a
                            href={inv.payment_url}
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex h-10 items-center rounded-full bg-primary px-5 text-[14px] font-medium text-on-primary transition-colors duration-200 hover:bg-primary-hover"
                          >
                            Continue to payment
                          </a>
                        ) : null}
                        {r.status === "rejected" && r.reject_reason ? (
                          <p className="mt-2 text-[14px] text-muted">Reason: {r.reject_reason}</p>
                        ) : null}
                        {inv ? (
                          <p className="mt-2 text-[14px] text-muted">
                            Celpare reference {inv.number}
                            {inv.paid_at ? `, paid ${day(inv.paid_at)}` : `, sent ${day(inv.sent_at)}`}
                            {inv.status === "void" ? ", cancelled" : ""}.
                          </p>
                        ) : null}
                        {history.length ? (
                          <ol className="mt-4 space-y-1.5 border-l border-border pl-4 text-[13px] text-muted">
                            {history.map((e, i) => (
                              <li key={i}>
                                <span className="text-foreground">{EVENT_LABEL[e.to_status] ?? e.to_status}</span>,{" "}
                                {day(e.created_at)}
                              </li>
                            ))}
                          </ol>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-[15px] text-muted">No payments yet.</p>
              )}
            </section>

            <p className="mt-10 text-[13px] leading-relaxed text-muted">
              Celpare takes payment in USDT through NOWPayments and never asks for card details, wallet keys, seed
              phrases or payment screenshots.
              Questions:{" "}
              <Link href="mailto:billing@celpare.com" className="underline underline-offset-2">
                billing@celpare.com
              </Link>
              .
            </p>
          </>
        )}
      </Container>
    </AppShell>
  );
}

/* Lime is an accent for active states only (D2): Active gets the lime dot,
   every other status is ink on paper. Never white text on lime. */
function StatusBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] font-medium">
      <span
        aria-hidden
        className={label === "Active" ? "size-1.5 rounded-full bg-accent" : "size-1.5 rounded-full bg-muted"}
      />
      {label}
    </span>
  );
}
