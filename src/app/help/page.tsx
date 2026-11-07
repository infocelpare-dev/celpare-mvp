import type { Metadata } from "next";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { DocIndex } from "@/components/document/doc-index";
import { HELP_GROUPS } from "@/content/help";
import { OPERATOR } from "@/content/operator";

export const metadata: Metadata = {
  title: "Help",
  description: "How every part of Celpare works: Ask Celpare, Search, Explore, Compare, the community, messages, your data and listing a tool.",
};

export default function HelpIndexPage() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <DocIndex
          title="Help"
          intro={`How every part of Celpare works today. For the rules that apply, see [Legal](/legal). Need help? Email [${OPERATOR.contact}](mailto:${OPERATOR.contact}).`}
          base="/help"
          groups={HELP_GROUPS}
        />
      </main>
      <Footer />
    </>
  );
}
