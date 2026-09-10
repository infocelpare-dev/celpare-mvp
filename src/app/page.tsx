import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { WhyCelpare } from "@/components/landing/why-celpare";
import { ToolsShowcase } from "@/components/landing/tools-showcase";
import { AudienceSplit } from "@/components/landing/audience-split";
import { CTA } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="flex-1">
        <Hero />
        <HowItWorks />
        <WhyCelpare />
        <ToolsShowcase />
        <AudienceSplit />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
