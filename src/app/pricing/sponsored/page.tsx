import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, MessageSquareText, Search, Target } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { SponsoredLabel } from "@/components/ui/sponsored-label";
import { SponsorToolPicker } from "@/components/pricing/sponsor-tool-picker";
import { initialChoice, sortChoices, sponsorChoice, type SponsorChoice } from "@/lib/sponsored/choice";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/pricing/plans";
import { arePaidPlansOn, isBillingOpen } from "@/lib/platform/settings";
import { SPONSORSHIP_PRICE_CENTS } from "@/lib/sponsored/config";
import { SPONSOR_INCLUDES, SPONSOR_PLACES, SPONSOR_QUESTIONS } from "@/lib/sponsored/offer";

export const metadata: Metadata = {
  title: "Sponsored tool",
  description: "Sponsor your AI tool in Celpare Search and Ask Celpare.",
};

export const dynamic = "force-dynamic";

/*
  Choosing the tool to sponsor (D204). /pricing describes the offer to
  everyone; this page is where a developer picks one of their tools and pays.
  Reached from /pricing and from Sponsor this tool on an owner's tool page.

  Developers only (D196): Developer Mode decides what renders, and anyone else
  is sent to /pricing. The price is not secret, so this is visibility, not
  access control. The words come from lib/sponsored/offer.ts (D271).
*/

const PLACE_ICONS = { search: Search, ask: MessageSquareText, fit: Target } as const;
const PLACES = SPONSOR_PLACES.map((p) => ({ ...p, icon: PLACE_ICONS[p.key] }));
const INCLUDED = SPONSOR_INCLUDES;
const QUESTIONS = SPONSOR_QUESTIONS.slice(1);

/* "1 November 2026", pinned to UTC so the server and the browser agree. */
function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function SponsoredPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string }>;
}) {
  let signedIn = false;
  let isDeveloper = false;
  let choices: SponsorChoice[] = [];
  /* slug to id, for the Request invoice link (phase BILL). Own tools only. */
  let toolIds: Record<string, string> = {};
  const billingOpen = await isBillingOpen();
  const plansOn = await arePaidPlansOn();

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

    /*
      The developer's own tools, and any sponsorship on them, so the picker can
      say which can be chosen and why not (founder, 2026-10-09). Both reads are
      the developer's own rows under RLS. A failed read throws rather than
      showing "you have no tools" (rule 13).
    */
    if (user && isDeveloper) {
      const { data: tools, error: toolsError } = await supabase
        .from("tools")
        .select("id, slug, name, logo_url, status, website_url")
        .eq("developer_id", user.id);
      if (toolsError) throw new Error(`Your tools could not be read: ${toolsError.message}`);
      toolIds = Object.fromEntries((tools ?? []).map((t) => [String(t.slug), String(t.id)]));

      const ids = (tools ?? []).map((t) => t.id as string);
      const { data: runs, error: runsError } = ids.length
        ? await supabase
            .from("tool_sponsorships")
            .select("tool_id, status, ends_at, placement_suspended_at, created_at")
            .in("tool_id", ids)
            .order("created_at", { ascending: false })
        : { data: [], error: null };
      if (runsError) throw new Error(`Your sponsorships could not be read: ${runsError.message}`);

      /* The newest run per tool is the one that decides. */
      const latest = new Map<string, { status: string; ends_at: string | null; placement_suspended_at: string | null }>();
      for (const r of runs ?? []) if (!latest.has(r.tool_id as string)) latest.set(r.tool_id as string, r as never);

      choices = sortChoices(
        (tools ?? []).map((t) => {
          const run = latest.get(t.id as string);
          return sponsorChoice(
            {
              slug: String(t.slug),
              name: String(t.name),
              logoUrl: (t.logo_url as string | null) ?? null,
              status: String(t.status),
              websiteUrl: (t.website_url as string | null) ?? null,
            },
            run ? { status: run.status, endsAt: run.ends_at, placementSuspendedAt: run.placement_suspended_at } : null,
          );
        }),
      );
    }
  }

  if (!isDeveloper) redirect("/pricing");

  const wanted = (await searchParams).tool ?? null;
  const endsFormatted = Object.fromEntries(
    choices.filter((c) => c.sponsoredUntil).map((c) => [c.slug, longDate(c.sponsoredUntil!)]),
  );

  const price = formatUsd(SPONSORSHIP_PRICE_CENTS);

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />} signedIn={signedIn}>
      <Container className="py-12 sm:py-16">
        <BackLink href="/pricing" label="Back to pricing" />

        <header className="mx-auto mt-6 max-w-[640px] text-center">
          <div className="flex justify-center">
            <SponsoredLabel />
          </div>
          <h1 className="mt-4 text-[clamp(2rem,4.5vw,3rem)] font-medium leading-[1.1] tracking-[-0.035em]">
            Put your tool first
          </h1>
          <p className="mx-auto mt-3 max-w-[520px] text-[16px] text-muted">
            Sponsor your AI tool and lead Search and Ask Celpare when people look for what it does.
          </p>
        </header>

        <div className="mx-auto mt-10 grid max-w-[1040px] gap-4 md:grid-cols-[1.1fr_1fr]">
          {/* The offer, shaped like a plan card. */}
          <section
            aria-labelledby="sponsored-price"
            className="flex flex-col rounded-3xl border border-border bg-elevated p-6 sm:p-8"
          >
            <h2 id="sponsored-price" className="text-[28px] font-medium leading-tight tracking-[-0.03em]">
              Sponsored tool
            </h2>
            <p className="mt-1 text-[15px] leading-snug text-muted">
              {plansOn ? "An add-on for any developer plan" : "The one paid thing on Celpare while plans are paused"}
            </p>
            <p className="mt-6 flex items-baseline gap-2">
              <span className="text-[44px] font-medium leading-none tracking-[-0.04em]">{price}</span>
              <span className="text-[13px] leading-tight text-muted">USD per month, per tool</span>
            </p>
            <div className="mt-6">
              <SponsorToolPicker
                choices={choices}
                initial={initialChoice(choices, wanted)}
                price={price}
                endsFormatted={endsFormatted}
                toolIds={toolIds}
                billingOpen={billingOpen}
              />
            </div>
            <hr className="my-6 border-border" />
            <ul className="space-y-3">
              {INCLUDED.map((line) => (
                <li key={line} className="flex gap-3 text-[15px] leading-snug">
                  <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Where it shows. */}
          <section aria-label="Where your tool appears" className="grid gap-4">
            {PLACES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-3xl border border-border p-6">
                <Icon className="size-6 text-foreground" strokeWidth={1.5} aria-hidden />
                <h3 className="mt-4 text-[17px] font-medium tracking-[-0.01em]">{title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </section>
        </div>

        <p
          id="sponsored-note"
          className="mx-auto mt-6 flex max-w-[1040px] items-center justify-center gap-2 text-center text-[13px] text-muted"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          Sponsorship opens soon. Prices in USD.
        </p>

        <section aria-labelledby="sponsored-faq" className="mx-auto mt-20 max-w-[760px]">
          <h2 id="sponsored-faq" className="mb-6 text-[clamp(1.5rem,3vw,2rem)] font-medium tracking-[-0.03em]">
            Questions
          </h2>
          <dl className="divide-y divide-border border-y border-border">
            {QUESTIONS.map(({ q, a }) => (
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
