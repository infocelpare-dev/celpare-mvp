import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { createAnonClient, createClient } from "@/lib/supabase/server";
import type { FeedPost } from "@/lib/community/queries";
import { isFresh, type StoredPostState } from "@/lib/community/intelligence/lifecycle";
import { contentIsRecommendationEligible, spamRisk } from "@/lib/community/intelligence/safety";
import { topicAdjacency } from "@/lib/community/intelligence/semantic";
import { signalsFor } from "@/lib/community/intelligence/signals";
import type { InterestProfile, NetworkEngagement, PostSignals } from "@/lib/community/intelligence/types";
import {
  getPeopleRecommendations,
  getTrending,
} from "@/lib/community/intelligence/server/engine";
import {
  loadInterestProfile,
  loadNetworkEngagement,
  loadPostSignals,
  loadPostStates,
  retrieveFreshCandidates,
  retrieveNetworkCandidates,
  retrieveTrendingCandidates,
  retrieveVideoCandidates,
  toContentItem,
  type Loaded,
} from "@/lib/community/intelligence/server/data";
import { loadAffinity } from "@/lib/search/personalization";
import { loadEngagement, readerFor } from "@/lib/search/retrieval";
import { MODEL_ROW_COLUMNS, TOOL_ROW_COLUMNS, modelFromRow, personFromRow, toolFromRow } from "@/lib/search/rows";
import type { ModelCandidate, PersonCandidate, ToolCandidate } from "@/lib/search/types";
import { fromCategory, fromModel, fromPerson, fromPost, fromTool, fromTopic, type TopicVelocityInput } from "../normalize";
import type { AffinityInput, ExploreHistoryRow } from "../profile";
import { ENTITY_TYPES, NO_NETWORK, type EntitySignals, type ExploreCandidate, type ExploreEntityType, type ExploreSource, type NetworkProof } from "../types";

/*
  The Explore candidate pool: every read explore_v1 needs, once per request,
  in two waves of parallel reads. No read per candidate.

    wave 1  tools, models, posts (fresh, trending window, videos, network),
            the trending and rising post lists, topics and categories, people,
            and the viewer's profile inputs
    wave 2  keyed by the ids wave 1 returned: search engagement, Explore
            momentum, post signals, stored post state, post features, model
            evaluations, topic velocity, category sizes, network proof

  THE SAME THREE CLIENTS COMMUNITY INTELLIGENCE USES, FOR THE SAME REASONS.
  Entities are read with the viewer's own client (readerFor), so RLS decides
  what may be ranked. The viewer's history comes from functions that answer for
  auth.uid() only. Aggregates no client may read (post signals, post state,
  post features, topic velocity, Explore momentum) come through the service role
  and only for ids the viewer's own client already returned (D125, D152).

  A FAILED ARM SHORTENS THE POOL, IT DOES NOT EMPTY THE PAGE. Each arm settles
  on its own; `failed` records which entity types could not be read, so their
  sections report an error rather than claiming the platform is empty (D109).
*/

export type PoolRequest = {
  signedIn: boolean;
  viewerId: string | null;
  now: number;
};

export type ExplorePool = {
  candidates: ExploreCandidate[];
  tools: Map<string, ToolCandidate>;
  models: Map<string, ModelCandidate>;
  posts: Map<string, FeedPost>;
  people: Map<string, PersonCandidate>;
  topics: Map<string, { id: string; slug: string; name: string; description: string | null }>;
  categories: Map<string, { slug: string; name: string; description: string | null; tools: number }>;
  topicPostCounts: Map<string, number>;
  topicAdjacency: Map<string, Map<string, number>>;
  failed: Set<ExploreEntityType>;
  /* Profile inputs. */
  community: InterestProfile | null;
  affinity: AffinityInput | null;
  history: ExploreHistoryRow[];
  owned: string[];
  timings: Record<string, number>;
};

type Result<T> = { ok: true; value: T } | { ok: false };

