import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { TOOL_SEARCH_LIMIT } from "./config";
import type { ToolCitation } from "./types";

/*
  The Tool Search API, and the enforcement point for the AI data boundary.

  It calls public.search_tools, whose RETURN TYPE is the allowlist (D39): slug,
  name, description, pricing, tags, rating, features. A function with seven
  columns in its signature cannot return an eighth, so no amount of prompt
  injection, and no mistake in this file, can widen what the model sees. This is
  what 03-data-model.md means by a projection rather than a prompt instruction.

  The function is SECURITY INVOKER, so RLS still applies underneath: the
  signature limits the columns and the policy limits the rows to approved tools.
  Two independent controls, which is the point.

  Uses the anonymous client deliberately. Tool search reads only public
  catalogue data, so running it with the caller's session would grant it more
  access than it needs for no benefit.
*/
export async function searchTools(topic: string, limit = TOOL_SEARCH_LIMIT): Promise<ToolCitation[]> {
  if (!isSupabaseConfigured()) return [];
  if (!topic.trim()) return [];

  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("search_tools", {
      q: topic,
      lim: limit,
    });

    if (error) {
      console.error("[ai] tool search failed", error.code, error.message);
      return [];
    }

    return (data ?? []) as ToolCitation[];
  } catch (err) {
    console.error("[ai] tool search threw", err);
    // An empty catalogue result is a state the prompt already handles: it tells
    // the model to say it found no match rather than to invent one.
    return [];
  }
}

/*
  The display record behind a citation card.

  This is NOT the model's projection and must not be confused with it. The seven
  column allowlist in search_tools exists to limit what the MODEL sees. A person
  reading the answer is entitled to more: the logo, the tagline, what platforms
  it runs on. The tool page already makes this distinction; the cards now make
  it too, so a citation can show a real record instead of a name.

  Read with the anonymous client, so RLS still limits it to approved tools, and
  nothing here is ever placed in the prompt.
*/
export type ToolCard = {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  pricing: string | null;
  pricingModel: string | null;
  features: string[];
  platforms: string[];
  tags: string[];
  rating: number | null;
  ratingCount: number | null;
};

export async function loadToolCards(slugs: string[]): Promise<ToolCard[]> {
  if (!isSupabaseConfigured() || slugs.length === 0) return [];

  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("tools")
      .select(
        "slug, name, tagline, description, logo_url, pricing, pricing_model, features, platforms, tags, rating, rating_count",
      )
      .in("slug", slugs);

    if (error) {
      console.error("[ai] tool cards failed", error.code, error.message);
      return [];
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const bySlug = new Map(rows.map((r) => [String(r.slug), r]));

    /* Returned in the order the search ranked them, not the order Postgres
       happened to send them back. The first card is the strongest match, and
       that should stay true on screen. */
    return slugs
      .map((slug) => bySlug.get(slug))
      .filter((r): r is Record<string, unknown> => Boolean(r))
      .map((r) => ({
        slug: String(r.slug),
        name: String(r.name),
        tagline: (r.tagline as string | null) ?? null,
        description: (r.description as string | null) ?? null,
        logoUrl: (r.logo_url as string | null) ?? null,
        pricing: (r.pricing as string | null) ?? null,
        pricingModel: (r.pricing_model as string | null) ?? null,
        features: (r.features as string[] | null) ?? [],
        platforms: (r.platforms as string[] | null) ?? [],
        tags: (r.tags as string[] | null) ?? [],
        rating: (r.rating as number | null) ?? null,
        ratingCount: (r.rating_count as number | null) ?? null,
      }));
  } catch (err) {
    console.error("[ai] tool cards threw", err);
    // The answer is worth more than the cards. Losing them degrades the reply;
    // it does not fail it.
    return [];
  }
}
