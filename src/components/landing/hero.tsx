import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Container, Section } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { ProductPreview } from "./product-preview";

export function Hero() {
  return (
    <Section className="pb-8 pt-14 sm:pb-10 sm:pt-20">
      <Container className="text-center">
        {/* The orca mark, large. Priority because it is the largest paint in
            the viewport, so it should not arrive after the text. */}
        <Image
          src="/brand/celpare-mark-256.png"
          alt=""
          width={72}
          height={72}
          priority
          className="mx-auto rounded-[18px]"
        />

        <span className="mt-7 inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-[13px] text-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
          The home for AI tools and models
        </span>

        <h1 className="mx-auto mt-6 max-w-[15ch] font-display text-[clamp(2.2rem,6vw,3.6rem)] font-bold leading-[1.05] tracking-tight">
          Right tool. Right result.
        </h1>

        <p className="mx-auto mt-5 max-w-[620px] text-[17px] leading-relaxed text-muted sm:text-[18px]">
          Stop guessing which AI tool to use. Describe what you are trying to
          accomplish, and Celpare finds, compares and explains the tools that
          can actually do it.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/signup">
            Try Celpare
            <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/demo" variant="outline">
            Request a demo
          </ButtonLink>
        </div>

        <p className="mt-4 text-[13px] text-muted">
          Free to start. No card required.{" "}
          <a
            href="/explore"
            className="underline underline-offset-4 transition-colors duration-200 ease-out hover:text-foreground"
          >
            Or look around first
          </a>
          .
        </p>

        <ProductPreview />
      </Container>
    </Section>
  );
}
