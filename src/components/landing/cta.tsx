import { ArrowRight } from "lucide-react";
import { Container, Section } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { WaitlistForm } from "./waitlist-form";

/*
  The closing call to action, on the page canvas like every other section.
  It sat in an ink panel until 2026-10-01, when the founder asked for the black
  block to go; the buttons are the same pills as the hero, so the page ends the
  way it starts.
*/
export function CTA() {
  return (
    <Section className="border-t border-border">
      <Container>
        <div className="px-6 py-6 text-center sm:px-10">
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
          {/* The pre launch waitlist (D198): a section of the page, not its purpose (D17). */}
          <div id="waitlist" className="mx-auto mt-12 max-w-[520px] scroll-mt-24 border-t border-border pt-10">
            <h3 className="font-display text-[20px] font-medium tracking-tight text-foreground">
              Celpare is coming. Join the waitlist.
            </h3>
            <p className="mt-2 text-[15px] text-muted">One email when we launch. Nothing else.</p>
            <div className="mt-5">
              <WaitlistForm />
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
