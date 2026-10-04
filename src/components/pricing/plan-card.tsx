import { Check, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SignInButton } from "@/components/auth/sign-in-prompt";
import {
  formatUsd,
  yearlyCents,
  yearlySaving,
  type Billing,
  type PricingPlan,
} from "@/lib/pricing/plans";

/*
  One plan, in the claude.com/pricing card shape: icon, name, tagline, price,
  billing note, one full width action, then what it includes.

  The action is honest about what exists today. Payments are Phase 7 (G5), so
  a paid plan says "Coming soon" and is disabled rather than leading to a
  checkout that is not there. Signed out, the free plan opens the sign up or
  log in prompt (UI.4). Signed in, the plan you are on says "Current plan" and
  a cheaper one says it is included.
*/
export type PlanAction = "current" | "included" | "sign-in" | "coming-soon";

export function PlanCard({
  plan,
  icon: Icon,
  billing,
  action,
}: {
  plan: PricingPlan;
  icon: LucideIcon;
  billing: Billing;
  action: PlanAction;
}) {
  const paid = plan.monthlyCents > 0;
  const yearly = billing === "yearly";
  const saving = yearly ? yearlySaving(plan) : null;
  const headingId = `plan-${plan.id}`;

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col rounded-3xl border border-border bg-elevated p-6 sm:p-8"
    >
      <Icon className="size-7 text-foreground" strokeWidth={1.5} aria-hidden />
      <h2
        id={headingId}
        className="mt-5 text-[28px] font-medium leading-tight tracking-[-0.03em]"
      >
        {plan.name}
      </h2>
      {/* Two lines held at md and up, so a long tagline cannot push one price
          below the others. */}
      <p className="mt-1 text-[15px] leading-snug text-muted md:min-h-[2lh]">{plan.tagline}</p>

      {/* In Yearly the price is what the year costs, paid at once (D197). */}
      <p className="mt-6 flex items-baseline gap-2">
        <span className="text-[44px] font-medium leading-none tracking-[-0.04em]">
          {formatUsd(yearly ? yearlyCents(plan) : plan.monthlyCents)}
        </span>
        <span className="text-[13px] leading-tight text-muted">
          USD
          <br />
          {!paid ? "forever" : yearly ? "per year" : "per month"}
        </span>
      </p>
      {/* In Yearly a saving takes two lines (46px), so every card holds 48px at
          md and up and the buttons stay level across the row. */}
      <p
        className={cn(
          "mt-2 flex min-h-6 flex-wrap content-start items-center gap-x-2 gap-y-1 text-[13px] text-muted",
          yearly && "md:min-h-12",
        )}
      >
        {!paid ? (
          "Free for everyone"
        ) : saving ? (
          <>
            <s aria-hidden>{formatUsd(saving.fullCents)}</s>
            <span className="sr-only">
              instead of {formatUsd(saving.fullCents)} for 12 monthly payments,
            </span>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[12px] font-medium text-on-accent">
              Save {saving.percent}%
            </span>
            <span>
              {formatUsd(saving.cents)} less than paying monthly
            </span>
          </>
        ) : yearly ? (
          `12 months at ${formatUsd(plan.monthlyCents)}, billed once a year`
        ) : (
          "Billed monthly"
        )}
      </p>

      <div className="mt-6">
        <PlanButton action={action} name={plan.name} />
      </div>

      <hr className="my-6 border-border" />

      {plan.includesFrom ? (
        <p className="mb-3 text-[14px] font-medium">
          Everything in {plan.includesFrom}, plus:
        </p>
      ) : null}
      <ul className="space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-3 text-[15px] leading-snug">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {plan.bestFor ? (
        <p className="mt-auto pt-6 text-[13px] text-muted">
          <span className="font-medium text-foreground">Best for:</span>{" "}
          {plan.bestFor}
        </p>
      ) : null}
    </section>
  );
}

function PlanButton({ action, name }: { action: PlanAction; name: string }) {
  const full = "w-full";
  switch (action) {
    case "current":
      return (
        <Button variant="outline" className={full} disabled>
          Current plan
        </Button>
      );
    case "included":
      return (
        <Button variant="outline" className={full} disabled>
          Included in your plan
        </Button>
      );
    case "sign-in":
      return (
        <SignInButton
          className="inline-flex h-11 w-full items-center justify-center rounded-full border border-transparent bg-primary px-6 text-[15px] font-medium tracking-[-0.01em] text-on-primary transition-colors duration-200 ease-out hover:bg-primary-hover"
        >
          Get started
        </SignInButton>
      );
    case "coming-soon":
      return (
        <Button className={full} disabled aria-describedby="payments-note">
          Coming soon
          <span className="sr-only">: {name} cannot be bought yet</span>
        </Button>
      );
  }
}
