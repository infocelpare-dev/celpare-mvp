"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { submitBillingRequest, type BillingFormState } from "@/app/actions/billing";
import type { Country } from "@/lib/billing/countries";

/*
  The paid plan request (phase BILL, D239). Nothing is charged here: the
  request goes to a person, who sends a Payoneer invoice to the billing email.

  Accessibility (ui-ux-pro-max): every field has a visible label; a failed
  submit puts a summary at the top, moves focus to it and links each problem
  to its field, and the inline messages stay; the button says what is
  happening while it works.
*/

const IDLE: BillingFormState = { status: "idle", message: "" };

const FIELD_LABEL: Record<string, string> = {
  billingName: "Name on the invoice",
  billingEmail: "Billing email",
  country: "Country",
  company: "Company",
  address: "Billing address",
  taxId: "Tax or VAT number",
  note: "Note",
  accept: "Billing and refunds",
  toolId: "Tool",
  plan: "Plan",
  period: "Billing period",
};

const textarea =
  "w-full rounded-xl border border-border bg-background px-4 py-3 text-[16px] sm:text-[15px] text-foreground placeholder:text-muted";

export function BillingRequestForm({
  kind,
  plan,
  period,
  toolId,
  defaultName,
  defaultEmail,
  countries,
}: {
  kind: string;
  plan: string;
  period: string;
  toolId?: string;
  defaultName: string;
  defaultEmail: string;
  countries: Country[];
}) {
  const [state, action, pending] = useActionState(submitBillingRequest, IDLE);
  const summary = useRef<HTMLDivElement>(null);
  const fields = state.fields ?? {};

  useEffect(() => {
    if (state.status === "error") summary.current?.focus();
  }, [state]);

  if (state.status === "success") {
    return (
      <div className="rounded-2xl border border-border p-6" role="status">
        <CheckCircle2 className="size-6" aria-hidden />
        <h2 className="mt-3 text-[18px] font-medium tracking-[-0.01em]">Request sent</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {state.message} The invoice comes from Payoneer to your billing email. Nothing is charged until you pay it.
        </p>
        <ButtonLink href="/settings/billing" className="mt-5">
          See your billing
        </ButtonLink>
      </div>
    );
  }

  const err = (name: string) =>
    fields[name] ? (
      <p id={`${name}-error`} className="mt-1.5 text-[13px] font-medium text-foreground">
        {fields[name]}
      </p>
    ) : null;
  const describedBy = (name: string, hint = false) =>
    [hint ? `${name}-hint` : null, fields[name] ? `${name}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="period" value={period} />
      {toolId ? <input type="hidden" name="toolId" value={toolId} /> : null}

      {state.status === "error" ? (
        <div
          ref={summary}
          tabIndex={-1}
          role="alert"
          className="rounded-xl border border-foreground p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="text-[14px] font-medium">{state.message}</p>
          {Object.keys(fields).length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">
              {Object.entries(fields).map(([name, message]) => (
                <li key={name}>
                  <a href={`#${name}`} className="underline underline-offset-2">
                    {FIELD_LABEL[name] ?? name}: {message}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div>
        <Field
          id="billingName"
          name="billingName"
          label="Name on the invoice"
          autoComplete="name"
          defaultValue={defaultName}
          required
          maxLength={120}
          invalid={!!fields.billingName}
          aria-describedby={describedBy("billingName")}
        />
        {err("billingName")}
      </div>

      <div>
        <Field
          id="billingEmail"
          name="billingEmail"
          type="email"
          label="Billing email"
          hint="Payoneer sends the invoice here. Your Celpare updates go to your account email."
          autoComplete="email"
          defaultValue={defaultEmail}
          required
          maxLength={254}
          invalid={!!fields.billingEmail}
          aria-describedby={describedBy("billingEmail", true)}
        />
        {err("billingEmail")}
      </div>

      <div>
        <label htmlFor="country" className="mb-1.5 block text-[14px] font-medium">
          Country
        </label>
        <select
          id="country"
          name="country"
          required
          defaultValue=""
          aria-invalid={!!fields.country || undefined}
          aria-describedby={describedBy("country")}
          className="h-11 w-full rounded-xl border border-border bg-background px-4 text-[16px] text-foreground sm:text-[15px]"
        >
          <option value="" disabled>
            Choose your country
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        {err("country")}
      </div>

      <div>
        <Field
          id="company"
          name="company"
          label="Company (optional)"
          autoComplete="organization"
          maxLength={120}
          invalid={!!fields.company}
          aria-describedby={describedBy("company")}
        />
        {err("company")}
      </div>

      <div>
        <label htmlFor="address" className="mb-1.5 block text-[14px] font-medium">
          Billing address (optional)
        </label>
        <textarea
          id="address"
          name="address"
          rows={3}
          maxLength={500}
          autoComplete="street-address"
          aria-invalid={!!fields.address || undefined}
          aria-describedby={describedBy("address")}
          className={textarea}
        />
        {err("address")}
      </div>

      <div>
        <Field
          id="taxId"
          name="taxId"
          label="Tax or VAT number (optional)"
          maxLength={64}
          invalid={!!fields.taxId}
          aria-describedby={describedBy("taxId")}
        />
        {err("taxId")}
      </div>

      <div>
        <label htmlFor="note" className="mb-1.5 block text-[14px] font-medium">
          Note (optional)
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={1000}
          aria-invalid={!!fields.note || undefined}
          aria-describedby={describedBy("note")}
          className={textarea}
        />
        {err("note")}
      </div>

      <div className="rounded-xl border border-border p-4">
        <label htmlFor="accept" className="flex cursor-pointer gap-3 text-[14px] leading-relaxed">
          <input
            id="accept"
            name="accept"
            type="checkbox"
            required
            aria-invalid={!!fields.accept || undefined}
            aria-describedby={describedBy("accept")}
            className="mt-1 size-4 shrink-0 accent-[var(--color-foreground)]"
          />
          <span>
            I understand that Celpare sends an invoice through Payoneer, that my plan starts once the payment is
            confirmed, that it does not renew automatically, and that I can ask for a full refund within 24 hours
            of the payment being confirmed and not after. See the{" "}
            <Link href="/legal/paid-plans" className="underline underline-offset-2">
              Paid Plans Terms
            </Link>
            .
          </span>
        </label>
        {err("accept")}
      </div>

      <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
        {pending ? "Sending your request..." : "Request invoice"}
      </Button>
      <p className="text-center text-[13px] text-muted">
        Nothing is charged now. Celpare never asks for card details or payment screenshots.
      </p>
    </form>
  );
}
