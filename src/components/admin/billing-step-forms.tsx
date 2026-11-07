"use client";

import { useActionState } from "react";
import { IDLE, type AdminState } from "@/lib/admin/action-state";

/*
  The two billing steps that need more than a button (phase BILL, D239):
  recording the Payoneer invoice, and marking it paid. The database repeats
  every check here (admin_billing_mark_invoice_sent, admin_billing_mark_paid),
  so this form is a convenience, not the control.

  Mark paid asks for the Payoneer transaction id and an explicit tick that the
  funds were seen in the Payoneer account. There is no upload: a screenshot is
  never evidence (D239).
*/

const input =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] text-foreground placeholder:text-muted";

function Result({ state }: { state: AdminState }) {
  if (state.status === "idle") return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? "text-[13px] font-medium text-danger-text" : "text-[13px] text-muted"}
    >
      {state.message}
    </p>
  );
}

export function InvoiceSentForm({
  requestId,
  action,
}: {
  requestId: string;
  action: (s: AdminState, f: FormData) => Promise<AdminState>;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <label htmlFor="invoiceRef" className="mb-1 block text-[13px] font-medium">
          Payoneer invoice reference
        </label>
        <input id="invoiceRef" name="invoiceRef" required maxLength={120} className={input} />
        <p className="mt-1 text-[12px] text-muted">The number or link id Payoneer shows for the invoice you sent.</p>
      </div>
      <div>
        <label htmlFor="dueOn" className="mb-1 block text-[13px] font-medium">
          Due date (optional)
        </label>
        <input id="dueOn" name="dueOn" type="date" className={input} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-on-primary disabled:opacity-60"
      >
        {pending ? "Saving..." : "Record invoice as sent"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function MarkPaidForm({
  requestId,
  amount,
  action,
}: {
  requestId: string;
  amount: string;
  action: (s: AdminState, f: FormData) => Promise<AdminState>;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <label htmlFor="paymentRef" className="mb-1 block text-[13px] font-medium">
          Payoneer transaction id
        </label>
        <input id="paymentRef" name="paymentRef" required maxLength={120} className={input} />
      </div>
      <label htmlFor="verified" className="flex cursor-pointer gap-2.5 text-[13px] leading-relaxed">
        <input id="verified" name="verified" type="checkbox" required className="mt-0.5 size-4 shrink-0" />
        <span>
          I opened my Payoneer account and saw {amount} received for this invoice. I am not relying on a screenshot,
          an email or a message from the customer.
        </span>
      </label>
      <div>
        <label htmlFor="paidNote" className="mb-1 block text-[13px] font-medium">
          Note for the audit log (optional)
        </label>
        <input id="paidNote" name="note" maxLength={1000} className={input} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[13px] font-medium text-on-primary disabled:opacity-60"
      >
        {pending ? "Saving..." : "Mark paid"}
      </button>
      <Result state={state} />
    </form>
  );
}
