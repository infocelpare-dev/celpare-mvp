import type { Metadata } from "next";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { DocIndex } from "@/components/document/doc-index";
import { LEGAL_GROUPS } from "@/content/legal";
import { PLACEHOLDERS_OPEN } from "@/content/operator";

export const metadata: Metadata = {
  title: "Legal",
  description: "Celpare's terms, privacy policy, cookie policy and the rules for developers, sponsors and the community.",
  robots: PLACEHOLDERS_OPEN ? { index: false, follow: true } : undefined,
};

export default function LegalIndexPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <DocIndex
          title="Legal"
          intro="The agreements and policies that apply when you use Celpare, written to say exactly what the product does."
          base="/legal"
          groups={LEGAL_GROUPS}
        />
      </main>
      <Footer />
    </>
  );
}
