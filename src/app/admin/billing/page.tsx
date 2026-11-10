import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { getAiAnalytics, getOverview, listAudit } from "@/lib/admin/queries";
import { ShareBar } from "@/components/ui/charts";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  Section,
  Stat,
  StatGrid,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
  StatusBadge,
  Usd,
  When,
} from "@/components/admin/ui";
import { BILLING_STATUS_TONE } from "@/components/admin/billing-status";
import {
  displayStatus,
  formatMoney,
  periodLabel,
  planLabel,
  type BillingKind,
  type BillingPeriod,
  type RequestStatus,
} from "@/lib/billing/catalog";

export const dynamic = "force-dynamic";

/*
  Plans and billing.

  Billing is crypto through NOWPayments (phase CRYPTO, D256 to D262): the
  customer pays on a NOWPayments page and the signed webhook switches the plan
  on. The queue is mostly to watch, not to work: part payments and old Payoneer
  requests (D239) are the only ones that need a person. Nothing renews by
  itself, so there is no churn or failed renewal to report.

  Also here, as before: accounts by plan, the AI cost each plan generates, and
  every plan change with its reason. A plan can still be granted by hand from
  the account page; those changes have no invoice and are listed below.
*/

const QUEUE_TABS: { key: string; label: string; statuses: RequestStatus[] }[] = [
  { key: "partially_paid", label: "Needs attention", statuses: ["partially_paid", "pending", "under_review", "invoice_sent"] },
  { key: "awaiting_payment", label: "Awaiting payment", statuses: ["awaiting_payment"] },
  { key: "paid", label: "Paid", statuses: ["paid"] },
  { key: "expired", label: "Not paid", statuses: ["expired"] },
  { key: "rejected", label: "Closed", statuses: ["rejected"] },
];

type PaidRow = {
  request_id: string;
  number: string;
  amount_cents: number;
  currency: string;
  paid_at: string;
  payment_ref: string;
  billing_requests: { kind: BillingKind; plan: string; billing_name: string; billing_email: string; user_id: string | null } | null;
};

type QueueRow = {
  id: string;
  kind: BillingKind;
  plan: string;
  period: BillingPeriod;
  amount_cents: number;
  currency: string;
  billing_name: string;
  billing_email: string;
  country: string;
  status: RequestStatus;
  activated_at: string | null;
  created_at: string;
};

