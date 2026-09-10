import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { ToolsShowcase } from "@/components/landing/tools-showcase";
import { Container, Section } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Explore AI tools",
  description:
    "Browse AI tools and models by category. No account needed to look around.",
};

/*
  Where "Skip for now" lands. Browsing must not require an account, so this is
  fully public. The directory itself arrives in Phase 3, so for now it shows
  the categories and is honest that search and compare need the catalog.
*/
export default function ExplorePage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Section className="pb-6">
          <Container>
            <h1 className="font-display text-[clamp(1.9rem,4vw,2.6rem)] font-bold leading-tight">
              Explore the AI ecosystem
            </h1>
            <p className="mt-4 max-w-[620px] text-[16px] leading-relaxed text-muted">
              Look around without an account. Saving tools, comparing them side
              by side and asking Celpare need one, because they are tied to you.
            </p>
          </Container>
        </Section>

        <ToolsShowcase />

        <Section className="border-t border-border">
          <Container className="text-center">
            <h2 className="font-display text-[clamp(1.4rem,3vw,2rem)] font-semibold">
              Ready to go deeper?
            </h2>
            <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted">
              Create a free account to save tools, compare them and ask Celpare
              what fits your work.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href="/signup">
                Try Celpare
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/demo" variant="outline">
                Request a demo
              </ButtonLink>
            </div>
            <p className="mt-5 text-[13px] text-muted">
              Already have one?{" "}
              <Link
                href="/login"
                className="underline underline-offset-4 transition-colors duration-200 ease-out hover:text-foreground"
              >
                Log in
              </Link>
            </p>
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}
