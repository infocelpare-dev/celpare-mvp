import { Container, Section } from "@/components/ui/container";
import { WaitlistForm } from "./waitlist-form";

/*
  Ink panel, not a lime one. The waitlist button is lime, so a lime panel would
  put lime on lime. Ink also keeps this identical in light and dark mode, which
  makes it the one fixed anchor on the page.

  The panel re-points the role tokens to their dark values rather than passing
  a variant prop down, so every nested component stays theme agnostic.
*/
const inkPanel = {
  "--background": "var(--celpare-ink)",
  "--surface": "#232323",
  "--foreground": "#f2f2f2",
  "--muted": "#a3a3a3",
  "--border": "#3a3a3a",
  "--ring": "var(--celpare-lime)",
} as React.CSSProperties;

export function CTA() {
  return (
    <Section id="waitlist" className="scroll-mt-[68px] border-t border-border">
      <Container>
        <div
          style={inkPanel}
          className="rounded-[16px] bg-background px-6 py-14 text-center sm:px-10"
        >
          <h2 className="mx-auto max-w-[20ch] font-display text-[clamp(1.7rem,3.5vw,2.5rem)] font-bold leading-tight text-foreground">
            Ready to stop guessing?
          </h2>
          <p className="mx-auto mt-3 max-w-[48ch] text-[16px] leading-relaxed text-muted">
            Join the waitlist and get early access when Celpare opens.
          </p>
          <div className="mt-8">
            <WaitlistForm />
          </div>
        </div>
      </Container>
    </Section>
  );
}