export default async function AdminBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireAdmin("billing.read");
  const wanted = (await searchParams).status;
  const tab = QUEUE_TABS.find((t) => t.key === wanted) ?? QUEUE_TABS[0];

  const [overview, ai, audit, queue, counts, activeSubs, payments] = await Promise.all([
    getOverview(session.db),
    session.can("ai.read") ? getAiAnalytics(session.db, 30) : null,
    session.can("audit.read")
      ? listAudit(session.db, { action: "user.plan_changed", perPage: 25 })
      : null,
    session.db
      .from("billing_requests")
      .select("id, kind, plan, period, amount_cents, currency, billing_name, billing_email, country, status, activated_at, created_at")
      .in("status", tab.statuses)
      .order("created_at", { ascending: tab.key !== "rejected" })
      .limit(100)
      .returns<QueueRow[]>(),
    session.db.from("billing_requests").select("status, activated_at").returns<{ status: RequestStatus; activated_at: string | null }[]>(),
    session.db
      .from("subscriptions")
      .select("id, user_id, kind, plan, current_period_end, tools(name)")
      .eq("status", "active")
      .order("current_period_end")
      .limit(100)
      .returns<{ id: string; user_id: string | null; kind: BillingKind; plan: string; current_period_end: string; tools: { name: string } | null }[]>(),
    session.db
      .from("invoices")
      .select("request_id, number, amount_cents, currency, paid_at, payment_ref, billing_requests(kind, plan, billing_name, billing_email, user_id)")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(50)
      .returns<PaidRow[]>(),
  ]);

  /* What each payment was actually sent in, from the webhook record. */
  const paidIds = (payments.data ?? []).map((p) => p.request_id);
  const coins = paidIds.length
    ? await session.db
        .from("crypto_payments")
        .select("request_id, pay_currency, actually_paid, outcome_amount, outcome_currency")
        .in("request_id", paidIds)
        .eq("status", "finished")
        .returns<{ request_id: string; pay_currency: string; actually_paid: number | null; outcome_amount: number | null; outcome_currency: string | null }[]>()
    : { data: [] as never[] };
  const coinOf = new Map((coins.data ?? []).map((c) => [c.request_id, c]));

  /* Before the billing migration is applied the tables do not exist (42P01).
     Say that, rather than a generic failure. */
  const billingMissing = queue.error?.code === "42P01" || counts.error?.code === "42P01";
  const billingFailed = !billingMissing && Boolean(queue.error || counts.error || activeSubs.error || payments.error);
  const tally = new Map<string, number>();
  for (const r of counts.data ?? []) {
    const key = r.status === "paid" && r.activated_at ? "done" : r.status;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  if (!overview) {
    return (
      <>
        <PageHeader title="Plans and billing" />
        <div className="mt-6">
          <ErrorState what="plan data" />
        </div>
      </>
    );
  }

  const users = overview.users ?? {};
  const free = users.free ?? 0;
  const pro = users.pro ?? 0;
  const premium = users.premium ?? 0;
  const paying = pro + premium;

  return (
    <>
      <PageHeader
        title="Plans and billing"
        lead="Billing requests to work through, active subscriptions, payments, and every plan change."
      />

      <Section
        title="Billing queue"
        lead="Checkouts by status, oldest first. Plans switch on by themselves when the payment finishes. Awaiting payment is who opened a checkout and has not paid yet: open one to email them a payment link. Needs attention is anything a person must settle."
      >
        {billingMissing ? (
          <Panel className="px-4 py-4 text-[13px] text-muted">
            Billing is not installed yet. The migration billing_manual_v1 has not been applied to this database.
          </Panel>
        ) : billingFailed ? (
          <ErrorState what="the billing queue" />
        ) : (
          <>
            <nav aria-label="Billing status" className="mb-3 flex flex-wrap gap-2">
              {QUEUE_TABS.map((t) => {
                const n = t.statuses.reduce((sum, st) => sum + (tally.get(st) ?? 0), 0);
                const active = t.key === tab.key;
                return (
                  <Link
                    key={t.key}
                    href={`/admin/billing?status=${t.key}`}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "rounded-full bg-primary px-3 py-1.5 text-[13px] font-medium text-on-primary"
                        : "rounded-full border border-border px-3 py-1.5 text-[13px] text-foreground hover:bg-surface"
                    }
                  >
                    {t.label}
                    {n ? <span className="ml-1.5 tabular-nums opacity-80">{n}</span> : null}
                  </Link>
                );
              })}
            </nav>
            {(queue.data ?? []).filter((r) => tab.key !== "paid" || !r.activated_at).length === 0 ? (
              <EmptyState title={`Nothing ${tab.label.toLowerCase()}`} />
            ) : (
              <TableWrap>
                <Table className="min-w-[720px]">
                  <thead>
                    <tr>
                      <Th>Received</Th>
                      <Th>Plan</Th>
                      <Th numeric>Amount</Th>
                      <Th>Customer</Th>
                      <Th>Country</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(queue.data ?? [])
                      .filter((r) => tab.key !== "paid" || !r.activated_at)
                      .map((r) => {
                        const label = displayStatus(r);
                        return (
                          <Tr key={r.id}>
                            <Td>
                              <When iso={r.created_at} time />
                            </Td>
                            <Td>
                              <Link href={`/admin/billing/${r.id}`} className="font-medium hover:underline">
                                {planLabel(r.kind, r.plan)}
                              </Link>
                              <span className="block text-[12px] text-muted">{periodLabel(r.period)}</span>
                            </Td>
                            <Td numeric>{formatMoney(r.amount_cents, r.currency)}</Td>
                            <Td>
                              {r.billing_name}
                              <span className="block text-[12px] text-muted">{r.billing_email}</span>
                            </Td>
                            <Td>{r.country}</Td>
                            <Td>
                              <StatusBadge tone={BILLING_STATUS_TONE[label]}>{label}</StatusBadge>
                            </Td>
                          </Tr>
                        );
                      })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </>
        )}
      </Section>

      {!billingMissing && !billingFailed ? (
        <>
          <Section title="Active subscriptions" lead="Soonest to end first. Nothing renews by itself; the daily job sets an ended plan back to Free.">
            {(activeSubs.data ?? []).length === 0 ? (
              <EmptyState title="No active subscriptions" />
            ) : (
              <TableWrap>
                <Table className="min-w-[560px]">
                  <thead>
                    <tr>
                      <Th>Plan</Th>
                      <Th>Account</Th>
                      <Th>Ends</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeSubs.data ?? []).map((s) => (
                      <Tr key={s.id}>
                        <Td className="font-medium">
                          {planLabel(s.kind, s.plan)}
                          {s.tools?.name ? <span className="font-normal text-muted"> for {s.tools.name}</span> : null}
                        </Td>
                        <Td>
                          {s.user_id ? (
                            <Link href={`/admin/users/${s.user_id}`} className="hover:underline">
                              Open
                            </Link>
                          ) : (
                            "Deleted"
                          )}
                        </Td>
                        <Td>
                          <When iso={s.current_period_end} />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Section>

          <Section title="Payment history" lead="Who paid, for what, and in which coin, newest first. Received is what reached your payout wallet after conversion.">
            {(payments.data ?? []).length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <TableWrap>
                <Table className="min-w-[880px]">
                  <thead>
                    <tr>
                      <Th>Paid</Th>
                      <Th>Customer</Th>
                      <Th>Plan</Th>
                      <Th numeric>Price</Th>
                      <Th>Paid with</Th>
                      <Th>Received</Th>
                      <Th>Reference</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payments.data ?? []).map((p) => {
                      const b = p.billing_requests;
                      const c = coinOf.get(p.request_id);
                      return (
                        <Tr key={p.number}>
                          <Td>
                            <When iso={p.paid_at} time />
                          </Td>
                          <Td>
                            {b?.user_id ? (
                              <Link href={`/admin/users/${b.user_id}`} className="font-medium hover:underline">
                                {b.billing_name}
                              </Link>
                            ) : (
                              b?.billing_name ?? "Deleted"
                            )}
                            {b ? <span className="block text-[12px] text-muted">{b.billing_email}</span> : null}
                          </Td>
                          <Td>{b ? planLabel(b.kind, b.plan) : "−"}</Td>
                          <Td numeric>{formatMoney(p.amount_cents, p.currency)}</Td>
                          <Td className="font-mono text-[13px]">
                            {c ? `${c.actually_paid ?? "?"} ${c.pay_currency.toUpperCase()}` : "−"}
                          </Td>
                          <Td className="font-mono text-[13px]">
                            {c?.outcome_amount != null ? `${c.outcome_amount} ${String(c.outcome_currency ?? "").toUpperCase()}` : "−"}
                          </Td>
                          <Td>
                            <Link href={`/admin/billing/${p.request_id}`} className="font-mono text-[13px] hover:underline">
                              {p.number}
                            </Link>
                            <span className="block font-mono text-[12px] text-muted">{p.payment_ref}</span>
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Section>
        </>
      ) : null}

      <Section title="Accounts by plan">
        <StatGrid>
          <Stat label="Free" value={free} />
          <Stat label="Pro" value={pro} />
          <Stat label="Premium" value={premium} />
          <Stat
            label="On a paid plan"
            value={paying}
            hint={
              users.total
                ? `${((paying / users.total) * 100).toFixed(1)}% of ${users.total.toLocaleString("en-GB")} accounts`
                : undefined
            }
          />
        </StatGrid>

        <div className="mt-3">
          <ShareBar
            parts={[
              { label: "Free", value: free },
              { label: "Pro", value: pro },
              { label: "Premium", value: premium },
            ]}
          />
        </div>
      </Section>

      {ai ? (
        <Section
          title="Cost to serve, last 30 days"
          lead="Estimated AI spend attributed to each plan. This is the only real money figure the platform currently has, and it is an outgoing one."
        >
          <TableWrap>
            <Table className="min-w-[560px]">
              <thead>
                <tr>
                  <Th>Plan</Th>
                  <Th numeric>Requests</Th>
                  <Th numeric>Tokens</Th>
                  <Th numeric>Estimated cost</Th>
                  <Th numeric>Per request</Th>
                </tr>
              </thead>
              <tbody>
                {ai.by_plan.map((p) => (
                  <Tr key={p.plan}>
                    <Td className="font-medium">{p.plan}</Td>
                    <Td numeric>{p.requests.toLocaleString("en-GB")}</Td>
                    <Td numeric>{p.total_tokens.toLocaleString("en-GB")}</Td>
                    <Td numeric>
                      <Usd value={p.cost_usd} />
                    </Td>
                    <Td numeric>
                      <Usd value={Number(p.cost_usd) / Math.max(p.requests, 1)} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>

          {ai.by_plan.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No AI usage in the last 30 days"
                body="Cost to serve is counted from ai_usage_records, one row per request."
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section
        title="Plan change history"
        lead="Every change, who made it, what it was before, and the reason they gave. A plan cannot be changed without one."
      >
        {!audit ? (
          <Panel className="px-4 py-4 text-[13px] text-muted">
            Your role can read plan counts but not the audit log.
          </Panel>
        ) : audit.rows.length === 0 ? (
          <EmptyState
            title="No plan has ever been changed"
            body="Plan changes are made from a person's account page and are recorded here permanently. The audit log cannot be edited or deleted: a trigger refuses both."
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[720px]">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Account</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Changed by</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {audit.rows.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <When iso={row.created_at} time />
                    </Td>
                    <Td>
                      {row.entity_id ? (
                        <Link
                          href={`/admin/users/${row.entity_id}`}
                          className="font-medium hover:underline"
                        >
                          {row.entity_label ?? row.entity_id.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-muted">Unknown</span>
                      )}
                    </Td>
                    <Td className="text-[13px] text-muted">
                      {String(row.before_state?.plan ?? "−")}
                    </Td>
                    <Td className="text-[13px] font-medium">
                      {String(row.after_state?.plan ?? "−")}
                    </Td>
                    <Td className="text-[13px]">
                      {row.actor_username ?? "System"}
                      {row.actor_role ? (
                        <span className="ml-1.5 text-muted">({row.actor_role})</span>
                      ) : null}
                    </Td>
                    <Td>
                      <span className="block max-w-[280px] text-[13px] text-muted">
                        {row.reason ?? "−"}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Section>


    </>
  );
}
