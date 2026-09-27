import { ArrowRight } from "lucide-react";
import { Container, Section } from "@/components/ui/container";
import { Button, ButtonLink } from "@/components/ui/button";

/*
  The ElevenLabs hero shape (D122): a large, light headline on the left, the
  description set against it on the right, and the two pill actions under the
  headline. No image beside it: the page is carried by type, and the product
  preview directly below is the picture.

  One primary CTA, per the Hero-Centric pattern. Try Celpare is the filled pill;
  Request a demo is the outlined one.
*/
export function Hero() {
  return (
    <Section className="pb-12 pt-16 sm:pt-24 lg:pb-16 lg:pt-32">
      <Container>
        {/* Centred, not bottom aligned: with the founder block the right column
            is as tall as the left, and bottom alignment pushed its text up and
            the headline down (founder, 2026-09-25). */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <p className="reveal-load inline-flex items-center gap-2 text-[14px] text-muted">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              The home for AI tools and models
            </p>

            <h1
              style={{ "--reveal-delay": "90ms" } as React.CSSProperties}
              className="reveal-load mt-5 font-display text-[clamp(2.75rem,7vw,5rem)] font-normal leading-[1.02] tracking-[-0.035em]">
              Right tool.
              <br />
              Right result.
            </h1>

            <div
              style={{ "--reveal-delay": "260ms" } as React.CSSProperties}
              className="reveal-load mt-9 flex flex-wrap items-center gap-3"
            >
              <ButtonLink href="/get-started" className="h-12 px-7 text-[16px]">
                Try Celpare
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
              <ButtonLink
                href="/demo"
                variant="outline"
                className="h-12 px-7 text-[16px]"
              >
                Request a demo
              </ButtonLink>
            </div>
          </div>

          <div
            style={{ "--reveal-delay": "180ms" } as React.CSSProperties}
            className="reveal-load"
          >
            <p className="max-w-[46ch] text-[18px] leading-[1.55] text-foreground sm:text-[19px]">
              Celpare is an AI-powered platform for finding, comparing,
              researching and recommending AI tools, models and software, with
              community features in one ecosystem for AI users, developers and
              startups.
            </p>
            <p className="mt-4 text-[14px] text-muted">
              Free to start. No card required.
            </p>

            {/*
              For founders (founder instruction 2026-09-25). More details is a
              placeholder until the Celpare documents exist: it goes nowhere yet,
              so it is aria-disabled rather than a link to an empty page. When
              the documents ship, make it a ButtonLink to them.
            */}
            <div className="mt-10">
              <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-foreground">
                As a founder: grow your startup with Celpare
              </p>
              <Button
                type="button"
                variant="outline"
                aria-disabled="true"
                className="mt-4 h-11 cursor-not-allowed px-6 text-[15px]"
              >
                More details
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
