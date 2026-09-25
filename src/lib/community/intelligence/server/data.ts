import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { POST_SELECT, normalisePost, type FeedPost } from "@/lib/community/queries";
import { buildInterestProfile, topKeys } from "../interests";
import { parseSignalRows, type SignalRow } from "../signals";
import { tokenize } from "../text";
import type {
  ContentItem,
  InterestAction,
  InterestProfile,
  InterestSignal,
  NetworkEngagement,
  PostSignals,
} from "../types";
import type { SeedTokens } from "../features";
import type { SessionEvent } from "../interests";

/*
  The server half of Community Intelligence: every database read the algorithms
  need, turned into the plain shapes the pure modules take.

  THREE CLIENTS, EACH FOR ONE REASON.

  1. Candidates are read with the VIEWER'S OWN client (readerFor), so RLS decides
     what may be ranked at all. A private account's post, a hidden or removed
     post, a deleted post: none of them can enter a candidate list, because the
     query that builds the list cannot see them. Ranking never widens access.

  2. The person's interest history is read through my_feed_interests(), a
     SECURITY DEFINER function that answers for auth.uid() and takes no id, so
     nobody's profile can be built by anybody else. Same pattern as
     my_search_affinity.

  3. Engagement aggregates (views, skips, not interested, reports, bucketed by
     time) come from feed_post_signals() through the SERVICE ROLE. They are
     private analytics, so EXECUTE is granted to service_role only and no
     browser can call it. It returns counts and never an identity, and it is
     only ever called with ids the viewer's own client already returned. That is
     the narrow widening of lib/supabase/admin.ts recorded as D125.
*/

export type Loaded = {
  items: ContentItem[];
  posts: Map<string, FeedPost>;
};

/* A FeedPost as the algorithms see it. */
export function toContentItem(p: FeedPost): ContentItem {
  const media = p.media.some((m) => m.media_kind === "video")
    ? "video"
    : p.media.some((m) => m.media_kind === "image")
      ? "image"
      : "text";
  return {
    id: p.id,
    authorId: p.author_id,
    body: p.body ?? "",
    createdAt: Date.parse(p.created_at),
    topicId: p.topic_id,
    kind: p.kind,
    toolId: p.tool_id,
    modelId: p.model_id,
    linkUrl: p.link_url,
    media,
    counts: {
      likes: p.like_count,
      comments: p.comment_count,
      saves: p.save_count,
      reposts: p.repost_count,
    },
  };
}

function load(rows: FeedPost[] | null, into: Loaded): ContentItem[] {
  const out: ContentItem[] = [];
  for (const raw of rows ?? []) {
    const post = normalisePost(raw);
    if (!into.posts.has(post.id)) into.posts.set(post.id, post);
    out.push(toContentItem(post));
  }
  return out;
}

function base(db: SupabaseClient) {
  return db.from("posts").select(POST_SELECT).eq("status", "visible").is("deleted_at", null);
}

function isoAgo(now: number, days: number): string {
  return new Date(now - days * 86_400_000).toISOString();
}

