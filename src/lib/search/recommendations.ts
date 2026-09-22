import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { loadAffinity } from "./personalization";
import { loadEngagement, readerFor } from "./retrieval";
import { NO_AFFINITY, RECOMMEND, rankRecommendations, type RankContext } from "./ranking";
import { parseQuery } from "./query";
import {
  NO_BEHAVIOUR,
  NO_ENGAGEMENT,
  type ModelCandidate,
  type PersonCandidate,
  type Scored,
  type ToolCandidate,
} from "./types";

/*
  The empty search state: what to show somebody who has opened search and typed
  nothing.

  THESE ARE NOT RESULTS AND THEY MUST NEVER BE CONFUSED WITH RESULTS. Section 2
  says so and the page says so too: they sit under a heading that names them as
  recommendations, they disappear the moment a query exists, and nothing here
  claims to have matched anything.

  NOTHING IS INVENTED. Every number on these cards is read from a real column or a
  real aggregate. A tool with no rating shows no rating, a tool nobody has opened
  shows no views. D13 and D30 have ruled that out since the landing page, and the
  temptation is strongest exactly here, on a surface whose whole job is to look
  populated.

  With 53 approved tools and no models in the catalogue, the models row is empty
  and simply is not rendered. That is the honest state of the catalogue rather
  than a defect in this file.
*/

const TOOL_COLUMNS =
  "id, slug, name, tagline, description, logo_url, pricing, pricing_model, tags," +
  " features, platforms, rating, rating_count, like_count, verified, created_at," +
  " published_at, tool_categories(categories(name))";

const MODEL_COLUMNS =
  "id, slug, name, provider, description, context_window, input_price_per_m," +
  " output_price_per_m, modalities, tags, website_url, created_at";

/* The zero match signal. A recommendation matched nothing because nothing was
   asked, and saying otherwise would make reasonFor() lie. */
const NO_MATCH = {
  exact: false,
  prefix: false,
  nameSimilarity: 0,
  phrase: false,
  tsRank: 0,
  termHits: 0,
  termTotal: 0,
  sources: ["recommendation"],
};

type CatJoin = { categories: { name: string } | null }[] | null;

function categoriesOf(row: Record<string, unknown>): string[] {
  const joined = row.tool_categories as CatJoin;
  if (!Array.isArray(joined)) return [];
  return joined
    .map((j) => j.categories?.name)
    .filter((n): n is string => typeof n === "string");
}

export type Recommendations = {
  tools: Scored<ToolCandidate>[];
  models: Scored<ModelCandidate>[];
  people: PersonCandidate[];
};

