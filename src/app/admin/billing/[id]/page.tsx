import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { ActionForm } from "@/components/admin/action-form";
import {
  ErrorState,
  Field,
  FieldList,
  PageHeader,
  Panel,
  Section,
  StatusBadge,
  When,
} from "@/components/admin/ui";
import { BILLING_STATUS_TONE } from "@/components/admin/billing-status";
import { billingActivate, billingReject, billingSendPaymentLink } from "@/app/actions/billing";
import {
  displayStatus,
  formatMoney,
  periodLabel,
  planLabel,
  type BillingKind,
  type BillingPeriod,
  type RequestStatus,
  type SubscriptionStatus,
} from "@/lib/billing/catalog";
import { coinLabel } from "@/lib/billing/coins";

export const dynamic = "force-dynamic";

/*
  One billing request (phase CRYPTO, D256 to D262). Shows what was asked, who
  asked, the NOWPayments invoice, every payment NOWPayments reported, and the
  history. Payment and activation happen through the signed webhook; the only
  steps left here are closing a checkout that will not complete, and activating
  by hand a paid request the webhook could not activate. Old Payoneer requests
  (D239) still render, read only.
*/

type Row = {
  id: string;
  user_id: string | null;
  kind: BillingKind;
  plan: string;
  period: BillingPeriod;
  amount_cents: number;
  currency: string;
  billing_name: string;
  billing_email: string;
  company: string | null;
  country: string;
  address: string | null;
  tax_id: string | null;
  note: string | null;
  status: RequestStatus;
  reject_reason: string | null;
  activated_at: string | null;
  created_at: string;
  subscription_id: string | null;
  tools: { name: string; slug: string } | null;
};

const EVENT_LABEL: Record<string, string> = {
  pending: "Request submitted",
  awaiting_payment: "Checkout opened",
  partially_paid: "Partly paid",
  expired: "Closed unpaid",
  under_review: "Review started",
  invoice_sent: "Invoice recorded as sent",
  paid: "Payment received",
  active: "Plan activated",
  rejected: "Rejected",
};

