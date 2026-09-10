import { ArrowRight, Search } from "lucide-react";
import { Container, Section } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

/*
  Marketplace / Directory pattern: search is the primary CTA, not a signup wall.
  The search field here is a visual promise of the product, not a live search,
  so it is a link styled as a field rather than a dead input a user can type
  into and get nothing from.
*/
export function Hero() {
  return (
    <Section className="pb-8 pt-14 sm:pb-10 sm:pt-20">
      <Container className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-[13px] text-muted">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-accent"
          />
          Now in early access
        </span>

        <h1 className="mx-auto mt-6 max-w-[15ch] font-display text-[clamp(2.2rem,6vw,3.6rem)] font-bold leading-[1.05] tracking-tight">
          Right tool. Right result.
        </h1>

        <p className="mx-auto mt-5 max-w-[620px] text-[17px] leading-relaxed text-muted sm:text-[18px]">
          Stop guessing which AI tool to use. Celpare helps you discover,
          compare and choose the right AI tools and models, alongside a
          community of people building with AI.
        </p>

        <a
          href="#waitlist"
          className="mx-auto mt-9 flex w-full max-w-[560px] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition-colors duration-200 ease-out hover:border-foreground/30"
        >
          <Search className="h-[18px] w-[18px] shrink-0 text-muted" aria-hidden />
          <span className="truncate text-[15px] text-muted">
            Try: an AI tool to turn long videos into TikTok clips
          </span>
        </a>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="#waitlist">
            Get started
            <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="#waitlist" variant="outline">
            Request a demo
          </ButtonLink>
        </div>

        <p className="mt-4 text-[13px] text-muted">
          Free to join. No card required.
        </p>
      </Container>
    </Section>
  );
}
