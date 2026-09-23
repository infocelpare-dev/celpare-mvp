import { ArrowRight } from "lucide-react";
import { Container, Section } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

/*
  Ink panel, not lime, because the primary button is lime and lime on lime does
  not work (D14). Ink also renders identically in both themes, which makes this
  the one fixed anchor on the page.

  The panel re-points the role tokens to their dark values rather than passing a
  variant prop down, so nested components stay theme agnostic.
*/
const inkPanel = {
  "--background": "var(--celpare-ink)",
  "--surface": "#232323",
  "--foreground": "#f2f2f2",
  "--muted": "#a3a3a3",
  "--border": "#3a3a3a",
  "--ring": "var(--celpare-lime)",
  /* The D122 tokens too. Without these the outline button kept the page's light
     value for --elevated (white) under this panel's light text, so Request a demo
     drew white on white in light mode. Every role a nested control reads must be
     re-pointed here, not only the ones that existed when the panel was written. */
  "--elevated": "#232323",
  "--primary": "#f2f2f1",
  "--primary-hover": "#d6d6d4",
  "--on-primary": "#0c0c0c",
} as React.CSSProperties;

export function CTA() {
  return (
    <Section className="border-t border-border">
      <Container>
        <div
          style={inkPanel}
          className="rounded-[28px] bg-background px-6 py-14 text-center sm:px-10"
        >
          <h2 className="mx-auto max-w-[20ch] font-display text-[clamp(1.7rem,3.5vw,2.5rem)] font-bold leading-tight text-foreground">
            Ready to stop guessing?
          </h2>
          <p className="mx-auto mt-3 max-w-[48ch] text-[16px] leading-relaxed text-muted">
            Find the right AI tool in minutes instead of an afternoon of tabs.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/get-started">
              Try Celpare
              <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/demo" variant="outline">
              Request a demo
            </ButtonLink>
          </div>
        </div>
      </Container>
    </Section>
  );
}