/*
  Each source is its own function and its own indexed query, bounded by a limit.
  A failed source is logged and returns nothing, so one broken source never
  takes the feed down; the engine checks that at least something came back.
*/
async function run(label: string, q: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<FeedPost[]> {
  const { data, error } = await q;
  if (error) {
    console.error(`[intelligence] ${label} failed`, error.code, error.message);
    throw new Error(`${label} failed`);
  }
  return (data as FeedPost[]) ?? [];
}

export async function retrieveFollowingCandidates(db: SupabaseClient, into: Loaded, authorIds: string[], now: number, limit = 150) {
  if (authorIds.length === 0) return [];
  return load(
    await run(
      "following",
      base(db).in("author_id", authorIds.slice(0, 500)).gte("created_at", isoAgo(now, 30)).order("created_at", { ascending: false }).limit(limit),
    ),
    into,
  );
}

export async function retrieveFreshCandidates(db: SupabaseClient, into: Loaded, limit = 100) {
  return load(await run("fresh", base(db).order("created_at", { ascending: false }).limit(limit)), into);
}

export async function retrieveTopicCandidates(db: SupabaseClient, into: Loaded, topicIds: string[], now: number, limit = 60) {
  if (topicIds.length === 0) return [];
  return load(
    await run(
      "topics",
      base(db).in("topic_id", topicIds).gte("created_at", isoAgo(now, 30)).order("created_at", { ascending: false }).limit(limit),
    ),
    into,
  );
}

export async function retrieveAuthorAffinityCandidates(db: SupabaseClient, into: Loaded, authorIds: string[], now: number, limit = 40) {
  if (authorIds.length === 0) return [];
  return load(
    await run(
      "author affinity",
      base(db).in("author_id", authorIds).gte("created_at", isoAgo(now, 30)).order("created_at", { ascending: false }).limit(limit),
    ),
    into,
  );
}

/* Full text over the posts' generated english tsvector, on the person's own
   strongest words. Tokens are letters and digits only (text.ts), so the
   tsquery cannot be malformed or injected. */
export async function retrieveSimilarContent(db: SupabaseClient, into: Loaded, terms: string[], limit = 40) {
  const clean = terms.filter((t) => /^[\p{L}\p{N}]+$/u.test(t)).slice(0, 12);
  if (clean.length === 0) return [];
  return load(
    await run(
      "similar content",
      base(db).textSearch("search_vector", clean.join(" | "), { config: "english" }).order("created_at", { ascending: false }).limit(limit),
    ),
    into,
  );
}

/* Posts the people you follow reposted. reposts_select_all is profile_shares
   gated, so this reads only reposts their privacy allows. */
export async function retrieveSocialCandidates(db: SupabaseClient, into: Loaded, followed: string[], limit = 40) {
  if (followed.length === 0) return [];
  const { data, error } = await db
    .from("reposts")
    .select("post_id")
    .in("user_id", followed.slice(0, 500))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[intelligence] social failed", error.code, error.message);
    throw new Error("social failed");
  }
  const ids = [...new Set(((data as { post_id: string }[]) ?? []).map((r) => r.post_id))];
  if (ids.length === 0) return [];
  return load(await run("social posts", base(db).in("id", ids)), into);
}

/*
  feed_v3: what the people you follow commented on, reposted and (two or more
  of them) liked, through my_network_engagement(), which answers for the signed
  in person only and returns counts, never who. The posts themselves are then
  read with the viewer's own client, so RLS still decides what exists.
*/
type NetworkRow = { post_id: string; likers: number; commenters: number; reposters: number };

async function networkRows(db: SupabaseClient, ids: string[] | null): Promise<NetworkRow[]> {
  const { data, error } = await db.rpc("my_network_engagement", {
    p_post_ids: ids ? ids.slice(0, 500) : null,
    p_days: 7,
  });
  if (error) {
    console.error("[intelligence] network failed", error.code, error.message);
    throw new Error("network failed");
  }
  return (data as NetworkRow[]) ?? [];
}

export async function retrieveNetworkCandidates(db: SupabaseClient, into: Loaded, viewerId: string | null) {
  if (!viewerId) return [];
  const rows = await networkRows(db, null);
  if (rows.length === 0) return [];
  return load(await run("network posts", base(db).in("id", rows.map((r) => r.post_id))), into);
}

/* Counts for the candidates at hand. Empty (never a failure) when signed out
   or when the read fails: the feed then ranks without the network. */
export async function loadNetworkEngagement(
  db: SupabaseClient,
  viewerId: string | null,
  ids: string[],
): Promise<Map<string, NetworkEngagement>> {
  const out = new Map<string, NetworkEngagement>();
  if (!viewerId || ids.length === 0) return out;
  try {
    for (const r of await networkRows(db, ids)) {
      out.set(r.post_id, { likers: r.likers, commenters: r.commenters, reposters: r.reposters });
    }
  } catch {
    /* Logged in networkRows. */
  }
  return out;
}

/* The last week's most engaged posts, as a candidate source for trending and
   rising. The final trending order is decided by velocity, not by this sort. */
export async function retrieveTrendingCandidates(db: SupabaseClient, into: Loaded, now: number, limit = 80) {
  return load(
    await run(
      "trending window",
      base(db).gte("created_at", isoAgo(now, 7)).order("like_count", { ascending: false }).order("comment_count", { ascending: false }).limit(limit),
    ),
    into,
  );
}

/* Older posts people keep saving: the evergreen source, so good old content is
   still a candidate once it falls out of the fresh window. */
export async function retrieveEvergreenCandidates(db: SupabaseClient, into: Loaded, now: number, limit = 20) {
  return load(
    await run(
      "evergreen",
      base(db).lt("created_at", isoAgo(now, 7)).gt("save_count", 0).order("save_count", { ascending: false }).limit(limit),
    ),
    into,
  );
}

