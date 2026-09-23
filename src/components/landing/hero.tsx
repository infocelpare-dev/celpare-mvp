import { ArrowRight } from "lucide-react";
import { Container, Section } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

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
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-end lg:gap-16">
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
            className="reveal-load lg:pb-[88px]"
          >
            <p className="max-w-[46ch] text-[18px] leading-[1.55] text-foreground sm:text-[19px]">
              Stop guessing which AI tool to use. Describe what you are trying
              to accomplish, and Celpare finds, compares and explains the tools
              that can actually do it.
            </p>
            <p className="mt-4 text-[14px] text-muted">
              Free to start. No card required.
            </p>
          </div>
        </div>
      </Container>
    </Section>
  );
}