export default async function BillingRequestAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin("billing.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [req, inv, events, pays] = await Promise.all([
    session.db
      .from("billing_requests")
      .select(
        "id, user_id, kind, plan, period, amount_cents, currency, billing_name, billing_email, company, country, address, tax_id, note, status, reject_reason, activated_at, created_at, subscription_id, tools(name, slug)",
      )
      .eq("id", id)
      .maybeSingle<Row>(),
    session.db
      .from("invoices")
      .select("number, provider, provider_invoice_ref, payment_url, pay_currency, status, sent_at, due_at, paid_at, payment_ref")
      .eq("request_id", id)
      .maybeSingle(),
    session.db
      .from("billing_events")
      .select("id, to_status, note, created_at")
      .eq("request_id", id)
      .order("id"),
    session.db
      .from("crypto_payments")
      .select("payment_id, status, pay_currency, pay_amount, actually_paid, outcome_amount, outcome_currency, payin_hash, updated_at")
      .eq("request_id", id)
      .order("updated_at", { ascending: false }),
  ]);

  if (req.error) {
    return (
      <>
        <PageHeader title="Billing request" />
        <div className="mt-6">
          <ErrorState what="this request" />
        </div>
      </>
    );
  }
  const r = req.data;
  if (!r) notFound();

  let sub: { status: SubscriptionStatus; current_period_end: string } | null = null;
  if (r.subscription_id) {
    const { data } = await session.db
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("id", r.subscription_id)
      .maybeSingle<{ status: SubscriptionStatus; current_period_end: string }>();
    sub = data;
  }

  const label = displayStatus(r, sub);
  const amount = formatMoney(r.amount_cents, r.currency);
  const canManage = session.can("billing.manage");
  const canVerify = session.can("billing.verify");
  const rejectable = ["pending", "under_review", "invoice_sent", "awaiting_payment", "partially_paid"].includes(r.status);
  const crypto = inv.data?.provider === "nowpayments";

  return (
    <>
      <PageHeader
        title={`${planLabel(r.kind, r.plan)}, ${periodLabel(r.period)}`}
        lead={`${amount} requested by ${r.billing_name}.`}
        action={<StatusBadge tone={BILLING_STATUS_TONE[label]}>{label}</StatusBadge>}
      />
      <p className="mt-3 text-[13px]">
        <Link href="/admin/billing" className="text-muted hover:underline">
          Back to the billing queue
        </Link>
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Section title="Request">
            <Panel className="px-4">
              <FieldList>
                <Field label="Plan">
                  {planLabel(r.kind, r.plan)}
                  {r.tools ? (
                    <>
                      {" for "}
                      <Link href={`/tools/${r.tools.slug}`} className="hover:underline">
                        {r.tools.name}
                      </Link>
                    </>
                  ) : null}
                </Field>
                <Field label="Billing">{periodLabel(r.period)}</Field>
                <Field label="Price">{amount}</Field>
                <Field label="Account">
                  {r.user_id ? (
                    <Link href={`/admin/users/${r.user_id}`} className="hover:underline">
                      Open the account
                    </Link>
                  ) : (
                    "Deleted"
                  )}
                </Field>
                <Field label="Submitted">
                  <When iso={r.created_at} time />
                </Field>
              </FieldList>
            </Panel>
          </Section>

          <Section title="Billing details" lead="What the customer gave for the receipt.">
            <Panel className="px-4">
              <FieldList>
                <Field label="Name">{r.billing_name}</Field>
                <Field label="Billing email" mono>
                  {r.billing_email}
                </Field>
                <Field label="Country">{r.country}</Field>
                {r.company ? <Field label="Company">{r.company}</Field> : null}
                {r.address ? <Field label="Address">{r.address}</Field> : null}
                {r.tax_id ? <Field label="Tax or VAT number">{r.tax_id}</Field> : null}
                {r.note ? <Field label="Note from the customer">{r.note}</Field> : null}
              </FieldList>
            </Panel>
          </Section>

          {inv.data ? (
            <Section title="Invoice">
              <Panel className="px-4">
                <FieldList>
                  <Field label="Celpare reference" mono>
                    {inv.data.number}
                  </Field>
                  <Field label={crypto ? "NOWPayments invoice" : "Payoneer invoice"} mono>
                    {inv.data.provider_invoice_ref}
                  </Field>
                  {crypto ? (
                    <Field label="Coin chosen">{inv.data.pay_currency ? coinLabel(inv.data.pay_currency) : "Chosen on the NOWPayments page"}</Field>
                  ) : null}
                  <Field label="Status">{inv.data.status}</Field>
                  <Field label="Sent">
                    <When iso={inv.data.sent_at} time />
                  </Field>
                  {inv.data.due_at ? (
                    <Field label="Due">
                      <When iso={inv.data.due_at} />
                    </Field>
                  ) : null}
                  {inv.data.paid_at ? (
                    <Field label="Paid">
                      <When iso={inv.data.paid_at} time />
                    </Field>
                  ) : null}
                  {inv.data.payment_ref ? (
                    <Field label={crypto ? "NOWPayments payment" : "Payoneer transaction"} mono>
                      {inv.data.payment_ref}
                    </Field>
                  ) : null}
                </FieldList>
              </Panel>
            </Section>
          ) : null}

          {crypto ? (
            <Section title="Payments" lead="What NOWPayments reported, re-read from its API on every webhook.">
              {pays.error ? (
                <ErrorState what="the payments" />
              ) : (pays.data ?? []).length === 0 ? (
                <p className="text-[13px] text-muted">No payment yet.</p>
              ) : (
                <Panel className="px-4">
                  {(pays.data ?? []).map((p) => (
                    <FieldList key={p.payment_id}>
                      <Field label="Payment" mono>
                        {p.payment_id}
                      </Field>
                      <Field label="Status">{p.status}</Field>
                      <Field label="Paid" mono>
                        {p.actually_paid ?? 0} of {p.pay_amount ?? "?"} {coinLabel(p.pay_currency)}
                      </Field>
                      {p.outcome_amount != null ? (
                        <Field label="You receive" mono>
                          {p.outcome_amount} {String(p.outcome_currency ?? "").toUpperCase()}
                        </Field>
                      ) : null}
                      {p.payin_hash ? (
                        <Field label="Transaction hash" mono>
                          {p.payin_hash}
                        </Field>
                      ) : null}
                      <Field label="Updated">
                        <When iso={p.updated_at} time />
                      </Field>
                    </FieldList>
                  ))}
                </Panel>
              )}
            </Section>
          ) : null}

          <Section title="History">
            {events.error ? (
              <ErrorState what="the history" />
            ) : (
              <ol className="space-y-2 border-l border-border pl-4 text-[13px]">
                {(events.data ?? []).map((e) => (
                  <li key={e.id}>
                    <span className="font-medium">{EVENT_LABEL[e.to_status] ?? e.to_status}</span>
                    <span className="text-muted">
                      {" "}
                      <When iso={e.created_at} time />
                    </span>
                    {e.note ? <span className="block text-muted">{e.note}</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Next step">
            <Panel className="space-y-4 p-4">
              {r.status === "awaiting_payment" ? (
                <>
                  <p className="text-[13px] text-muted">
                    Waiting for the customer to pay on NOWPayments. The plan turns on by itself when the payment finishes.
                  </p>
                  {canManage ? (
                    <ActionForm
                      action={billingSendPaymentLink}
                      fields={{ requestId: r.id }}
                      label="Email payment link"
                      tone="primary"
                      confirm={{
                        title: "Email this customer a payment link?",
                        body: `From billing@celpare.com to the account's sign in email. It links to their Celpare billing page, where they pay ${amount} in BTC, ETH, BNB, XRP or USDT.`,
                        confirmLabel: "Send email",
                      }}
                    />
                  ) : null}
                </>
              ) : null}

              {r.status === "partially_paid" ? (
                <p className="text-[13px] text-muted">
                  Less than {amount} arrived, so nothing was switched on. Settle it with the customer in NOWPayments
                  (refund, or ask them to send the rest), then close this request with the reason.
                </p>
              ) : null}

              {r.status === "expired" ? (
                <p className="text-[13px] text-muted">Closed without a payment. Nothing to do.</p>
              ) : null}

              {["pending", "under_review", "invoice_sent"].includes(r.status) ? (
                <p className="text-[13px] text-muted">
                  An old Payoneer request. Payoneer is no longer used (D256): close it with a reason.
                </p>
              ) : null}

              {r.status === "paid" && !r.activated_at ? (
                canVerify ? (
                  <>
                    <p className="text-[13px] text-muted">
                      The payment finished but the plan did not switch on. Activating switches it on now and emails the
                      customer.
                    </p>
                    <ActionForm
                      action={billingActivate}
                      fields={{ requestId: r.id }}
                      label="Activate plan"
                      tone="primary"
                      confirm={{
                        title: `Activate ${planLabel(r.kind, r.plan)}?`,
                        body: `The plan starts now for ${r.period === "yearly" ? "one year" : "one month"}, and the customer is emailed.`,
                        confirmLabel: "Activate",
                      }}
                    />
                  </>
                ) : (
                  <p className="text-[13px] text-muted">Waiting for the founder to activate.</p>
                )
              ) : null}

              {r.activated_at ? (
                <p className="text-[13px] text-muted">
                  {sub?.status === "expired" ? "Expired." : "Active"}
                  {sub ? (
                    <>
                      {" until "}
                      <When iso={sub.current_period_end} />.
                    </>
                  ) : null}
                </p>
              ) : null}

              {r.status === "rejected" ? (
                <p className="text-[13px] text-muted">Rejected: {r.reject_reason}</p>
              ) : null}

              {rejectable && canManage ? (
                <div className="border-t border-border pt-4">
                  <ActionForm
                    action={billingReject}
                    fields={{ requestId: r.id }}
                    label="Close request"
                    tone="danger"
                    requireReason
                    reasonLabel="Reason, shown to the customer"
                    reasonHint="For example: part payment refunded on 10 November. The open NOWPayments invoice is voided here; refunds are sent from NOWPayments."
                  />
                </div>
              ) : null}
            </Panel>
          </Section>
        </div>
      </div>
    </>
  );
}
