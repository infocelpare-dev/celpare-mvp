import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { AskDemo } from "@/components/landing/ask-demo";
import { ComparePreview } from "@/components/landing/compare-preview";
import { CatalogueTools } from "@/components/landing/catalogue-tools";
import { CTA } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

/*
  Show the product, do not describe it (founder, 2026-11-06). Below the hero the
  page is three real things: Ask Celpare answering, a real comparison, and real
  catalogue tools. How it works, Why Celpare, the category list and the audience
  cards were removed: each described a screen instead of showing one, and the
  founder path they repeated is in the hero and on /startups.
*/
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
        <section id="ask" className="scroll-mt-[84px] pb-4">
          <div
            style={{ "--reveal-delay": "380ms" } as React.CSSProperties}
            className="reveal-load mx-auto w-full max-w-[1140px] px-4 sm:px-6"
          >
            <AskDemo />
          </div>
        </section>
        {/* Each section fades up as it scrolls in. CSS only, see .reveal in globals.css. */}
        <div className="reveal">
          <ComparePreview />
        </div>
        <div className="reveal">
          <CatalogueTools />
        </div>
        <div className="reveal">
          <CTA />
        </div>
      </main>
      <Footer />
    </>
  );
}
