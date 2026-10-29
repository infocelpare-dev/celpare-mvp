import type { MetadataRoute } from "next";
import { LEGAL_DOCS } from "@/content/legal";
import { HELP_DOCS } from "@/content/help";
import { OPERATOR, PLACEHOLDERS_OPEN } from "@/content/operator";

/*
  The public, indexable pages (phase LEGAL, 2026-10-07). Legal pages are left
  out while the operator's name and address are placeholders, because those
  pages are noindex until then.
*/
export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || OPERATOR.site;
  const pages = ["", "/explore", "/community", "/search", "/compare", "/ask", "/pricing", "/demo", "/help"];
  const docs = [
    ...HELP_DOCS.map((d) => ({ path: `/help/${d.slug}`, effective: d.effective })),
    ...(PLACEHOLDERS_OPEN
      ? []
      : [{ path: "/legal", effective: undefined }, ...LEGAL_DOCS.map((d) => ({ path: `/legal/${d.slug}`, effective: d.effective }))]),
  ];
  return [
    ...pages.map((p) => ({ url: `${site}${p}` })),
    ...docs.map((d) => ({ url: `${site}${d.path}`, ...(d.effective ? { lastModified: d.effective } : {}) })),
  ];
}