async function attempt<T>(label: string, p: PromiseLike<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await p };
  } catch (err) {
    console.error(`[explore] ${label} failed`, err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

type Rows = Record<string, unknown>[];

async function rows(label: string, q: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<Rows> {
  const { data, error } = await q;
  if (error) throw new Error(`${label}: ${error.code ?? ""} ${error.message}`);
  return (data as Rows | null) ?? [];
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/* The admin client, or null when the service role is not configured: every
   service role arm then contributes nothing and ranking runs on public data. */
function admin(): SupabaseClient | null {
  return hasServiceRole() ? createAdminClient() : null;
}

async function entitySignals(type: "tool" | "model", ids: string[]): Promise<Map<string, EntitySignals>> {
  const out = new Map<string, EntitySignals>();
  const db = admin();
  if (!db || ids.length === 0) return out;
  for (const r of await rows(`${type} signals`, db.rpc("explore_entity_signals", { p_type: type, p_ids: ids }))) {
    out.set(String(r.entity_id), {
      views24h: n(r.views_24h),
      views7d: n(r.views_7d),
      viewsPrev7d: n(r.views_prev7d),
      viewers7d: n(r.viewers_7d),
      viewersPrev7d: n(r.viewers_prev7d),
      saves7d: n(r.saves_7d),
      savesPrev7d: n(r.saves_prev7d),
      reviews7d: n(r.reviews_7d),
      compareAdds7d: n(r.compare_adds_7d),
      postMentions7d: n(r.post_mentions_7d),
      exploreImpressions30d: n(r.explore_impressions_30d),
      exploreClicks30d: n(r.explore_clicks_30d),
    });
  }
  return out;
}

async function entityNetwork(db: SupabaseClient, viewerId: string | null, type: "tool" | "model", ids: string[]): Promise<Map<string, NetworkProof>> {
  const out = new Map<string, NetworkProof>();
  if (!viewerId || ids.length === 0) return out;
  for (const r of await rows(`${type} network`, db.rpc("my_explore_network", { p_type: type, p_ids: ids.slice(0, 200) }))) {
    const proof = { ...NO_NETWORK, savers: n(r.savers), reviewers: n(r.reviewers), posters: n(r.posters) };
    if (proof.savers + proof.reviewers + proof.posters > 0) out.set(String(r.entity_id), proof);
  }
  return out;
}

type Feature = { spam: number; duplicateOf: string | null; nearDuplicateOf: string | null };

async function postFeatures(ids: string[]): Promise<Map<string, Feature>> {
  const out = new Map<string, Feature>();
  const db = admin();
  if (!db || ids.length === 0) return out;
  for (const r of await rows(
    "post features",
    db.from("post_features").select("post_id, spam_risk, duplicate_of, near_duplicate_of").in("post_id", ids.slice(0, 500)),
  )) {
    out.set(String(r.post_id), {
      spam: n(r.spam_risk),
      duplicateOf: (r.duplicate_of as string | null) ?? null,
      nearDuplicateOf: (r.near_duplicate_of as string | null) ?? null,
    });
  }
  return out;
}

async function topicVelocity(): Promise<Map<string, TopicVelocityInput>> {
  const out = new Map<string, TopicVelocityInput>();
  const db = admin();
  if (!db) return out;
  for (const r of await rows("topic velocity", db.from("topic_velocity").select("topic_id, window, units, participants, velocity"))) {
    const id = String(r.topic_id);
    const v = out.get(id) ?? { units24h: 0, units7d: 0, participants24h: 0, participants7d: 0, velocity: 0 };
    if (r.window === "24h") {
      v.units24h = n(r.units);
      v.participants24h = n(r.participants);
      v.velocity = n(r.velocity);
    }
    if (r.window === "7d") {
      v.units7d = n(r.units);
      v.participants7d = n(r.participants);
    }
    out.set(id, v);
  }
  return out;
}

async function history(db: SupabaseClient): Promise<ExploreHistoryRow[]> {
  const out: ExploreHistoryRow[] = [];
  for (const r of await rows("explore history", db.rpc("my_explore_history", { p_days: 30 }))) {
    const type = String(r.entity_type) as ExploreEntityType;
    if (!ENTITY_TYPES.includes(type)) continue;
    out.push({
      entityType: type,
      entityId: (r.entity_id as string | null) ?? null,
      entityKey: (r.entity_key as string | null) ?? null,
      event: String(r.event),
      section: (r.section as string | null) ?? null,
      at: Date.parse(String(r.at)),
    });
  }
  return out;
}

/* What the viewer owns: saved tools and models (own rows only policies) and
   the people they follow. */
async function owned(db: SupabaseClient, viewerId: string): Promise<{ keys: string[]; following: string[] }> {
  const [tools, models, follows] = await Promise.all([
    rows("saved tools", db.from("user_saved_tools").select("tool_id").eq("user_id", viewerId).limit(500)),
    rows("saved models", db.from("user_saved_models").select("model_id").eq("user_id", viewerId).limit(500)),
    rows("follows", db.from("follows").select("following_id").eq("follower_id", viewerId).limit(1000)),
  ]);
  const following = follows.map((r) => String(r.following_id));
  return {
    keys: [
      ...tools.map((r) => `tool:${r.tool_id}`),
      ...models.map((r) => `model:${r.model_id}`),
      ...following.map((id) => `person:${id}`),
    ],
    following,
  };
}

export async function loadExplorePool(req: PoolRequest): Promise<ExplorePool> {
  const timings: Record<string, number> = {};
  const t0 = Date.now();
  const { signedIn, viewerId, now } = req;
  const db = await readerFor(signedIn);
  const anon = createAnonClient();
  const own = viewerId ? await createClient() : null;
  const loaded: Loaded = { items: [], posts: new Map() };
  const failed = new Set<ExploreEntityType>();

  /* ------------------------------------------------------------- wave 1 */
  const [
    toolRows,
    modelRows,
    fresh,
    trendWindow,
    videos,
    network,
    trendingList,
    risingList,
    topicRows,
    categoryRows,
    suggested,
    peopleV1,
    community,
    affinity,
    hist,
    mine,
  ] = await Promise.all([
    attempt(
      "tools",
      rows(
        "tools",
        db
          .from("tools")
          .select(`${TOOL_ROW_COLUMNS}, canonical_domain, developer_id`)
          .eq("status", "approved")
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(150),
      ),
    ),
    attempt(
      "models",
      rows(
        "models",
        db.from("models").select(`${MODEL_ROW_COLUMNS}, family, open_weights, lifecycle, developer_id`).eq("status", "approved").limit(200),
      ),
    ),
    attempt("fresh posts", retrieveFreshCandidates(db, loaded, 120)),
    attempt("trending window", retrieveTrendingCandidates(db, loaded, now, 80)),
    attempt("videos", retrieveVideoCandidates(db, loaded, now, 60)),
    attempt("network posts", retrieveNetworkCandidates(db, loaded, viewerId)),
    attempt("trending list", getTrending(anon, "posts", now)),
    attempt("rising list", getTrending(anon, "rising", now)),
    attempt("topics", rows("topics", db.from("topics").select("id, slug, name, description, created_at").order("sort_order"))),
    attempt("categories", rows("categories", db.from("categories").select("id, slug, name, description").order("sort_order"))),
    attempt("suggested people", rows("suggested people", db.rpc("suggested_people", { p_limit: 20 }))),
    own && viewerId ? attempt("people_v1", getPeopleRecommendations(own, viewerId, now, 20)) : Promise.resolve(null),
    own && viewerId ? attempt("interests", loadInterestProfile(own, viewerId, now)) : Promise.resolve(null),
    own && viewerId ? attempt("affinity", loadAffinity(own, viewerId)) : Promise.resolve(null),
    own ? attempt("history", history(own)) : Promise.resolve(null),
    own && viewerId ? attempt("owned", owned(own, viewerId)) : Promise.resolve(null),
  ]);
  timings.wave1 = Date.now() - t0;

  /* The viewer's profile inputs. The community profile's follows are topped up
     from the follows table, the same thing getPeopleRecommendations does. */
  const communityProfile: InterestProfile | null = community && community.ok ? (community.value?.profile ?? null) : null;
  if (communityProfile && mine && mine.ok) for (const id of mine.value.following) communityProfile.followedAuthors.add(id);
  const affinityInput: AffinityInput | null =
    affinity && affinity.ok ? { categories: affinity.value.categories, tags: affinity.value.tags, recent: affinity.value.recent } : null;

  if (!toolRows.ok) failed.add("tool");
  if (!modelRows.ok) failed.add("model");
  if (!fresh.ok && !trendWindow.ok) failed.add("post");
  if (!videos.ok) failed.add("video");
  if (!topicRows.ok) failed.add("topic");
  if (!categoryRows.ok) failed.add("category");
  if (!suggested.ok) failed.add("person");

  /* The trending and rising post lists, by position. Their posts join the pool. */
  const trendRank = new Map<string, number>();
  const risingRank = new Map<string, number>();
  for (const [list, into] of [
    [trendingList, trendRank],
    [risingList, risingRank],
  ] as const) {
    if (!list.ok || !("posts" in list.value)) continue;
    list.value.posts.forEach((p, i) => {
      into.set(p.id, i);
      if (!loaded.posts.has(p.id)) loaded.posts.set(p.id, p);
    });
  }

  const tools = new Map<string, ToolCandidate>();
  const toolExtra = new Map<string, { developerId: string | null; canonicalDomain: string | null }>();
  for (const r of toolRows.ok ? toolRows.value : []) {
    const t = toolFromRow(r, "explore");
    tools.set(t.id, t);
    toolExtra.set(t.id, { developerId: (r.developer_id as string | null) ?? null, canonicalDomain: (r.canonical_domain as string | null) ?? null });
  }
  const models = new Map<string, ModelCandidate>();
  const modelExtra = new Map<string, { developerId: string | null; family: string | null; openWeights: boolean | null; lifecycle: string | null }>();
  for (const r of modelRows.ok ? modelRows.value : []) {
    const m = modelFromRow(r, "explore");
    models.set(m.id, m);
    modelExtra.set(m.id, {
      developerId: (r.developer_id as string | null) ?? null,
      family: (r.family as string | null) ?? null,
      openWeights: (r.open_weights as boolean | null) ?? null,
      lifecycle: (r.lifecycle as string | null) ?? null,
    });
  }

  /* Posts people the viewer follows engaged with: the network source. */
  const networkIds = new Set(network.ok ? network.value.map((i) => i.id) : []);

  const postIds = [...loaded.posts.keys()];
  const toolIds = [...tools.keys()];
  const modelIds = [...models.keys()];
  const topicList = (topicRows.ok ? topicRows.value : []).map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    description: (r.description as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
  }));

  /* ------------------------------------------------------------- wave 2 */
  const t1 = Date.now();
  const [
    toolEngagement,
    modelEngagement,
    toolSignals,
    modelSignals,
    postSignals,
    postStates,
    features,
    evaluations,
    velocity,
    categoryTools,
    toolNetwork,
    modelNetwork,
    postNetwork,
    topicCounts,
  ] = await Promise.all([
    attempt("tool engagement", loadEngagement(db, "tool", toolIds)),
    attempt("model engagement", loadEngagement(db, "model", modelIds)),
    attempt("tool signals", entitySignals("tool", toolIds)),
    attempt("model signals", entitySignals("model", modelIds)),
    attempt("post signals", loadPostSignals(postIds)),
    attempt("post states", loadPostStates(postIds)),
    attempt("post features", postFeatures(postIds)),
    attempt(
      "evaluations",
      modelIds.length ? rows("evaluations", db.from("model_evaluations").select("model_id, verified_at").in("model_id", modelIds)) : Promise.resolve([]),
    ),
    attempt("topic velocity", topicVelocity()),
    attempt("category sizes", rows("category sizes", db.from("tool_categories").select("category_id").limit(5000))),
    own ? attempt("tool network", entityNetwork(own, viewerId, "tool", toolIds)) : Promise.resolve(null),
    own ? attempt("model network", entityNetwork(own, viewerId, "model", modelIds)) : Promise.resolve(null),
    own ? attempt("post network", loadNetworkEngagement(own, viewerId, postIds)) : Promise.resolve(null),
    attempt("topic counts", topicPostCounts(db, topicList.map((t) => t.id))),
  ]);
  timings.wave2 = Date.now() - t1;

  const val = <T,>(r: Result<T> | null, fallback: T): T => (r && r.ok ? r.value : fallback);
  const tEng = val(toolEngagement, new Map());
  const mEng = val(modelEngagement, new Map());
  for (const [id, t] of tools) t.engagement = tEng.get(id) ?? t.engagement;
  for (const [id, m] of models) m.engagement = mEng.get(id) ?? m.engagement;

  const tSig = val(toolSignals, new Map<string, EntitySignals>());
  const mSig = val(modelSignals, new Map<string, EntitySignals>());
  const pSig = val(postSignals, new Map<string, PostSignals>() as Map<string, PostSignals> | null) ?? new Map<string, PostSignals>();
  const states = val(postStates, new Map<string, StoredPostState>());
  const feat = val(features, new Map<string, Feature>());
  const tNet = val(toolNetwork, new Map<string, NetworkProof>());
  const mNet = val(modelNetwork, new Map<string, NetworkProof>());
  const pNet = val(postNetwork, new Map<string, NetworkEngagement>());
  const vel = val(velocity, new Map<string, TopicVelocityInput>());
  const counts = val(topicCounts, new Map<string, number>());

  const evalCount = new Map<string, { all: number; verified: number }>();
  for (const r of val(evaluations, [] as Rows)) {
    const id = String(r.model_id);
    const e = evalCount.get(id) ?? { all: 0, verified: 0 };
    e.all += 1;
    if (r.verified_at) e.verified += 1;
    evalCount.set(id, e);
  }

  const catSize = new Map<string, number>();
  for (const r of val(categoryTools, [] as Rows)) {
    const id = String(r.category_id);
    catSize.set(id, (catSize.get(id) ?? 0) + 1);
  }


  /* ------------------------------------------------------ candidates */
  const candidates: ExploreCandidate[] = [];
  const src = (...s: ExploreSource[]) => s;

  for (const [id, t] of tools) {
    const x = toolExtra.get(id)!;
    candidates.push(fromTool(t, { ...x, signals: tSig.get(id), network: tNet.get(id) }));
  }
  for (const [id, m] of models) {
    const x = modelExtra.get(id)!;
    const e = evalCount.get(id);
    candidates.push(
      fromModel(m, { ...x, evaluations: e?.all ?? 0, verifiedEvaluations: e?.verified ?? 0, signals: mSig.get(id), network: mNet.get(id) }),
    );
  }

  /* Posts: Community Intelligence decides eligibility with the viewer's own
     community profile, the same call the feed makes. */
  const profileForSafety = communityProfile;
  const byAuthor = new Map<string, number>();
  const authorTopics = new Map<string, Set<string>>();
  for (const [id, post] of loaded.posts) {
    const item = toContentItem(post);
    const s = signalsFor(pSig, id);
    const f = feat.get(id);
    const spam = f ? f.spam : spamRisk(item);
    const e = contentIsRecommendationEligible(item, s, profileForSafety, { spam });
    const st = states.get(id);
    const net = pNet.get(id);
    const isVideo = post.media.some((m) => m.media_kind === "video");
    candidates.push(
      fromPost(item, s, {
        isVideo,
        eligible: e.eligible,
        ineligibleReason: e.eligible ? null : e.reason,
        stage: st && isFresh(st, now) ? st.stage : null,
        perfScore: st?.perfScore ?? null,
        spam,
        duplicateOf: f?.duplicateOf ?? null,
        nearDuplicateOf: f?.nearDuplicateOf ?? null,
        trendRank: trendRank.get(id) ?? null,
        risingRank: risingRank.get(id) ?? null,
        network: net ? { ...NO_NETWORK, likers: net.likers, commenters: net.commenters, reposters: net.reposters } : undefined,
        sources: src(
          ...(trendRank.has(id) ? (["trending"] as const) : []),
          ...(risingRank.has(id) ? (["rising"] as const) : []),
          ...(networkIds.has(id) ? (["network"] as const) : []),
        ),
      }),
    );
    byAuthor.set(post.author_id, (byAuthor.get(post.author_id) ?? 0) + 1);
    if (post.topic_id) {
      const set = authorTopics.get(post.author_id) ?? new Set<string>();
      set.add(post.topic_id);
      authorTopics.set(post.author_id, set);
    }
  }

  /* People: the public suggestion list, with people_v1's relationship scores
     where the viewer is signed in. Follower count is never a ranking input. */
  const people = new Map<string, PersonCandidate>();
  for (const r of suggested.ok ? suggested.value : []) people.set(String(r.id), personFromRow(r, "explore"));
  const v1 = peopleV1 && peopleV1.ok ? peopleV1.value.people : [];
  const v1Max = Math.max(0, ...v1.map((p) => p.score));
  const v1Score = new Map(v1.map((p) => [p.id, v1Max > 0 ? p.score / v1Max : 0]));
  const missing = v1.map((p) => p.id).filter((id) => !people.has(id));
  if (missing.length && own) {
    const extra = await attempt(
      "people rows",
      rows(
        "people rows",
        own
          .from("profiles")
          .select("id, username, full_name, avatar_url, bio, is_developer, follower_count, created_at, account_status")
          .in("id", missing.slice(0, 50))
          .eq("account_status", "active"),
      ),
    );
    for (const r of extra.ok ? extra.value : []) if (r.username) people.set(String(r.id), personFromRow(r, "explore"));
  }
  const following = mine && mine.ok ? new Set(mine.value.following) : new Set<string>();
  for (const [id, p] of people) {
    candidates.push(
      fromPerson(p, {
        viewerFollows: following.has(id),
        peopleScore: v1Score.get(id) ?? 0,
        topicIds: [...(authorTopics.get(id) ?? [])],
        recentPosts: byAuthor.get(id) ?? 0,
        followsViewer: communityProfile?.followers.has(id) ?? false,
        sources: v1Score.has(id) ? ["personalized"] : [],
      }),
    );
  }

  const topics = new Map<string, { id: string; slug: string; name: string; description: string | null }>();
  for (const t of topicList) {
    topics.set(t.id, t);
    candidates.push(fromTopic(t, { postCount: counts.get(t.id) ?? 0, velocity: vel.get(t.id) ?? null }));
  }
  const categories = new Map<string, { slug: string; name: string; description: string | null; tools: number }>();
  for (const r of categoryRows.ok ? categoryRows.value : []) {
    const c = { slug: String(r.slug), name: String(r.name), description: (r.description as string | null) ?? null, tools: catSize.get(String(r.id)) ?? 0 };
    categories.set(c.slug, c);
    candidates.push(fromCategory(c, { toolCount: c.tools }));
  }

  timings.pool = Date.now() - t0;

  return {
    candidates,
    tools,
    models,
    posts: loaded.posts,
    people,
    topics,
    categories,
    topicPostCounts: counts,
    topicAdjacency: topicAdjacency(
      [...loaded.posts.values()].map((p) => ({ topicId: p.topic_id, body: p.body ?? "" })),
    ),
    failed,
    community: communityProfile,
    affinity: affinityInput,
    history: hist && hist.ok ? hist.value : [],
    owned: mine && mine.ok ? mine.value.keys : [],
    timings,
  };
}

/* One head count per topic, the query loadTopics already ran. */
async function topicPostCounts(db: SupabaseClient, topicIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const results = await Promise.all(
    topicIds.map((id) =>
      db.from("posts").select("id", { count: "exact", head: true }).eq("topic_id", id).eq("status", "visible").is("deleted_at", null),
    ),
  );
  topicIds.forEach((id, i) => {
    const r = results[i];
    if (r && !r.error) out.set(id, r.count ?? 0);
  });
  return out;
}
