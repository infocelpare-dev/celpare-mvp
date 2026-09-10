import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Container, Section } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

/*
  Split hero: copy on the left, mark on the right. Stacks to a single column
  below lg, with the image first so the brand still leads on a phone.

  One primary CTA, per the Hero-Centric pattern. Try Celpare is the dominant
  action; Request a demo is secondary and Look around is a plain link.
*/
export function Hero() {
  return (
    <Section className="pb-10 pt-12 sm:pt-16">
      <Container>
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          {/* Copy. Second in DOM on small screens is avoided on purpose: the
              heading should still be the first thing a screen reader hits. */}
          <div className="order-2 text-center lg:order-1 lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-[13px] text-muted">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
              The home for AI tools and models
            </span>

            <h1 className="mt-6 font-display text-[clamp(2.2rem,5.5vw,3.6rem)] font-bold leading-[1.05] tracking-tight">
              Right tool.
              <br />
              Right result.
            </h1>

            <p className="mx-auto mt-5 max-w-[52ch] text-[17px] leading-relaxed text-muted lg:mx-0 sm:text-[18px]">
              Stop guessing which AI tool to use. Describe what you are trying
              to accomplish, and Celpare finds, compares and explains the tools
              that can actually do it.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <ButtonLink href="/get-started">
                Try Celpare
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/demo" variant="outline">
                Request a demo
              </ButtonLink>
            </div>

            {/* One primary CTA. A third route out of the hero competes with
                Try Celpare, and /explore is still reachable from the entry
                gate's Skip for now. */}
            <p className="mt-4 text-[13px] text-muted">
              Free to start. No card required.
            </p>
          </div>

          {/* Mark. Decorative, so it carries an empty alt and the heading does
              the describing. */}
          <div className="order-1 lg:order-2">
            <Image
              src="/brand/celpare-mark-256.png"
              alt=""
              width={420}
              height={420}
              priority
              sizes="(max-width: 1024px) 60vw, 420px"
              className="mx-auto h-auto w-full max-w-[260px] rounded-[28px] sm:max-w-[320px] lg:max-w-[420px]"
            />
          </div>
        </div>
      </Container>
    </Section>
  );
}
