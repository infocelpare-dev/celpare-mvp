/*
  Plain table rows to candidates.

  These mappings used to live inline inside loadRecommendations, and Explore
  needed exactly the same three: a tool, a model and a person read straight off
  their tables rather than out of a search RPC. Copying them would have produced
  a second description of what a tool is, and the two would have drifted the
  first time a column was added. So they moved here and recommendations.ts
  imports them, which means there is one mapping rather than two.

  THE DIFFERENCE FROM lib/search/retrieval.ts IS THE SOURCE, NOT THE SHAPE. The
  mappers there read the rows a search_*_candidates RPC returns, which carry
  match signals because something was searched for. These read ordinary table
  rows, where nothing was searched for, so the match signals are the explicit
  zero below and not an invented number.
*/

import {
  NO_BEHAVIOUR,
  NO_ENGAGEMENT,
  type ModelCandidate,
  type PersonCandidate,
  type ToolCandidate,
} from "./types";

/* Matches the client SELECT grant. Do not add a column here without adding it
   to the grant first: `select t.*` needs SELECT on every column, which is what
   took Ask Celpare's catalogue down in an earlier phase. */
export const TOOL_ROW_COLUMNS =
  "id, slug, name, tagline, description, logo_url, pricing, pricing_model, tags," +
  " features, platforms, rating, rating_count, like_count, verified, created_at," +
  " published_at, tool_categories(categories(name))";

export const MODEL_ROW_COLUMNS =
  "id, slug, name, provider, description, context_window, input_price_per_m," +
  " output_price_per_m, modalities, tags, website_url, created_at";

/*
  The zero match signal.

  Nothing here matched anything, because nothing was asked. Saying otherwise
  would make reasonFor() and every "why this is here" label downstream state
  something that never happened.
*/
export const NO_MATCH = {
  exact: false,
  prefix: false,
  nameSimilarity: 0,
  phrase: false,
  tsRank: 0,
  termHits: 0,
  termTotal: 0,
  sources: ["row"],
};

type Row = Record<string, unknown>;
type CatJoin = { categories: { name: string } | null }[] | null;

export function categoriesOf(row: Row): string[] {
  const joined = row.tool_categories as CatJoin;
  if (!Array.isArray(joined)) return [];
  return joined
    .map((j) => j.categories?.name)
    .filter((n): n is string => typeof n === "string");
}

export function toolFromRow(r: Row, source = "row"): ToolCandidate {
  return {
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
    match: {
      ...NO_MATCH,
      sources: [source],
      category: false,
      tag: false,
      feature: false,
      platform: false,
    },
    engagement: NO_ENGAGEMENT,
    behaviour: NO_BEHAVIOUR,
  };
}

export function modelFromRow(r: Row, source = "row"): ModelCandidate {
  return {
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
    match: { ...NO_MATCH, sources: [source], provider: false, tag: false, modality: false },
    engagement: NO_ENGAGEMENT,
    behaviour: NO_BEHAVIOUR,
  };
}

/*
  A person.

  company, expertise, skills and interests are empty rather than read, and that
  is the same choice suggested_people already makes: those four are on the
  profile and are not in this projection, so they are absent rather than
  guessed at. A card renders nothing where they would go.
*/
export function personFromRow(r: Row, source = "row"): PersonCandidate {
  return {
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
    match: { ...NO_MATCH, sources: [source], skill: false, expertise: false, company: false },
    behaviour: NO_BEHAVIOUR,
  };
}
