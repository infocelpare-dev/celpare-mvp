import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAnonClient, createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  NO_BEHAVIOUR,
  NO_ENGAGEMENT,
  type Behaviour,
  type Engagement,
  type EntityType,
  type ModelCandidate,
  type PersonCandidate,
  type PostCandidate,
  type ToolCandidate,
} from "./types";
import { WEIGHTS } from "./ranking";

/*
  Retrieval: candidates out of the database, nothing ranked, nothing decided.

  EVERY ARM RUNS IN PARALLEL. Four entity types, then one engagement pass and one
  behaviour pass per type, all issued together. Sequential would make a search as
  slow as the sum of its parts for no reason: none of these reads depends on
  another's answer.

  WHO READS AS WHOM, AND WHY IT MATTERS. A signed out visitor reads through the
  anon client, which is the path a crawler takes, so what is verified is the
  policy anon actually gets. That is the same decision readerFor() made for the
  feed and it is repeated here rather than imported, because search also has to
  read the CALLER's own affinity, and mixing those two clients up is how a search
  ends up personalised with somebody else's history.

  The candidate functions themselves carry their own status filters, so a draft
  tool, an unapproved model, a hidden post or a suspended account cannot arrive
  here even when the policy underneath would have allowed it.
*/

export async function readerFor(signedIn: boolean): Promise<SupabaseClient> {
  return signedIn ? await createClient() : createAnonClient();
}

/* PostgREST hands back snake_case. One mapper per entity, in one place, so a
   column rename breaks here rather than in six components. */

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nstr = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const nnum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const bool = (v: unknown): boolean => v === true;
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function matchOf(r: Row) {
  return {
    exact: bool(r.m_exact),
    prefix: bool(r.m_prefix),
    nameSimilarity: num(r.m_name_sim),
    phrase: bool(r.m_phrase),
    tsRank: num(r.m_ts),
    termHits: num(r.m_terms),
    termTotal: num(r.m_total_terms),
    sources: arr(r.sources),
  };
}

function toTool(r: Row): ToolCandidate {
  return {
    type: "tool",
    id: str(r.id),
    slug: str(r.slug),
    name: str(r.name),
    tagline: nstr(r.tagline),
    description: nstr(r.description),
    logoUrl: nstr(r.logo_url),
    pricing: nstr(r.pricing),
    pricingModel: nstr(r.pricing_model),
    tags: arr(r.tags),
    features: arr(r.features),
    platforms: arr(r.platforms),
    categories: arr(r.categories),
    rating: nnum(r.rating),
    ratingCount: num(r.rating_count),
    likeCount: num(r.like_count),
    verified: bool(r.verified),
    createdAt: str(r.created_at),
    publishedAt: nstr(r.published_at),
    match: {
      ...matchOf(r),
      category: bool(r.m_category),
      tag: bool(r.m_tag),
      feature: bool(r.m_feature),
      platform: bool(r.m_platform),
    },
    engagement: NO_ENGAGEMENT,
    behaviour: NO_BEHAVIOUR,
  };
}

function toModel(r: Row): ModelCandidate {
  return {
    type: "model",
    id: str(r.id),
    slug: str(r.slug),
    name: str(r.name),
    provider: nstr(r.provider),
    description: nstr(r.description),
    contextWindow: nnum(r.context_window),
    inputPrice: nnum(r.input_price_per_m),
    outputPrice: nnum(r.output_price_per_m),
    modalities: arr(r.modalities),
    tags: arr(r.tags),
    websiteUrl: nstr(r.website_url),
    createdAt: str(r.created_at),
    match: {
      ...matchOf(r),
      provider: bool(r.m_provider),
      tag: bool(r.m_tag),
      modality: bool(r.m_modality),
    },
    engagement: NO_ENGAGEMENT,
    behaviour: NO_BEHAVIOUR,
  };
}

function toPerson(r: Row): PersonCandidate {
  return {
    type: "person",
    id: str(r.id),
    username: str(r.username),
    fullName: nstr(r.full_name),
    avatarUrl: nstr(r.avatar_url),
    bio: nstr(r.bio),
    isDeveloper: bool(r.is_developer),
    developerVerified: bool(r.developer_verified),
    company: nstr(r.company),
    expertise: arr(r.expertise),
    skills: arr(r.skills),
    interests: arr(r.interests),
    followerCount: num(r.follower_count),
    createdAt: str(r.created_at),
    match: {
      ...matchOf(r),
      skill: bool(r.m_skill),
      expertise: bool(r.m_expertise),
      company: bool(r.m_company),
    },
    behaviour: NO_BEHAVIOUR,
  };
}

function toPost(r: Row): PostCandidate {
  return {
    type: "post",
    id: str(r.id),
    authorId: str(r.author_id),
    createdAt: str(r.created_at),
    likeCount: num(r.like_count),
    commentCount: num(r.comment_count),
    saveCount: num(r.save_count),
    match: matchOf(r),
    behaviour: NO_BEHAVIOUR,
  };
}

