import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { DocPage } from "@/components/document/doc-page";
import { HELP_DOCS, helpDoc } from "@/content/help";

export function generateStaticParams() {
  return HELP_DOCS.map((d) => ({ slug: d.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const doc = helpDoc((await params).slug);
  if (!doc) return {};
  return { title: doc.title, description: doc.description, alternates: { canonical: `/help/${doc.slug}` } };
}

export default async function HelpDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const doc = helpDoc((await params).slug);
  if (!doc) notFound();
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
        <DocPage doc={doc} section="Help" sectionHref="/help" />
      </main>
      <Footer />
    </>
  );
}
