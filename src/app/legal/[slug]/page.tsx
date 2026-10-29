import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { DocPage } from "@/components/document/doc-page";
import { LEGAL_DOCS, legalDoc } from "@/content/legal";
import { PLACEHOLDERS_OPEN } from "@/content/operator";

export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ slug: d.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const doc = legalDoc((await params).slug);
  if (!doc) return {};
  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: `/legal/${doc.slug}` },
    /* Not indexed until the operator's name and address are filled in. */
    robots: PLACEHOLDERS_OPEN ? { index: false, follow: true } : undefined,
  };
}

export default async function LegalDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const doc = legalDoc((await params).slug);
  if (!doc) notFound();
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <DocPage doc={doc} section="Legal" sectionHref="/legal" />
      </main>
      <Footer />
    </>
  );
}
