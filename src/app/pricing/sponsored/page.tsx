import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, MessageSquareText, Search, Target } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { SponsoredLabel } from "@/components/ui/sponsored-label";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/pricing/plans";
import { MAX_SPONSORED_TOOLS as SPONSORED_MAX, SPONSORSHIP_PRICE_CENTS } from "@/lib/sponsored/config";

export const metadata: Metadata = {
  title: "Sponsored tool",
  description: "Sponsor your AI tool in Celpare Search and Ask Celpare.",
};

export const dynamic = "force-dynamic";

/*
  The Sponsored tool page (D204), inside Pricing. Reached from the Sponsored
  card on the Developers tab and from Sponsor this tool on an owner's tool
  page.

  Developers only, the same rule as the Developers tab (D196): Developer Mode
  decides what renders, and anyone else is sent to /pricing. The price is not
  secret, so this is visibility, not access control.

  Not on sale yet: the button says Coming soon, like every paid plan, until
  payments open (Phase 7). There is no request to send.
*/

const PLACES = [
  {
    icon: Search,
    title: "Top of Search",
    body: `Up to ${SPONSORED_MAX} sponsored tools lead the results, above everything else, when someone searches for what your tool does.`,
  },
  {
    icon: MessageSquareText,
    title: "In Ask Celpare",
    body: `When someone asks about tools like yours, up to ${SPONSORED_MAX} sponsored tools appear first, then the rest of the answer.`,
  },
  {
    icon: Target,
    title: "Only where it fits",
    body: "Your tool shows only on searches and questions it matches, so the people who see it are looking for it.",
  },
];

const INCLUDED = [
  "Sponsored placement in Search and Ask Celpare",
  "The Sponsored label on every placement",
  "Works with any developer plan",
  "Monthly, per tool",
  "Your place in the normal results stays exactly where it is",
];

const QUESTIONS = [
  {
    q: "Does sponsoring change my normal ranking?",
    a: "No. Sponsored tools sit above the results in their own labelled slots. The normal results are ranked exactly as they would be without sponsorship.",
  },
  {
    q: "Will my tool appear on every search?",
    a: "No. Only on searches and questions it matches. Paying buys position among relevant results, never a place on an unrelated one.",
  },
  {
    q: "How many sponsored tools can appear at once?",
    a: `At most ${SPONSORED_MAX} on a search or an answer. The most relevant sponsored tools for that search take the slots.`,
  },
  {
    q: "Does Ask Celpare recommend sponsored tools in its answer?",
    a: "Sponsored tools appear as labelled cards. The written answer is not paid for and is the same with or without sponsorship.",
  },
];

export default async function SponsoredPricingPage() {
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

  if (!isDeveloper) redirect("/pricing");

  const price = formatUsd(SPONSORSHIP_PRICE_CENTS);

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />} signedIn={signedIn}>
      <Container className="py-12 sm:py-16">
        <BackLink href="/pricing?for=developers" label="Back to developer plans" />

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
            <p className="mt-1 text-[15px] leading-snug text-muted">An add-on for any developer plan</p>
            <p className="mt-6 flex items-baseline gap-2">
              <span className="text-[44px] font-medium leading-none tracking-[-0.04em]">{price}</span>
              <span className="text-[13px] leading-tight text-muted">USD per month, per tool</span>
            </p>
            <div className="mt-6">
              <Button className="w-full" disabled aria-describedby="sponsored-note">
                Coming soon
                <span className="sr-only">: sponsorship cannot be bought yet</span>
              </Button>
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
