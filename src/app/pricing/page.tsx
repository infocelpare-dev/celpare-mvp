import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { Container } from "@/components/ui/container";
import { PlanPicker } from "@/components/pricing/plan-picker";
import { CompareTable } from "@/components/pricing/compare-table";
import { PricingFaq } from "@/components/pricing/pricing-faq";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getViewerPlans } from "@/lib/pricing/viewer";
import { plansFor, type Audience, type Billing } from "@/lib/pricing/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "What Celpare costs, and what each plan includes.",
};

export const dynamic = "force-dynamic";

/*
  Laid out like claude.com/pricing: heading, audience switch, billing switch,
  three plan cards, a full comparison, then questions. All state is in the URL
  (?for=developers, ?billing=yearly), so the page is server rendered whole.
  The switches and cards are PlanPicker, shared with /plans (phase PLANS).

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
  let developerPlan: string | null = null;
  let isDeveloper = false;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);

    if (user) {
      const v = await getViewerPlans(supabase, user.id);
      plan = v.plan ?? "free";
      developerPlan = v.developerPlan ?? "free";
      isDeveloper = v.isDeveloper;
    }
  }

  const audience: Audience =
    params.for === "developers" && isDeveloper ? "developers" : "individual";
  const billing: Billing = params.billing === "yearly" ? "yearly" : "monthly";
  const { plans, compare } = plansFor(audience);

  /* The developer plan is developer_profiles.plan (D200). */
  const currentId = audience === "developers" ? developerPlan : plan;

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

        <PlanPicker
          base="/pricing"
          audience={audience}
          billing={billing}
          isDeveloper={isDeveloper}
          signedIn={signedIn}
          currentId={currentId}
        />

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
