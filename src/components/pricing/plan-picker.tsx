import {
  BadgeCheck,
  Code,
  Compass,
  FlaskConical,
  Rocket,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { SegmentedLinks } from "@/components/pricing/segmented-links";
import { PlanCard, type PlanAction } from "@/components/pricing/plan-card";
import { SponsoredAddon } from "@/components/pricing/sponsored-addon";
import {
  bestYearlyPercent,
  plansFor,
  type Audience,
  type Billing,
  type PricingPlan,
} from "@/lib/pricing/plans";

const ICONS: Record<Audience, LucideIcon[]> = {
  individual: [Compass, Zap, FlaskConical],
  developers: [Code, Rocket, BadgeCheck],
};

/*
  The audience switch, the billing switch, the three plan cards, the
  sponsored add on and the payments note. /pricing and /plans (phase PLANS)
  both render this, so the plans after login can never drift from the
  pricing page.

  All state is in the URL under `base` (?for=developers, ?billing=yearly),
  so it stays server rendered. The Developers tab shows only with Developer
  Mode on (D196); the caller has already decided the audience.
*/
export function planHref(
  base: string,
  a: Audience,
  b: Billing,
  /* The audience the page shows with no ?for= (/plans opens developers on theirs). */
  defaultAudience: Audience = "individual",
): string {
  const q = new URLSearchParams();
  if (a !== defaultAudience) q.set("for", a);
  if (b === "yearly") q.set("billing", "yearly");
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export function PlanPicker({
  base,
  audience,
  billing,
  isDeveloper,
  signedIn,
  currentId,
  defaultAudience = "individual",
  billingOpen = false,
}: {
  base: string;
  defaultAudience?: Audience;
  audience: Audience;
  billing: Billing;
  isDeveloper: boolean;
  signedIn: boolean;
  /* The plan this account is on for this audience; null when unknown. */
  currentId: string | null;
  /* Paid plans can be requested by invoice (phase BILL, isBillingOpen). */
  billingOpen?: boolean;
}) {
  const { plans } = plansFor(audience);
  const bestSaving = bestYearlyPercent(plans);
  const href = (a: Audience, b: Billing) => planHref(base, a, b, defaultAudience);

  const actionFor = (p: PricingPlan, index: number): PlanAction => {
    const paid = p.monthlyCents > 0;
    if (!signedIn) return !paid || billingOpen ? "sign-in" : "coming-soon";
    if (p.id === currentId) return "current";
    const currentIndex = plans.findIndex((x) => x.id === currentId);
    if (currentIndex > index) return "included";
    return billingOpen ? "request" : "coming-soon";
  };

  const requestHref = (p: PricingPlan) =>
    `/settings/billing/request?kind=${audience === "developers" ? "developer" : "individual"}&plan=${encodeURIComponent(p.id)}&period=${billing}`;

  return (
    <>
      <div className="mt-8 flex flex-col items-center gap-3">
        {isDeveloper ? (
          <SegmentedLinks
            label="Plans for"
            items={[
              { href: href("individual", billing), label: "Individual", active: audience === "individual" },
              { href: href("developers", billing), label: "Developers", active: audience === "developers" },
            ]}
          />
        ) : null}
        <SegmentedLinks
          label="Billing"
          items={[
            { href: href(audience, "monthly"), label: "Monthly", active: billing === "monthly" },
            {
              href: href(audience, "yearly"),
              label: "Yearly",
              active: billing === "yearly",
              badge: bestSaving ? `Save up to ${bestSaving}%` : undefined,
            },
          ]}
        />
      </div>

      <div className="mx-auto mt-10 grid max-w-[1040px] gap-4 md:grid-cols-3">
        {plans.map((p, i) => (
          <PlanCard
            key={p.id}
            plan={p}
            icon={ICONS[audience][i]}
            billing={billing}
            action={actionFor(p, i)}
            requestHref={requestHref(p)}
          />
        ))}
      </div>

      {/* Per tool, with any developer plan (D204). */}
      {audience === "developers" ? <SponsoredAddon /> : null}

      <p
        id="payments-note"
        className="mx-auto mt-6 flex max-w-[1040px] items-center justify-center gap-2 text-center text-[13px] text-muted"
      >
        <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
        {billingOpen
          ? "Paid plans are invoiced through Payoneer. Nothing is charged until you pay the invoice. Prices in USD."
          : "Paid plans open soon. Prices in USD."}
      </p>
    </>
  );
}