/*
  One helper for every RPC call, because the failure behaviour must be identical
  across all of them: log the code and the message, return nothing, never throw.
  A search that loses its models arm should still show its tools, and an arm that
  throws would take the whole page to the error boundary instead.

  IT REPORTS WHETHER IT FAILED, AND THAT IS NOT BOOKKEEPING. An arm that returns
  nothing because nothing matched and an arm that returns nothing because the
  database was unreachable look identical from the outside, and the page draws a
  very different conclusion from each: "No results for X" is a statement about the
  catalogue. Saying it during an outage is a false negative dressed as an answer.

  This is not hypothetical. Every arm here, plus the telemetry write, plus an
  unrelated settings read, failed together with "TypeError: fetch failed" during
  development, and the page answered 200 with the zero result state. The counting
  below is what lets runSearch tell the two apart.
*/
type RpcResult = { rows: Row[]; ok: boolean };

async function rpc(
  db: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  try {
    const { data, error } = await db.rpc(fn, args);
    if (error) {
      console.error(`[search] ${fn} failed`, error.code, error.message);
      return { rows: [], ok: false };
    }
    return { rows: (data as Row[] | null) ?? [], ok: true };
  } catch (err) {
    /* A transport failure throws rather than returning an error, so without this
       the whole render dies instead of degrading. */
    console.error(`[search] ${fn} threw`, err);
    return { rows: [], ok: false };
  }
}

export async function retrieveTools(
  db: SupabaseClient,
  q: string,
): Promise<Arm<ToolCandidate>> {
  const { rows, ok } = await rpc(db, "search_tools_candidates", {
    p_q: q,
    p_limit: WEIGHTS.TOOL_POOL,
  });
  return { items: rows.map(toTool), ok };
}

export async function retrieveModels(
  db: SupabaseClient,
  q: string,
): Promise<Arm<ModelCandidate>> {
  const { rows, ok } = await rpc(db, "search_models_candidates", {
    p_q: q,
    p_limit: WEIGHTS.MODEL_POOL,
  });
  return { items: rows.map(toModel), ok };
}

export async function retrievePeople(
  db: SupabaseClient,
  q: string,
): Promise<Arm<PersonCandidate>> {
  const { rows, ok } = await rpc(db, "search_people_candidates", {
    p_q: q,
    p_limit: WEIGHTS.PEOPLE_POOL,
  });
  return { items: rows.map(toPerson), ok };
}

export async function retrievePosts(
  db: SupabaseClient,
  q: string,
): Promise<Arm<PostCandidate>> {
  const { rows, ok } = await rpc(db, "search_posts_candidates", {
    p_q: q,
    p_limit: WEIGHTS.POST_POOL,
  });
  return { items: rows.map(toPost), ok };
}

/*
  The engagement pass.

  A second call rather than a join inside the candidate function, because the
  counts come from tables no client role may read: tool_view_events and
  user_saved_tools are closed, and D88 settled they stay closed. search_engagement
  is the SECURITY DEFINER aggregate that answers over them, and keeping it
  separate is what lets the candidate functions stay SECURITY INVOKER with real
  RLS underneath instead of one definer function doing everything.
*/
export async function loadEngagement(
  db: SupabaseClient,
  type: "tool" | "model",
  ids: string[],
): Promise<Map<string, Engagement>> {
  const out = new Map<string, Engagement>();
  if (ids.length === 0) return out;

  const { rows } = await rpc(db, "search_engagement", { p_type: type, p_ids: ids });
  for (const r of rows) {
    out.set(str(r.entity_id), {
      views30d: num(r.views_30d),
      viewsTotal: num(r.views_total),
      saves: num(r.saves),
      reviews: num(r.reviews),
      mentions: num(r.mentions),
    });
  }
  return out;
}

export async function loadBehaviour(
  db: SupabaseClient,
  normalized: string,
  type: EntityType,
  ids: string[],
): Promise<Map<string, Behaviour>> {
  const out = new Map<string, Behaviour>();
  if (ids.length === 0 || !normalized) return out;

  const { rows } = await rpc(db, "search_behaviour", {
    p_normalized: normalized,
    p_type: type,
    p_ids: ids,
  });
  for (const r of rows) {
    out.set(str(r.entity_id), {
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      strong: num(r.strong),
      avgPosition: num(r.avg_position),
    });
  }
  return out;
}

/* One retrieval arm: what it found, and whether it ran at all. */
type Arm<T> = { items: T[]; ok: boolean };

/* Everything retrieval knows how to fetch, in one shot. */
export type RawCandidates = {
  tools: ToolCandidate[];
  models: ModelCandidate[];
  people: PersonCandidate[];
  posts: PostCandidate[];
  /* False when EVERY arm failed. An empty result is then a failure to ask rather
     than an answer, and runSearch raises instead of reporting nothing found. */
  ok: boolean;
};

export async function retrieveAll(
  db: SupabaseClient,
  q: string,
): Promise<RawCandidates> {
  if (!isSupabaseConfigured() || !q.trim()) {
    /* Not configured is a different thing from not working: there is nothing to
       ask, so an empty result is the honest answer and not an error. */
    return { tools: [], models: [], people: [], posts: [], ok: true };
  }

  const [tools, models, people, posts] = await Promise.all([
    retrieveTools(db, q),
    retrieveModels(db, q),
    retrievePeople(db, q),
    retrievePosts(db, q),
  ]);

  return {
    tools: tools.items,
    models: models.items,
    people: people.items,
    posts: posts.items,
    /* ANY arm answering is enough. One failing arm degrades the page, which is
       the trade this file has always made; all four failing means the database
       was not reachable. */
    ok: tools.ok || models.ok || people.ok || posts.ok,
  };
}
