import type { Metadata } from "next";
import { Check, MessageSquareText, Search, Target } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { SponsoredLabel } from "@/components/ui/sponsored-label";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/pricing/plans";
import { SPONSORSHIP_PRICE_CENTS } from "@/lib/sponsored/config";
import { SPONSOR_INCLUDES, SPONSOR_PLACES, SPONSOR_QUESTIONS } from "@/lib/sponsored/offer";
import { arePaidPlansOn } from "@/lib/platform/settings";
import { PlansPricing } from "@/components/pricing/plans-pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description: "What Celpare costs: free to use, and a sponsorship for makers of AI tools.",
};

export const dynamic = "force-dynamic";

/*
  Pricing follows the paid plans switch (D271, founder 2026-11-20: plans are
  paused, not removed). On: the plans (PlansPricing). Off, as now: Celpare is
  free and the one thing sold is a tool sponsorship, which also gives the
  developer what Elite gave.

  Public: the signed out copy is prebuilt at /anon/pricing (Workers free plan,
  10 ms CPU), so for a visitor the switch takes effect on the next deploy. The
  sponsorship button follows the viewer: a developer goes on to choose a tool,
  a signed in account to Developer Mode, and a visitor to Get started.
  Developer Mode is a UI flag (D20), so this decides what renders and grants
  nothing.
*/

const PLACE_ICONS = { search: Search, ask: MessageSquareText, fit: Target } as const;

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string; billing?: string }>;
}) {
  if (await arePaidPlansOn()) return <PlansPricing searchParams={searchParams} />;

  let signedIn = false;
  let isDeveloper = false;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
    if (user) {
      const { data } = await supabase.from("profiles").select("is_developer").eq("id", user.id).maybeSingle();
      isDeveloper = Boolean(data?.is_developer);
    }
  }

  const cta = isDeveloper
    ? { href: "/pricing/sponsored", label: "Choose a tool to sponsor" }
    : signedIn
      ? { href: "/developer", label: "Turn on Developer Mode" }
      : { href: "/get-started", label: "List your tool free" };

  const price = formatUsd(SPONSORSHIP_PRICE_CENTS);

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />} signedIn={signedIn}>
      <Container className="py-12 sm:py-16">
        <header className="mx-auto max-w-[640px] text-center">
          <h1 className="text-[clamp(2rem,4.5vw,3rem)] font-medium leading-[1.1] tracking-[-0.035em]">
            Celpare is free
          </h1>
          <p className="mx-auto mt-3 max-w-[520px] text-[16px] text-muted">
            Ask, Search, Explore, Compare, the community and listing your tools cost nothing. If you make an
            AI tool, you can sponsor it.
          </p>
        </header>

        <div className="mx-auto mt-10 grid max-w-[1040px] gap-4 md:grid-cols-[1.1fr_1fr]">
          <section
            aria-labelledby="sponsored-price"
            className="flex flex-col rounded-3xl border border-border bg-elevated p-6 sm:p-8"
          >
            <SponsoredLabel />
            <h2 id="sponsored-price" className="mt-4 text-[28px] font-medium leading-tight tracking-[-0.03em]">
              Sponsored tool
            </h2>
            <p className="mt-1 text-[15px] leading-snug text-muted">For makers of AI tools</p>
            <p className="mt-6 flex items-baseline gap-2">
              <span className="text-[44px] font-medium leading-none tracking-[-0.04em]">{price}</span>
              <span className="text-[13px] leading-tight text-muted">USD per month, per tool</span>
            </p>
            <ButtonLink href={cta.href} prefetch={false} className="mt-6 w-full">
              {cta.label}
            </ButtonLink>
            <hr className="my-6 border-border" />
            <ul className="space-y-3">
              {SPONSOR_INCLUDES.map((line) => (
                <li key={line} className="flex gap-3 text-[15px] leading-snug">
                  <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Where your tool appears" className="grid gap-4">
            {SPONSOR_PLACES.map(({ key, title, body }) => {
              const Icon = PLACE_ICONS[key];
              return (
                <div key={key} className="rounded-3xl border border-border p-6">
                  <Icon className="size-6 text-foreground" strokeWidth={1.5} aria-hidden />
                  <h3 className="mt-4 text-[17px] font-medium tracking-[-0.01em]">{title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{body}</p>
                </div>
              );
            })}
          </section>
        </div>

        <section aria-labelledby="faq-heading" className="mx-auto mt-20 max-w-[760px]">
          <h2 id="faq-heading" className="mb-6 text-[clamp(1.5rem,3vw,2rem)] font-medium tracking-[-0.03em]">
            Questions
          </h2>
          <dl className="divide-y divide-border border-y border-border">
            {SPONSOR_QUESTIONS.map(({ q, a }) => (
              <div key={q} className="py-5">
                <dt className="text-[16px] font-medium">{q}</dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </Container>
    </AppShell>
  );
}