export async function loadRecommendations(options: {
  signedIn: boolean;
  viewerId: string | null;
}): Promise<Recommendations> {
  const db = await readerFor(options.signedIn);

  const [toolRows, modelRows, peopleRows, affinity] = await Promise.all([
    /* A window, then ranking, the same shape as the feed's candidate generator.
       Ordering by created_at here is only how the WINDOW is chosen; what reaches
       the screen is decided by scoreRecommendation. */
    db
      .from("tools")
      .select(TOOL_COLUMNS)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(RECOMMEND.POOL),
    db
      .from("models")
      .select(MODEL_COLUMNS)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(RECOMMEND.POOL),
    db.rpc("suggested_people", { p_limit: RECOMMEND.SHOW_PEOPLE }),
    options.viewerId
      ? loadAffinity(await createClient(), options.viewerId)
      : Promise.resolve(NO_AFFINITY),
  ]);

  if (toolRows.error) {
    console.error("[search] recommended tools failed", toolRows.error.code, toolRows.error.message);
  }
  if (modelRows.error) {
    console.error("[search] recommended models failed", modelRows.error.code, modelRows.error.message);
  }
  if (peopleRows.error) {
    console.error("[search] suggested people failed", peopleRows.error.code, peopleRows.error.message);
  }

  const tools: ToolCandidate[] = ((toolRows.data as Record<string, unknown>[] | null) ?? []).map(
    (r) => ({
      type: "tool",
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name),
      tagline: (r.tagline as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      logoUrl: (r.logo_url as string | null) ?? null,
      pricing: (r.pricing as string | null) ?? null,
      pricingModel: (r.pricing_model as string | null) ?? null,
      tags: (r.tags as string[] | null) ?? [],
      features: (r.features as string[] | null) ?? [],
      platforms: (r.platforms as string[] | null) ?? [],
      categories: categoriesOf(r),
      rating: (r.rating as number | null) ?? null,
      ratingCount: (r.rating_count as number | null) ?? 0,
      likeCount: (r.like_count as number | null) ?? 0,
      verified: r.verified === true,
      createdAt: String(r.created_at),
      publishedAt: (r.published_at as string | null) ?? null,
      match: { ...NO_MATCH, category: false, tag: false, feature: false, platform: false },
      engagement: NO_ENGAGEMENT,
      behaviour: NO_BEHAVIOUR,
    }),
  );

  const models: ModelCandidate[] = ((modelRows.data as Record<string, unknown>[] | null) ?? []).map(
    (r) => ({
      type: "model",
      id: String(r.id),
      slug: String(r.slug),
      name: String(r.name),
      provider: (r.provider as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      contextWindow: (r.context_window as number | null) ?? null,
      inputPrice: (r.input_price_per_m as number | null) ?? null,
      outputPrice: (r.output_price_per_m as number | null) ?? null,
      modalities: (r.modalities as string[] | null) ?? [],
      tags: (r.tags as string[] | null) ?? [],
      websiteUrl: (r.website_url as string | null) ?? null,
      createdAt: String(r.created_at),
      match: { ...NO_MATCH, provider: false, tag: false, modality: false },
      engagement: NO_ENGAGEMENT,
      behaviour: NO_BEHAVIOUR,
    }),
  );

  /* Engagement for both pools, together. Popularity is most of what decides a
     recommendation, so this is not optional here the way it nearly is for an
     exact name match. */
  const [toolEngagement, modelEngagement] = await Promise.all([
    loadEngagement(db, "tool", tools.map((t) => t.id)),
    loadEngagement(db, "model", models.map((m) => m.id)),
  ]);
  for (const t of tools) t.engagement = toolEngagement.get(t.id) ?? t.engagement;
  for (const m of models) m.engagement = modelEngagement.get(m.id) ?? m.engagement;

  const ctx: RankContext = { parsed: parseQuery(""), affinity, now: Date.now() };

  const people: PersonCandidate[] = ((peopleRows.data as Record<string, unknown>[] | null) ?? []).map(
    (r) => ({
      type: "person",
      id: String(r.id),
      username: String(r.username),
      fullName: (r.full_name as string | null) ?? null,
      avatarUrl: (r.avatar_url as string | null) ?? null,
      bio: (r.bio as string | null) ?? null,
      isDeveloper: r.is_developer === true,
      developerVerified: r.developer_verified === true,
      company: null,
      expertise: [],
      skills: [],
      interests: [],
      followerCount: (r.follower_count as number | null) ?? 0,
      createdAt: String(r.created_at),
      match: { ...NO_MATCH, skill: false, expertise: false, company: false },
      behaviour: NO_BEHAVIOUR,
    }),
  );

  return {
    tools: capPerCategory(rankRecommendations(tools, ctx), RECOMMEND.SHOW_TOOLS),
    models: capPerProvider(rankRecommendations(models, ctx), RECOMMEND.SHOW_MODELS),
    people,
  };
}

/*
  One per category, and that is a HARD cap here rather than the run limit the
  result list uses.

  Four rows is not enough room for a run: if two of them are image generators, the
  row has told somebody about two things instead of four. Section 17 asks for
  exactly this and it is why the recommendation list and the result list do not
  share a diversity rule.
*/
function capPerCategory(
  ranked: Scored<ToolCandidate>[],
  limit: number,
): Scored<ToolCandidate>[] {
  const seen = new Set<string>();
  const out: Scored<ToolCandidate>[] = [];

  for (const item of ranked) {
    const key = item.candidate.categories[0]?.toLowerCase() ?? item.candidate.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }

  /* Fewer than the limit because everything shared a category: fill from the
     ranked list rather than showing two rows where four were asked for. */
  if (out.length < limit) {
    for (const item of ranked) {
      if (out.includes(item)) continue;
      out.push(item);
      if (out.length >= limit) break;
    }
  }

  return out;
}

function capPerProvider(
  ranked: Scored<ModelCandidate>[],
  limit: number,
): Scored<ModelCandidate>[] {
  const seen = new Set<string>();
  const out: Scored<ModelCandidate>[] = [];

  for (const item of ranked) {
    const key = item.candidate.provider?.toLowerCase() ?? item.candidate.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }

  if (out.length < limit) {
    for (const item of ranked) {
      if (out.includes(item)) continue;
      out.push(item);
      if (out.length >= limit) break;
    }
  }

  return out;
}

/*
  Related searches, for the zero result page.

  popular_searches applies a minimum of three DISTINCT accounts before a query
  counts, which is a privacy control rather than a quality one: a popular list
  built from a handful of people republishes their queries to everybody. With two
  real accounts it returns nothing, and the page then falls back to the real
  taxonomy, which is the honest alternative to inventing a list.
*/
export async function loadRelatedSearches(db: SupabaseClient): Promise<string[]> {
  const [popular, categories] = await Promise.all([
    db.rpc("popular_searches", { p_limit: 6 }),
    db.from("categories").select("name").order("sort_order").limit(6),
  ]);

  const out: string[] = [];

  if (!popular.error) {
    for (const row of (popular.data as { query: string }[] | null) ?? []) {
      if (row.query) out.push(row.query);
    }
  }

  if (out.length === 0 && !categories.error) {
    for (const row of (categories.data as { name: string }[] | null) ?? []) {
      if (row.name) out.push(row.name);
    }
  }

  return out.slice(0, 6);
}
