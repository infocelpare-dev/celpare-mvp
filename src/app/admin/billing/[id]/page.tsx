import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { ActionForm } from "@/components/admin/action-form";
import { InvoiceSentForm, MarkPaidForm } from "@/components/admin/billing-step-forms";
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
import {
  billingActivate,
  billingMarkInvoiceSent,
  billingMarkPaid,
  billingReject,
  billingStartReview,
} from "@/app/actions/billing";
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

export const dynamic = "force-dynamic";

/*
  One billing request (phase BILL, D239 to D242). Shows what was asked, who
  asked, the invoice and the history, and offers only the next allowed step:
  review, record the invoice, mark paid (super_admin, D242), activate, or
  reject. Every step is an audited database function that refuses anything out
  of order, so the buttons shown here are a convenience, not the gate.
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
  under_review: "Review started",
  invoice_sent: "Invoice recorded as sent",
  paid: "Payment verified",
  active: "Plan activated",
  rejected: "Rejected",
};

export default async function BillingRequestAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin("billing.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [req, inv, events] = await Promise.all([
    session.db
      .from("billing_requests")
      .select(
        "id, user_id, kind, plan, period, amount_cents, currency, billing_name, billing_email, company, country, address, tax_id, note, status, reject_reason, activated_at, created_at, subscription_id, tools(name, slug)",
      )
      .eq("id", id)
      .maybeSingle<Row>(),
    session.db
      .from("invoices")
      .select("number, provider_invoice_ref, status, sent_at, due_at, paid_at, payment_ref")
      .eq("request_id", id)
      .maybeSingle(),
    session.db
      .from("billing_events")
      .select("id, to_status, note, created_at")
      .eq("request_id", id)
      .order("id"),
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
  const rejectable = ["pending", "under_review", "invoice_sent"].includes(r.status);

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
                <Field label="Amount to invoice">{amount}</Field>
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

          <Section title="Billing details" lead="Send the Payoneer invoice to this name and email.">
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
                  <Field label="Payoneer invoice" mono>
                    {inv.data.provider_invoice_ref}
                  </Field>
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
                    <Field label="Payoneer transaction" mono>
                      {inv.data.payment_ref}
                    </Field>
                  ) : null}
                </FieldList>
              </Panel>
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
              {r.status === "pending" ? (
                canManage ? (
                  <>
                    <p className="text-[13px] text-muted">
                      Check the details, and that this transaction is one Payoneer lets you invoice.
                    </p>
                    <ActionForm action={billingStartReview} fields={{ requestId: r.id }} label="Start review" tone="primary" />
                  </>
                ) : (
                  <p className="text-[13px] text-muted">Your role cannot review billing requests.</p>
                )
              ) : null}

              {r.status === "under_review" ? (
                canManage ? (
                  <>
                    <p className="text-[13px] text-muted">
                      In Payoneer, send an invoice for {amount} to {r.billing_email}, then record it here. The customer
                      gets an email.
                    </p>
                    <InvoiceSentForm requestId={r.id} action={billingMarkInvoiceSent} />
                  </>
                ) : (
                  <p className="text-[13px] text-muted">Your role cannot record invoices.</p>
                )
              ) : null}

              {r.status === "invoice_sent" ? (
                canVerify ? (
                  <>
                    <p className="text-[13px] text-muted">
                      Open your Payoneer account and find the payment for this invoice. Mark it paid only when you see
                      the funds there.
                    </p>
                    <MarkPaidForm requestId={r.id} amount={amount} action={billingMarkPaid} />
                  </>
                ) : (
                  <p className="text-[13px] text-muted">Waiting for the founder to verify the payment in Payoneer.</p>
                )
              ) : null}

              {r.status === "paid" && !r.activated_at ? (
                canVerify ? (
                  <>
                    <p className="text-[13px] text-muted">
                      Payment verified. Activating switches the plan on now and emails the customer.
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
                    label="Reject"
                    tone="danger"
                    requireReason
                    reasonLabel="Reason, shown to the customer"
                    reasonHint="For example: this payment is not eligible for a Payoneer invoice. Any invoice already recorded is voided."
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
