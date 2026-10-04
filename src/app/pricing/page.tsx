import type { Metadata } from "next";
import {
  BadgeCheck,
  Code,
  Compass,
  FlaskConical,
  Rocket,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { Container } from "@/components/ui/container";
import { SegmentedLinks } from "@/components/pricing/segmented-links";
import { PlanCard, type PlanAction } from "@/components/pricing/plan-card";
import { CompareTable } from "@/components/pricing/compare-table";
import { PricingFaq } from "@/components/pricing/pricing-faq";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  bestYearlyPercent,
  plansFor,
  type Audience,
  type Billing,
  type PricingPlan,
} from "@/lib/pricing/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "What Celpare costs, and what each plan includes.",
};

export const dynamic = "force-dynamic";

const ICONS: Record<Audience, LucideIcon[]> = {
  individual: [Compass, Zap, FlaskConical],
  developers: [Code, Rocket, BadgeCheck],
};

/*
  Laid out like claude.com/pricing: heading, audience switch, billing switch,
  three plan cards, a full comparison, then questions. All state is in the URL
  (?for=developers, ?billing=yearly), so the page is server rendered whole.

  The Developers tab renders only for someone with Developer Mode on (D196).
  That reads profiles.is_developer, which per D20 grants nothing and decides
  only what to render; plans are not secret, so this is visibility, not access
  control. Anyone else asking for ?for=developers gets the individual plans.
*/
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string; billing?: string }>;
}) {
  const params = await searchParams;

  let signedIn = false;
  let plan: string | null = null;
  let isDeveloper = false;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);

    if (user) {
      const [priv, own] = await Promise.all([
        // plan is readable only by its owner, through this function (D194).
        supabase.rpc("my_profile_private"),
        supabase.from("profiles").select("is_developer").eq("id", user.id).maybeSingle(),
      ]);
      plan = ((priv.data as { plan: string | null } | null)?.plan ?? "free");
      isDeveloper = Boolean(own.data?.is_developer);
    }
  }

  const audience: Audience =
    params.for === "developers" && isDeveloper ? "developers" : "individual";
  const billing: Billing = params.billing === "yearly" ? "yearly" : "monthly";
  const { plans, compare } = plansFor(audience);
  const bestSaving = bestYearlyPercent(plans);

  const href = (a: Audience, b: Billing) => {
    const q = new URLSearchParams();
    if (a === "developers") q.set("for", "developers");
    if (b === "yearly") q.set("billing", "yearly");
    const s = q.toString();
    return s ? `/pricing?${s}` : "/pricing";
  };

  /* Developer plans are not modelled yet (G37), so every developer is on the
     developer Free plan. */
  const currentId = audience === "developers" ? "free" : plan;

  const actionFor = (p: PricingPlan, index: number): PlanAction => {
    if (!signedIn) return p.monthlyCents === 0 ? "sign-in" : "coming-soon";
    if (p.id === currentId) return "current";
    const currentIndex = plans.findIndex((x) => x.id === currentId);
    if (currentIndex > index) return "included";
    return "coming-soon";
  };

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />}
      signedIn={signedIn}
    >
      <Container className="py-12 sm:py-16">
        <header className="text-center">
          <h1 className="text-[clamp(2rem,4.5vw,3rem)] font-medium leading-[1.1] tracking-[-0.035em]">
            {audience === "developers"
              ? "Plans that grow your reach"
              : "Plans that fit how you choose"}
          </h1>
          <p className="mx-auto mt-3 max-w-[520px] text-[16px] text-muted">
            {audience === "developers"
              ? "List your AI tools where people come to choose them."
              : "Right tool. Right result. Start free and upgrade when you need more."}
          </p>
        </header>

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
            />
          ))}
        </div>

        <p
          id="payments-note"
          className="mx-auto mt-6 flex max-w-[1040px] items-center justify-center gap-2 text-center text-[13px] text-muted"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          Paid plans open soon. Prices in USD.
        </p>

        <section aria-labelledby="compare-heading" className="mx-auto mt-20 max-w-[1040px]">
          <h2
            id="compare-heading"
            className="mb-6 text-[clamp(1.5rem,3vw,2rem)] font-medium tracking-[-0.03em]"
          >
            Compare plans
          </h2>
          <CompareTable plans={plans} groups={compare} />
        </section>

        <section aria-labelledby="faq-heading" className="mx-auto mt-20 max-w-[1040px]">
          <h2
            id="faq-heading"
            className="mb-6 text-[clamp(1.5rem,3vw,2rem)] font-medium tracking-[-0.03em]"
          >
            Questions
          </h2>
          <PricingFaq audience={audience} />
        </section>
      </Container>
    </AppShell>
  );
}
