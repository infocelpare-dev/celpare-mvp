import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { ErrorState, PageHeader, Section, Table, TableWrap, Td, Th, Tr } from "@/components/admin/ui";
import { KpiCard, KpiGrid } from "@/components/analytics/kpi";
import { Breakdown, Funnel, Panel } from "@/components/analytics/breakdown";
import { delta } from "@/lib/analytics/series";
import { formatMoney } from "@/lib/billing/catalog";
import {
  checkoutFunnel,
  collected,
  monthLabel,
  recurring,
  type PaidInvoice,
  type PaidRequest,
} from "@/lib/billing/revenue";

export const dynamic = "force-dynamic";

/*
  Revenue, MRR and ARR (phase STAT, D265).

  Read as the admin, through RLS and billing.read, from the same tables the
  NOWPayments webhook writes. Nothing here is estimated (D13, D30): a figure is
  money that arrived, or the monthly value of a paid plan running today. Plans
  granted by hand have no invoice and are left out on purpose.

  Visitors live in Statsig (D264), linked from the header, because they are
  counted there and never stored in our database.
*/

const STATSIG_CONSOLE = "https://console.statsig.com/4odCGWCV4s4J8bVvy5rmlM";

const usd = (cents: number) => formatMoney(cents, "USD");

export default async function AdminRevenuePage() {
  const session = await requireAdmin("billing.read");
  const now = new Date();

  const [paidRequests, invoices, checkouts] = await Promise.all([
    session.db
      .from("billing_requests")
      .select("user_id, kind, plan, period, amount_cents, currency, activated_at, subscription_id, subscriptions(status, current_period_end)")
      .eq("status", "paid")
      .not("activated_at", "is", null)
      .limit(5000)
      .returns<PaidRequest[]>(),
    session.db
      .from("invoices")
      .select("amount_cents, currency, paid_at, billing_requests(kind, plan, period)")
      .eq("status", "paid")
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(5000)
      .returns<PaidInvoice[]>(),
    session.db
      .from("billing_requests")
      .select("status, created_at, provider")
      .gte("created_at", new Date(now.getTime() - 90 * 86_400_000).toISOString())
      .limit(5000)
      .returns<{ status: string; created_at: string; provider: string | null }[]>(),
  ]);

  const header = (
    <PageHeader
      title="Revenue"
      lead="Money that arrived, and the monthly value of the paid plans running today."
      action={
        <a
          href={STATSIG_CONSOLE}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-border px-3.5 py-1.5 text-[13px] font-medium hover:bg-surface"
        >
          Visitors in Statsig
        </a>
      }
    />
  );

  if (paidRequests.error || invoices.error || checkouts.error) {
    return (
      <>
        {header}
        <div className="mt-6">
          <ErrorState what="revenue" />
        </div>
      </>
    );
  }

  const rec = recurring(paidRequests.data ?? [], now);
  const col = collected(invoices.data ?? [], now);
  const f30 = checkoutFunnel(checkouts.data ?? [], now, 30);
  const f90 = checkoutFunnel(checkouts.data ?? [], now, 90);
  /* In dollars, so a small base change reads as dollars, not cents. */
  const change = delta(col.last30Cents / 100, col.previous30Cents / 100);
  const arppu = rec.payingAccounts ? Math.round(rec.mrrCents / rec.payingAccounts) : 0;
  const nothingYet = col.payments === 0;

  return (
    <>
      {header}

      {nothingYet ? (
        <p className="mt-6 rounded-xl border border-dashed border-border px-4 py-3 text-[13px] leading-relaxed text-muted">
          No payment has arrived yet, so every figure is zero. They fill in by themselves from the first paid checkout.
        </p>
      ) : null}

      <Section title="Recurring">
        <KpiGrid>
          <KpiCard label="MRR" value={usd(rec.mrrCents)} caption="Monthly value of paid plans running today" />
          <KpiCard label="ARR" value={usd(rec.arrCents)} caption="MRR times twelve, a run rate" />
          <KpiCard label="Paying accounts" value={rec.payingAccounts.toLocaleString("en-GB")} caption={`${rec.runningPlans} paid plans running`} />
          <KpiCard label="Per paying account" value={usd(arppu)} caption="MRR divided by paying accounts" />
        </KpiGrid>
      </Section>

      <Section title="Collected">
        <KpiGrid>
          <KpiCard
            label="Last 30 days"
            value={usd(col.last30Cents)}
            delta={col.previous30Cents || col.last30Cents ? change : undefined}
            against="the 30 days before"
          />
          <KpiCard label="30 days before" value={usd(col.previous30Cents)} />
          <KpiCard label="All time" value={usd(col.allTimeCents)} caption={`${col.payments.toLocaleString("en-GB")} payments`} />
          <KpiCard
            label="Checkouts paid, 30 days"
            value={f30.started ? `${Math.round((f30.paid / f30.started) * 100)}%` : "None"}
            caption={`${f30.paid} of ${f30.started} checkouts`}
          />
        </KpiGrid>
      </Section>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Panel title="MRR by plan" lead="Running paid plans, at their monthly value.">
          <Breakdown
            dimension="Plan"
            measure="MRR"
            rows={rec.byPlan.map((p) => ({ label: p.label, value: p.mrrCents / 100, extra: p.plans }))}
            extraLabel="Plans"
            empty="No paid plan is running."
          />
        </Panel>
        <Panel title="Collected by plan" lead="Every payment, all time, in US dollars.">
          <Breakdown
            dimension="Plan"
            measure="USD"
            rows={col.byPlan.map((p) => ({ label: p.label, value: p.cents / 100, extra: p.payments }))}
            extraLabel="Payments"
            empty="No payment yet."
          />
        </Panel>
      </div>

      <Section title="By month" lead="Payments received per calendar month (UTC), the last twelve months.">
        <TableWrap>
          <Table className="min-w-[420px]">
            <thead>
              <tr>
                <Th>Month</Th>
                <Th numeric>Collected</Th>
                <Th numeric>Payments</Th>
              </tr>
            </thead>
            <tbody>
              {[...col.byMonth].reverse().map((m) => (
                <Tr key={m.month}>
                  <Td>{monthLabel(m.month)}</Td>
                  <Td numeric>{usd(m.cents)}</Td>
                  <Td numeric>{m.payments}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Section>

      <Section title="Checkout funnel, 90 days" lead="Crypto checkouts opened on Celpare and how many were paid.">
        <Panel title="From checkout to paid">
          <Funnel
            steps={[
              { label: "Checkouts opened", value: f90.started },
              { label: "Paid and switched on", value: f90.paid },
            ]}
          />
        </Panel>
      </Section>

      <p className="mt-8 text-[12px] leading-relaxed text-muted">
        Plans granted by hand on an account page have no invoice and are not revenue. Each payment also reaches Statsig
        as a purchase event with its value. The queue and every payment are on{" "}
        <Link href="/admin/billing" className="underline underline-offset-4">
          Plans and billing
        </Link>
        .
      </p>
    </>
  );
}
