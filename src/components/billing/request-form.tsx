"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { startCheckout, type BillingFormState } from "@/app/actions/billing";
import type { Country } from "@/lib/billing/countries";

/*
  The checkout (phase CRYPTO, D256). Submitting creates the request and opens
  the NOWPayments page, where the person pays in USDT. Nothing is charged on
  celpare.com, and the plan turns on only when the signed webhook confirms it.

  Accessibility (ui-ux-pro-max): every field has a visible label; a failed
  submit puts a summary at the top, moves focus to it and links each problem
  to its field, and the inline messages stay; the button says what is
  happening while it works.
*/

const IDLE: BillingFormState = { status: "idle", message: "" };

const FIELD_LABEL: Record<string, string> = {
  billingName: "Name on the receipt",
  billingEmail: "Billing email",
  country: "Country",
  company: "Company",
  address: "Billing address",
  taxId: "Tax or VAT number",
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
  const [state, action, pending] = useActionState(startCheckout, IDLE);
  const summary = useRef<HTMLDivElement>(null);
  const fields = state.fields ?? {};

  useEffect(() => {
    if (state.status === "error") summary.current?.focus();
  }, [state]);

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
          label="Name on the receipt"
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
          hint="For your receipt. Your Celpare updates go to your account email."
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
            I understand that I pay in USDT on a NOWPayments page, that my plan starts once the payment is
            confirmed on the blockchain, that it does not renew automatically, and that I can ask for a full refund
            within 24 hours of the payment being confirmed and not after, paid back in USDT to an address I give. See
            the{" "}
            <Link href="/legal/paid-plans" className="underline underline-offset-2">
              Paid Plans Terms
            </Link>
            .
          </span>
        </label>
        {err("accept")}
      </div>

      <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>
        {pending ? "Opening the payment page..." : "Pay with USDT"}
      </Button>
      <p className="text-center text-[13px] text-muted">
        You pay on NOWPayments in USDT. Celpare never asks for card details, wallet keys or payment screenshots.
      </p>
    </form>
  );
}