/* Video posts, through an inner join so a page of text posts never crosses the
   wire to be discarded. The same query shape lib/community/video.ts uses. */
export async function retrieveVideoCandidates(db: SupabaseClient, into: Loaded, now: number, limit = 100) {
  return load(
    await run(
      "videos",
      db
        .from("posts")
        .select(POST_SELECT.replace("media:post_media(", "media:post_media!inner("))
        .eq("status", "visible")
        .is("deleted_at", null)
        .eq("post_media.media_kind", "video")
        .gte("created_at", isoAgo(now, 90))
        .order("created_at", { ascending: false })
        .limit(limit),
    ),
    into,
  );
}

export async function retrieveByIds(db: SupabaseClient, into: Loaded, ids: string[]) {
  if (ids.length === 0) return [];
  return load(await run("by id", base(db).in("id", ids.slice(0, 200))), into);
}

/* ------------------------------------------------------------- signals */

/*
  Engagement aggregates for the given posts. Returns null when the service role
  is not configured or the call fails: the caller then ranks on the public
  counters and freshness alone (fallback chain, fallback.ts).
*/
export async function loadPostSignals(ids: string[]): Promise<Map<string, PostSignals> | null> {
  if (ids.length === 0) return new Map();
  if (!hasServiceRole()) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[intelligence] signals unavailable: no SUPABASE_SERVICE_ROLE_KEY");
    }
    return null;
  }
  try {
    const { data, error } = await createAdminClient().rpc("feed_post_signals", {
      p_post_ids: ids.slice(0, 500),
    });
    if (error) {
      console.error("[intelligence] signals failed", error.code, error.message);
      return null;
    }
    return parseSignalRows((data as SignalRow[]) ?? []);
  } catch (err) {
    console.error("[intelligence] signals threw", err);
    return null;
  }
}

/* ------------------------------------------------------------ interests */

const ACTIONS = new Set<InterestAction>([
  "like", "save", "repost", "comment", "complete", "watch", "skip", "video_start",
  "profile_visit", "open", "dwell", "seen", "follow", "not_interested", "mute_author",
  "mute_topic", "report", "search", "compare", "ask", "explore", "dislike",
  "served", "followed_by", "engaged_me",
]);

type InterestRow = {
  action: string;
  post_id: string | null;
  author_id: string | null;
  topic_id: string | null;
  post_kind: string | null;
  tool_id: string | null;
  model_id: string | null;
  term: string | null;
  value: number | null;
  at: string;
  /* feed_v3: the feed position an impression or delivery happened at. */
  pos?: number | null;
};

export type LoadedProfile = {
  profile: InterestProfile;
  signals: InterestSignal[];
};

/*
  The signed in person's profile. Null when there is nobody signed in, or when
  the read fails: personalisation then falls back to the cold start behaviour
  rather than failing the feed.
*/
/*
  feed_v3: the interest rows, cached per viewer AND ranking clock. Show more
  carries the first page's frozen `at`, so pages 2 to 5 reuse page 1's rows
  instead of asking my_feed_interests() again; a refresh has a new clock and
  always reads fresh, so nothing ever needs invalidating. Rows, not profiles:
  every request builds its own profile, so no caller can change another's.
  Per server instance and bounded.
*/
const INTEREST_CACHE_MS = 2 * 3_600_000;
const INTEREST_CACHE_MAX = 200;
const interestCache = new Map<string, { at: number; rows: InterestRow[] }>();

async function interestRows(db: SupabaseClient, viewerId: string, now: number): Promise<InterestRow[] | null> {
  const key = `${viewerId}:${now}`;
  const hit = interestCache.get(key);
  if (hit && Date.now() - hit.at < INTEREST_CACHE_MS) return hit.rows;
  const { data, error } = await db.rpc("my_feed_interests");
  if (error) {
    console.error("[intelligence] interests failed", error.code, error.message);
    return null;
  }
  const rows = (data as InterestRow[]) ?? [];
  if (interestCache.size >= INTEREST_CACHE_MAX) {
    const oldest = interestCache.keys().next().value;
    if (oldest !== undefined) interestCache.delete(oldest);
  }
  interestCache.set(key, { at: Date.now(), rows });
  return rows;
}

