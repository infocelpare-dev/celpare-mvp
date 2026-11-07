import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PlanPicker, planHref } from "@/components/pricing/plan-picker";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getViewerPlans } from "@/lib/pricing/viewer";
import { plansFor, type Audience, type Billing } from "@/lib/pricing/plans";
import { dismissPlans } from "@/app/actions/plans";
import { isBillingOpen } from "@/lib/platform/settings";

export const metadata: Metadata = {
  title: "Plans",
  description: "The Celpare plans, after you log in.",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/*
  The plans after a login (phase PLANS, D228). /app sends a returning login on
  a free plan here once; Continue free clears the cookie and goes to the feed.
  Opened directly it still renders, since plans are not secret.

  A step, framed like /welcome, not a page in the app: logo, theme, and a way
  out at the top and the bottom. Developers open on the developer plans and
  can switch (D196). Paid buttons say Coming soon until payments exist (G5).
  The full comparison and questions stay on /pricing, linked below.
*/
export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string; billing?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/pricing");
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const v = await getViewerPlans(db, user.id);
  const plan = v.plan ?? "free";
  const developerPlan = v.developerPlan ?? "free";

  /* Developers start on their own plans unless they chose Individual. */
  const audience: Audience =
    v.isDeveloper && params.for !== "individual" ? "developers" : "individual";
  const billing: Billing = params.billing === "yearly" ? "yearly" : "monthly";
  const currentId = audience === "developers" ? developerPlan : plan;
  const currentName =
    plansFor(audience).plans.find((p) => p.id === currentId)?.name ?? "Free";
  const billingOpen = await isBillingOpen();

  return (
    <>
      <header className="border-b border-border">
        <Container className="flex h-[68px] items-center justify-between gap-3">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <form action={dismissPlans}>
              <Button type="submit" variant="ghost" size="sm">
                Skip for now
              </Button>
            </form>
          </div>
        </Container>
      </header>

      <main className="flex-1 px-4 py-10 sm:py-14">
        <Container className="px-0">
          <header className="text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[13px] text-muted">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              {audience === "developers"
                ? `Your developer plan: ${currentName}`
                : `Your plan: ${currentName}`}
            </p>
            <h1 className="mt-5 text-[clamp(2rem,4.5vw,3rem)] font-medium leading-[1.1] tracking-[-0.035em] text-balance">
              {audience === "developers"
                ? "Reach more people with your tools"
                : "Get more from Celpare"}
            </h1>
            <p className="mx-auto mt-3 max-w-[520px] text-[16px] text-muted text-balance">
              {audience === "developers"
                ? "More tools, more videos, analytics and better placement where people choose AI tools."
                : "More messages, more saved tools and collections, and deeper comparisons. Start free, upgrade when you need more."}
            </p>
          </header>

          <PlanPicker
            base="/plans"
            audience={audience}
            billing={billing}
            isDeveloper={v.isDeveloper}
            signedIn
            currentId={currentId}
            defaultAudience={v.isDeveloper ? "developers" : "individual"}
            billingOpen={billingOpen}
          />

          <div className="mx-auto mt-10 flex max-w-[1040px] flex-col items-center gap-4">
            <form action={dismissPlans}>
              <Button type="submit">Continue free</Button>
            </form>
            <Link
              href={planHref("/pricing", audience, billing)}
              className="text-[14px] text-muted underline-offset-4 transition-colors duration-200 ease-out hover:text-foreground hover:underline"
            >
              See the full comparison
            </Link>
          </div>
        </Container>
      </main>
    </>
  );
}
