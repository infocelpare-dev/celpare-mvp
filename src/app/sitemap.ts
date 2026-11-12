import type { MetadataRoute } from "next";
import { LEGAL_DOCS } from "@/content/legal";
import { HELP_DOCS } from "@/content/help";
import { OPERATOR, PLACEHOLDERS_OPEN } from "@/content/operator";
import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  The public, indexable pages (phase LEGAL, 2026-10-07). Legal pages are left
  out while the operator's name and address are placeholders, because those
  pages are noindex until then.

  Tool and model profiles were missing until 2026-11-12. They are read with the
  anon client, so RLS decides what is public: approved rows only, exactly what
  the profile pages themselves will render. Rebuilt at most once an hour.

  A failed read throws rather than returning the static pages alone: a sitemap
  that silently drops every tool would tell Google they are gone. Thrown during
  revalidation, Next keeps serving the last good sitemap.
*/
export const revalidate = 3600;

type Row = { slug: string; updated_at: string | null };

async function catalogue(): Promise<{ tools: Row[]; models: Row[] }> {
  // A build with no Supabase env (CI) has nothing to list yet; the first
  // revalidation on the server fills it in.
  if (!isSupabaseConfigured()) return { tools: [], models: [] };
  const db = createAnonClient();
  const [tools, models] = await Promise.all([
    db.from("tools").select("slug, updated_at").eq("status", "approved").order("slug"),
    db.from("models").select("slug, updated_at").eq("status", "approved").order("slug"),
  ]);
  if (tools.error) throw new Error(`sitemap: tools read failed: ${tools.error.message}`);
  if (models.error) throw new Error(`sitemap: models read failed: ${models.error.message}`);
  return { tools: (tools.data ?? []) as Row[], models: (models.data ?? []) as Row[] };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || OPERATOR.site;
  const pages = ["", "/explore", "/community", "/search", "/compare", "/ask", "/pricing", "/demo", "/help", "/startups"];
  const docs = [
    ...HELP_DOCS.map((d) => ({ path: `/help/${d.slug}`, effective: d.effective })),
    ...(PLACEHOLDERS_OPEN
      ? []
      : [{ path: "/legal", effective: undefined }, ...LEGAL_DOCS.map((d) => ({ path: `/legal/${d.slug}`, effective: d.effective }))]),
  ];
  const { tools, models } = await catalogue();
  const profile = (prefix: string) => (r: Row) => ({
    url: `${site}${prefix}/${r.slug}`,
    ...(r.updated_at ? { lastModified: r.updated_at } : {}),
  });
  return [
    ...pages.map((p) => ({ url: `${site}${p}` })),
    ...docs.map((d) => ({ url: `${site}${d.path}`, ...(d.effective ? { lastModified: d.effective } : {}) })),
    ...tools.map(profile("/tools")),
    ...models.map(profile("/models")),
  ];
}
