import "server-only";
import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  The approved tool and model slugs, for building the signed out profiles at
  build time (Cloudflare Workers free plan, 2026-11-18).

  On the free plan a Worker request may use 10 ms of CPU, and rendering a
  profile takes more, so a profile rendered on demand fails with error 1102.
  Built ahead of time, it is only read from the cache, which fits. The anon
  client and RLS decide what is public: approved rows only, the same rows the
  profile itself renders. A build without Supabase (CI) lists none, and each
  page is then rendered on its first visit instead.
*/
export async function approvedSlugs(table: "tools" | "models"): Promise<{ slug: string }[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await createAnonClient().from(table).select("slug").eq("status", "approved").order("slug");
  if (error) throw new Error(`static slugs: ${table} read failed: ${error.message}`);
  return ((data ?? []) as { slug: string }[]).map((r) => ({ slug: r.slug }));
}