export async function loadInterestProfile(
  db: SupabaseClient,
  viewerId: string | null,
  now: number,
): Promise<LoadedProfile | null> {
  if (!viewerId) return null;
  try {
    const data = await interestRows(db, viewerId, now);
    if (data === null) return null;
    const signals: InterestSignal[] = [];
    for (const r of (data as InterestRow[]) ?? []) {
      if (!ACTIONS.has(r.action as InterestAction)) continue;
      const at = Date.parse(r.at);
      /* As of `now`: a frozen ranking clock (Show more) must not see what
         happened after the first page was built, so pages keep their order. */
      if (!Number.isFinite(at) || at > now) continue;
      signals.push({
        action: r.action as InterestAction,
        at,
        postId: r.post_id,
        authorId: r.author_id,
        topicId: r.topic_id,
        kind: r.post_kind,
        toolId: r.tool_id,
        modelId: r.model_id,
        term: r.term,
        value: r.value,
        position: r.pos ?? null,
      });
    }
    return { profile: buildInterestProfile(viewerId, signals, now), signals };
  } catch (err) {
    console.error("[intelligence] interests threw", err);
    return null;
  }
}

/* What this person watched in the last 45 minutes, for the Reels session. */
export function recentSessionEvents(signals: InterestSignal[], now: number): SessionEvent[] {
  const since = now - 45 * 60_000;
  const out: SessionEvent[] = [];
  for (const s of signals) {
    if (s.at < since || !s.postId || !s.authorId) continue;
    if (s.action !== "watch" && s.action !== "complete" && s.action !== "skip") continue;
    out.push({
      item: { id: s.postId, authorId: s.authorId, topicId: s.topicId ?? null, kind: s.kind ?? "text", body: "" },
      at: s.at,
      percentWatched: s.action === "complete" ? 100 : s.value ?? 0,
      skipped: s.action === "skip",
    });
  }
  return out;
}

/* Words of each post the person liked, saved and watched, per post (so a
   candidate is never "similar" to itself, features.ts), read through their own
   client, so a seed post that has since gone private or been removed drops out. */
export async function loadSeedTokens(db: SupabaseClient, profile: InterestProfile | null): Promise<SeedTokens> {
  const empty: SeedTokens = { liked: new Map(), saved: new Map(), watched: new Map() };
  if (!profile) return empty;
  const liked = profile.seeds.liked.slice(0, 15);
  const saved = profile.seeds.saved.slice(0, 15);
  const watched = profile.seeds.watched.slice(0, 15);
  const ids = [...new Set([...liked, ...saved, ...watched])];
  if (ids.length === 0) return empty;
  const { data, error } = await db.from("posts").select("id, body").in("id", ids);
  if (error) {
    console.error("[intelligence] seeds failed", error.code, error.message);
    return empty;
  }
  const body = new Map(((data as { id: string; body: string }[]) ?? []).map((r) => [r.id, r.body]));
  const collect = (list: string[]) => {
    const m = new Map<string, Set<string>>();
    for (const id of list) {
      const text = body.get(id);
      if (text) m.set(id, new Set(tokenize(text, 30)));
    }
    return m;
  };
  return { liked: collect(liked), saved: collect(saved), watched: collect(watched) };
}

/* The words to run the similar content search on: the person's strongest
   search, Ask and seed words. */
export function similarityTerms(profile: InterestProfile | null, seeds: SeedTokens): string[] {
  const terms = profile ? topKeys(profile, "term", 6) : [];
  const fromSeeds: string[] = [];
  for (const m of [seeds.saved, seeds.watched, seeds.liked]) for (const set of m.values()) fromSeeds.push(...set);
  return [...new Set([...terms, ...fromSeeds.slice(0, 8)])].slice(0, 12);
}

/* ---------------------------------------------------------- evaluation */

export type ReportRow = {
  algorithm: string;
  variant: string;
  slot: number;
  impressions: number;
  opens: number;
  long_dwells: number;
  viewers: number;
  creators: number;
  topics: number;
  fresh_impressions: number;
  small_creator_impressions: number;
};

/* Aggregates per algorithm version, for the admin debug view. service_role
   only (feed_algorithm_report). Null when unavailable. */
export async function loadAlgorithmReport(days = 7): Promise<ReportRow[] | null> {
  if (!hasServiceRole()) return null;
  try {
    const { data, error } = await createAdminClient().rpc("feed_algorithm_report", { p_days: days });
    if (error) {
      console.error("[intelligence] report failed", error.code, error.message);
      return null;
    }
    return (data as ReportRow[]) ?? [];
  } catch (err) {
    console.error("[intelligence] report threw", err);
    return null;
  }
}
