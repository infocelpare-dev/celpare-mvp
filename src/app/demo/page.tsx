import type { Metadata } from "next";
import Link from "next/link";
import { Container, Section } from "@/components/ui/container";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { DemoForm } from "@/components/landing/demo-form";

export const metadata: Metadata = {
  title: "Request a demo",
  description: "See how Celpare finds and compares the right AI tools.",
};

export default function DemoPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Section>
          <Container className="max-w-[620px]">
            <h1 className="font-display text-[clamp(1.9rem,4vw,2.6rem)] font-bold leading-tight">
              See Celpare in action
            </h1>
            <p className="mt-4 text-[16px] leading-relaxed text-muted">
              Leave your email and we will send a walkthrough of how Celpare
              finds, compares and explains AI tools, plus the docs.
            </p>

            <div className="mt-8">
              <DemoForm />
            </div>

            <p className="mt-8 border-t border-border pt-6 text-[14px] text-muted">
              Would rather just try it?{" "}
              <Link
                href="/signup"
                className="text-foreground underline underline-offset-4 transition-colors duration-200 ease-out hover:text-muted"
              >
                Create a free account
              </Link>
            </p>
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}
