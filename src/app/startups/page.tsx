import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Plus } from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { Container, Section, SectionHead } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { DEVELOPER_PLANS, INDIVIDUAL_PLANS, formatUsd } from "@/lib/pricing/plans";
import { MAX_SPONSORED_TOOLS, SPONSORSHIP_PRICE_CENTS } from "@/lib/sponsored/config";
import { VerifiedTick } from "@/components/ui/verified-tick";
import {
  BUILD_STAGES,
  LAUNCH_STEPS,
  STARTUP_FAQ,
  TRUST_POINTS,
} from "@/content/startups";

export const metadata: Metadata = {
  title: "Grow your startup",
  description:
    "Build your startup with the right AI tools and models, and get your own AI tool in front of the people looking for it. Free to start.",
};

/*
  /startups (D237). The hero's "As a founder: grow your startup with Celpare"
  block links here. Two paths on one page, each with its own anchor, so the
  hero chips and the demo email can send people straight to theirs.
  ui-ux-pro-max: minimal, one primary action, bento cards for the stages.
*/
export default function StartupsPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        {/* Hero */}
        <Section className="pb-10 sm:pb-14">
          <Container className="text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[13px] font-medium text-muted">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              For founders and startups
            </p>
            <h1 className="mx-auto mt-6 max-w-[16ch] font-display text-[clamp(2.2rem,5.5vw,4rem)] font-medium leading-[1.05] tracking-[-0.03em]">
              Grow your startup with Celpare
            </h1>
            <p className="mx-auto mt-5 max-w-[56ch] text-[17px] leading-relaxed text-muted sm:text-[18px]">
              Build with the right AI tools, and get your own AI tool in front
              of the people looking for it.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/get-started" className="h-12 w-full px-7 text-[15px] sm:w-auto">
                Start free
              </ButtonLink>
              <ButtonLink href="/demo" variant="outline" className="h-12 w-full px-7 text-[15px] sm:w-auto">
                Request a demo
              </ButtonLink>
            </div>
            <nav aria-label="Choose your path" className="mt-10 flex flex-wrap items-center justify-center gap-2">
              <PathChip href="#launch">I&apos;m launching an AI tool</PathChip>
              <PathChip href="#build">I&apos;m building with AI</PathChip>
            </nav>
          </Container>
        </Section>

        {/* Path 1: get your AI tool discovered (first, founder 2026-11-04) */}
        <Section id="launch" className="scroll-mt-[72px] border-t border-border">
          <Container>
            <SectionHead
              title="Get your AI tool discovered"
              subtitle="Be recommended to people when they ask for what your tool does, not buried in a list nobody reads."
            />
            <ol className="mx-auto max-w-[760px] divide-y divide-border border-y border-border">
              {LAUNCH_STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4 py-6 sm:gap-6">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-[14px] font-medium tabular-nums text-on-primary"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[18px] font-medium tracking-[-0.01em]">{s.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            {/* Developer plans, read from plans.ts so they match /pricing (D238). */}
            <h3 id="developer-plans" className="mt-16 text-center font-display text-[clamp(1.4rem,2.6vw,1.9rem)] font-medium tracking-[-0.02em]">
              Developer plans
            </h3>
            <p className="mx-auto mt-2 max-w-[56ch] text-center text-[15px] text-muted">
              Separate from your personal plan. They cover the tools you list.
            </p>
            <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
              {DEVELOPER_PLANS.map((p) => (
                <li
                  key={p.id}
                  className={`flex flex-col rounded-[20px] border p-6 ${p.id === "elite" ? "border-foreground" : "border-border"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[16px] font-medium">{p.name}</p>
                    {p.monthlyCents > 0 ? (
                      <span className="rounded-full border border-border px-2.5 py-0.5 text-[12px] text-muted">Coming soon</span>
                    ) : null}
                  </div>
                  <p className="mt-2 font-display text-[30px] font-medium tracking-[-0.02em]">
                    {p.monthlyCents === 0 ? "Free" : formatUsd(p.monthlyCents)}
                    {p.monthlyCents === 0 ? null : <span className="text-[14px] font-normal text-muted"> a month</span>}
                  </p>
                  <p className="mt-1 text-[14px] text-muted">{p.tagline}</p>
                  <ul className="mt-5 space-y-2.5 border-t border-border pt-5">
                    {p.features.map((feat) => (
                      <li key={feat} className="flex gap-2 text-[14px] leading-snug">
                        <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* The blue tick (D201): Elite only, requested from the tool page, granted by Celpare. */}
              <article id="verified" className="flex flex-col rounded-[20px] border border-border bg-surface p-6 sm:p-7">
                <h3 className="flex items-center gap-2 text-[20px] font-medium tracking-[-0.02em]">
                  Verified tool badge
                  <VerifiedTick label="Verified" className="size-5" />
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  The blue tick tells people your tool is the real one, run by its makers. It shows on the tool
                  page and beside every post the tool makes.
                </p>
                <ol className="mt-4 space-y-2 text-[14px] leading-snug">
                  <li><span className="font-medium">1.</span> Verify that you own the tool.</li>
                  <li><span className="font-medium">2.</span> Be on the Elite developer plan.</li>
                  <li><span className="font-medium">3.</span> Request it from the tool page. Celpare checks and grants it.</li>
                </ol>
              </article>

              {/* Sponsored placement (D204, D205): flat price, no bids, only on a match. */}
              <article id="sponsored" className="flex flex-col rounded-[20px] border border-border bg-surface p-6 sm:p-7">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[20px] font-medium tracking-[-0.02em]">Sponsored placement</h3>
                  <span className="rounded-full border border-border px-2.5 py-0.5 text-[12px] text-muted">Coming soon</span>
                </div>
                <p className="mt-2 font-display text-[26px] font-medium tracking-[-0.02em]">
                  {formatUsd(SPONSORSHIP_PRICE_CENTS)}
                  <span className="text-[14px] font-normal text-muted"> a month per tool</span>
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  Put a live tool in one of up to {MAX_SPONSORED_TOOLS} Sponsored places at the top of Search and in
                  Ask Celpare, only when it matches what the person asked for. No bidding, one flat price, on any
                  developer plan.
                </p>
                <p className="mt-3 text-[14px] leading-snug">
                  Always labelled Sponsored. It never changes the organic results.
                </p>
              </article>
            </div>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/developer" className="h-12 px-7 text-[15px]">
                Turn on Developer Mode
              </ButtonLink>
              <ButtonLink href="/help" variant="outline" className="h-12 px-7 text-[15px]">
                How listing works
              </ButtonLink>
            </div>
          </Container>
        </Section>

        {/* Path 2: build with the right tools */}
        <Section id="build" className="scroll-mt-[72px] border-t border-border">
          <Container>
            <SectionHead
              title="Build with the right tools"
              subtitle="From the first idea to a running product, choose by fit and by cost, with the evidence in front of you."
            />
            <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {BUILD_STAGES.map((s, i) => (
                <li key={s.stage} className="flex flex-col rounded-[20px] border border-border bg-surface p-6 sm:p-7">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-muted">
                    <span className="tabular-nums">0{i + 1}</span>
                    <span aria-hidden>·</span>
                    <span>{s.stage}</span>
                    {s.note ? (
                      <span className="ms-auto rounded-full border border-border px-2.5 py-0.5 text-[12px] text-foreground">
                        {s.note}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-4 text-[20px] font-medium leading-snug tracking-[-0.02em]">{s.title}</h3>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed text-muted">{s.body}</p>
                  <Link
                    href={s.link.href}
                    className="mt-5 inline-flex min-h-11 w-fit items-center gap-1.5 text-[15px] font-medium underline-offset-4 hover:underline"
                  >
                    {s.link.label}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </li>
              ))}
            </ol>
          </Container>
        </Section>

        {/* Trust */}
        <Section className="border-t border-border">
          <Container>
            <SectionHead title="How Celpare decides what to recommend" />
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {TRUST_POINTS.map((t) => (
                <li key={t.title} className="rounded-[20px] border border-border p-6">
                  <h3 className="flex items-center gap-2 text-[17px] font-medium tracking-[-0.01em]">
                    <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                    {t.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">{t.body}</p>
                </li>
              ))}
            </ul>
          </Container>
        </Section>

        {/* Plans, read from plans.ts so they never drift from /pricing */}
        <Section className="border-t border-border">
          <Container>
            <SectionHead
              title="Plans for building with Celpare"
              subtitle="Your personal plan. Paid plans are coming soon; everything on Free works today."
            />
            <ul className="mx-auto grid max-w-[880px] grid-cols-1 gap-4 sm:grid-cols-3">
              {INDIVIDUAL_PLANS.map((p) => (
                <li key={p.id} className="rounded-[20px] border border-border p-6">
                  <p className="text-[15px] font-medium">{p.name}</p>
                  <p className="mt-2 font-display text-[28px] font-medium tracking-[-0.02em]">
                    {p.monthlyCents === 0 ? "Free" : formatUsd(p.monthlyCents)}
                    {p.monthlyCents === 0 ? null : (
                      <span className="text-[14px] font-normal text-muted"> a month</span>
                    )}
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">{p.tagline}</p>
                  {p.monthlyCents === 0 ? null : (
                    <p className="mt-3 text-[13px] text-muted">Coming soon</p>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-center">
              <Link href="/pricing" className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium underline underline-offset-4">
                See every plan
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </p>
          </Container>
        </Section>

        {/* FAQ, native details as on /pricing */}
        <Section className="border-t border-border">
          <Container className="max-w-[820px]">
            <SectionHead title="Questions founders ask" />
            <div className="divide-y divide-border border-y border-border">
              {STARTUP_FAQ.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-medium tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <Plus
                      className="size-5 shrink-0 text-muted transition-transform duration-200 ease-out group-open:rotate-45 motion-reduce:transition-none"
                      aria-hidden
                    />
                  </summary>
                  <p className="max-w-[680px] pb-5 text-[15px] leading-relaxed text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </Container>
        </Section>

        {/* Closing */}
        <Section className="border-t border-border">
          <Container className="text-center">
            <h2 className="mx-auto max-w-[20ch] font-display text-[clamp(1.8rem,4vw,2.8rem)] font-medium leading-tight tracking-[-0.02em]">
              Right tool. Right result.
            </h2>
            <p className="mx-auto mt-3 max-w-[48ch] text-muted">
              Free to start. No card required.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink href="/get-started" className="h-12 w-full px-7 text-[15px] sm:w-auto">
                Start free
              </ButtonLink>
              <ButtonLink href="/demo" variant="outline" className="h-12 w-full px-7 text-[15px] sm:w-auto">
                Request a demo
              </ButtonLink>
            </div>
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}

function PathChip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-4 text-[14px] font-medium transition-colors duration-200 hover:bg-surface"
    >
      {children}
      <ArrowRight className="size-3.5 rotate-90" aria-hidden />
    </a>
  );
}
