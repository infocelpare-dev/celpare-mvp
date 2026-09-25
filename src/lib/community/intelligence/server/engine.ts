import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedPost } from "@/lib/community/queries";
import { mergeCandidateSources, type SourceList } from "../candidates";
import { assignVariant } from "../experiments";
import { evaluate, type Evaluation } from "../evaluation";
import { primaryReason } from "../explain";
import { rankWithFallback } from "../fallback";
import { FEED, FEED_ALGORITHM, rankFollowing, rankForYou } from "../feed";
import type { DropReason } from "../pipeline";
import { buildInterestProfile, emptyInterestProfile, isColdStart, topKeys } from "../interests";
import { tokenize } from "../text";
import { reelsFeed } from "../reels";
import {
  risingContent,
  trendingCreators,
  trendingDiscussions,
  trendingHashtags,
  trendingPosts,
  trendingReels,
  trendingTopics,
  type GroupTrend,
} from "../trending";
import { getRecommendedTopics, rankDiscussions, rankPeople, recommendSimilarPosts, type PersonCandidate, type TopicInfo } from "../recommendations";
import type {
  AlgorithmId,
  FeedResult,
  InterestProfile,
  NetworkEngagement,
  RankedItem,
  RankingContext,
  ReasonCode,
  SeenState,
} from "../types";
import { mergeCookieSeen, parseSeenCookie } from "../seen";
import { buildSessionProfile, inferIntent } from "../session";
import {
  loadAlgorithmReport,
  loadInterestProfile,
  loadNetworkEngagement,
  loadPostSignals,
  loadSeedTokens,
  retrieveAuthorAffinityCandidates,
  retrieveByIds,
  retrieveEvergreenCandidates,
  retrieveFollowingCandidates,
  retrieveFreshCandidates,
  retrieveNetworkCandidates,
  retrieveSimilarContent,
  retrieveSocialCandidates,
  retrieveTopicCandidates,
  retrieveTrendingCandidates,
  retrieveVideoCandidates,
  similarityTerms,
  toContentItem,
  type Loaded,
} from "./data";

/*
  Community Intelligence, as the pages call it. One function per surface.

  WHAT A PAGE GETS BACK is FeedPost[] in ranked order (the same objects the
  cards already render, so no component changes shape), plus the algorithm,
  variant and a reason code per post for impression logging. Scores and
  features never leave the server.

  FAILURE, in the order the brief sets:
    a source fails        -> that source contributes nothing; the others rank
    every source fails    -> throws, and the page's error boundary says so
    profile read fails    -> ranks unpersonalised (cold start)
    signals read fails    -> ranks on public counters and freshness
    a ranking stage throws-> fallback_v1: eligible posts in time order
*/

export type RankedFeed = {
  posts: FeedPost[];
  /* Post id to the primary reason it is here, for feed_events. Codes, never scores. */
  reasons: Record<string, ReasonCode | null>;
  /* feed_v3: the social proof line a card may show, counts only, and only
     where it is the reason the post is here. */
  socialProof: Record<string, { reason: "commented_by_following" | "reposted_by_following"; count: number }>;
  algorithm: AlgorithmId;
  variant: string;
  experimentId: string | null;
  complete: boolean;
  fallback: string | null;
  /* Only when an admin asked for the debug view. Never rendered for anybody else. */
  debug?: FeedDebug;
};

export type FeedDebug = {
  intent: string;
  intentConfidence: number;
  sessionActions: number;
  seenCount: number;
  candidates: number;
  timings: Record<string, number>;
  /* feed_v3: candidates per source, and the states of the pool. */
  sources?: Record<string, number>;
  served?: number;
  /* Post id to why it is not on the page (or lower than one might expect). */
  dropped?: Record<string, DropReason>;
  items: Record<
    string,
    {
      position: number;
      score: number;
      primaryReason: ReasonCode | null;
      supporting: ReasonCode[];
      sources: string[];
      features: Record<string, number> | null;
      debug: RankedItem["debug"] | null;
    }
  >;
};

/* Settle every source; keep the ones that worked. Throws only if ALL failed,
   because an empty feed built from failures would claim the community is empty. */
async function settle(sources: Promise<SourceList>[]): Promise<SourceList[]> {
  const settled = await Promise.allSettled(sources);
  const ok = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  if (ok.length === 0 && settled.length > 0) throw new Error("Every candidate source failed.");
  return ok;
}

function src(source: SourceList["source"], reason: ReasonCode | undefined, p: Promise<SourceList["items"]>): Promise<SourceList> {
  return p.then((items) => ({ source, items, reason }));
}

function toRanked(
  result: FeedResult,
  loaded: Loaded,
  debug?: Omit<FeedDebug, "items">,
  network?: Map<string, NetworkEngagement>,
): RankedFeed {
  const posts: FeedPost[] = [];
  const reasons: Record<string, ReasonCode | null> = {};
  const socialProof: RankedFeed["socialProof"] = {};
  const items: FeedDebug["items"] = {};
  result.items.forEach((r) => {
    const p = loaded.posts.get(r.item.id);
    if (!p) return;
    posts.push(p);
    reasons[p.id] = r.explanation?.primary ?? primaryReason(r.reasons);
    /* Social proof is shown only when it is the primary reason: the ranker
       placed the post here BECAUSE of it (explain.ts). Counts only. */
    const n = network?.get(p.id);
    const primary = reasons[p.id];
    if (n && primary === "commented_by_following") socialProof[p.id] = { reason: primary, count: n.commenters };
    if (n && primary === "reposted_by_following") socialProof[p.id] = { reason: primary, count: n.reposters };
    if (debug) {
      items[p.id] = {
        position: posts.length - 1,
        score: Math.round(r.score * 1000) / 1000,
        primaryReason: r.explanation?.primary ?? null,
        supporting: r.explanation?.supporting ?? [],
        sources: r.sources,
        features: r.features
          ? Object.fromEntries(Object.entries(r.features).map(([k, v]) => [k, Math.round(v * 100) / 100]))
          : null,
        debug: r.debug ?? null,
      };
    }
  });
  return {
    posts,
    reasons,
    socialProof,
    algorithm: result.algorithm,
    variant: result.variant,
    experimentId: result.experimentId,
    complete: result.complete,
    fallback: result.fallback,
    ...(debug ? { debug: { ...debug, items } } : {}),
  };
}

function contextFor(
  surface: RankingContext["surface"],
  algorithm: AlgorithmId,
  viewerId: string | null,
  now: number,
  variant: string,
  experimentId: string | null,
  intent?: RankingContext["intent"],
  lastInteractionAt?: number | null,
): RankingContext {
  return { userId: viewerId, surface, now, algorithm, variant, experimentId, intent, lastInteractionAt };
}

export type FeedRequest = {
  /* The viewer's own client (readerFor): RLS decides what can be ranked. */
  db: SupabaseClient;
  viewerId: string | null;
  pages: number;
  /* Frozen for the request so "Show more" keeps the order it had. Defaults to
     the current time. */
  now?: number;
  /* The raw cp_seen cookie: what this browser just had on screen (seen.ts). */
  seenCookie?: string | null;
  /* Admin only: keep features and ranking metadata for the debug view. The
     page decides who may ask; this function trusts it. */
  debug?: boolean;
};

/*
  Everything about the person for one request, loaded once: the long term
  profile (as of `now`), this sitting's session, and the inferred intent.
*/
async function personFor(db: SupabaseClient, viewerId: string | null, now: number) {
  const person = await loadInterestProfile(db, viewerId, now);
  const profile = person?.profile ?? null;
  const signals = person?.signals ?? [];
  const session = viewerId && signals.length ? buildSessionProfile(viewerId, signals, now) : null;
  const intent = inferIntent(viewerId, signals, now);
  return { profile, signals, session, intent };
}

/* Seen state: history, plus the session cookie for the candidates at hand. */
function seenStateFor(
  profile: InterestProfile | null,
  cookie: string | null | undefined,
  candidateIds: string[],
  now: number,
): SeenState {
  const state: SeenState = new Map(profile ? [...profile.seen].map(([k, v]) => [k, { ...v }]) : []);
  mergeCookieSeen(state, parseSeenCookie(cookie), candidateIds, now);
  return state;
}

/* ----------------------------------------------------------- For You */

export async function getForYouFeed(req: FeedRequest): Promise<RankedFeed> {
  const { db, viewerId } = req;
  const now = req.now ?? Date.now();
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const pages = Math.min(Math.max(1, req.pages), FEED.MAX_PAGES);
  const loaded: Loaded = { items: [], posts: new Map() };

  const { profile, session, intent } = await personFor(db, viewerId, now);
  timings.person = Date.now() - t0;
  const cold = isColdStart(profile);
  const followed = profile ? [...profile.followedAuthors] : [];

  /* Sources personalised by the long term profile AND this sitting: topics
     from both, creators the person engages with, their own words. */
  const sessionTopics = session
    ? [...session.topicCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t)
    : [];
  const topicIds = [...new Set([...(profile && !cold ? topKeys(profile, "topic", 4) : []), ...sessionTopics])];
  const affinityAuthors =
    profile && !cold
      ? topKeys(profile, "author", 8).filter((a) => !profile.followedAuthors.has(a) && a !== viewerId).slice(0, 6)
      : [];

  /* Seeds and the sources that do not need them run together; only the
     similar words source waits for the seeds. */
  const seedsP = loadSeedTokens(db, profile);
  const similarP = seedsP.then((seeds) =>
    retrieveSimilarContent(db, loaded, cold ? [] : similarityTerms(profile, seeds)),
  );
  /* feed_v3 reads what the people you follow commented on, reposted and
     (two or more of them) liked; v2 read only their reposts. */
  const v3 = FEED_ALGORITHM.forYou === "feed_v3";
  const [seeds, lists] = await Promise.all([
    seedsP,
    settle([
      src("following", "follows_author", retrieveFollowingCandidates(db, loaded, followed, now)),
      src("fresh", "fresh", retrieveFreshCandidates(db, loaded)),
      src("topic", "topic_interest", retrieveTopicCandidates(db, loaded, topicIds, now)),
      src("author_affinity", "interacted_with_author", retrieveAuthorAffinityCandidates(db, loaded, affinityAuthors, now)),
      src("similar_content", "similar_to_liked", similarP),
      v3
        ? src("network", undefined, retrieveNetworkCandidates(db, loaded, viewerId))
        : src("social", "reposted_by_followed", retrieveSocialCandidates(db, loaded, followed)),
      src("trending", undefined, retrieveTrendingCandidates(db, loaded, now)),
      src("evergreen", undefined, retrieveEvergreenCandidates(db, loaded, now)),
    ]),
  ]);
  timings.retrieval = Date.now() - t0 - timings.person;
  const candidates = mergeCandidateSources(lists);
  const ids = candidates.map((c) => c.item.id);
  /* Signals and network counts are independent reads: one round trip. */
  const [signalsRead, network] = await Promise.all([
    loadPostSignals(ids),
    v3 ? loadNetworkEngagement(db, viewerId, ids) : Promise.resolve(new Map()),
  ]);
  const signals = signalsRead ?? new Map();
  timings.signals = Date.now() - t0 - timings.person - timings.retrieval;
  const seen = seenStateFor(profile, req.seenCookie, ids, now);
  const trace = req.debug ? new Map<string, DropReason>() : undefined;

  const algorithm = FEED_ALGORITHM.forYou;
  const assignment = assignVariant(viewerId, algorithm);
  const context = contextFor(
    "for_you",
    algorithm,
    viewerId,
    now,
    assignment.variant,
    assignment.experimentId,
    intent.intent,
    session?.lastAt || null,
  );

  const result = rankWithFallback(
    () =>
      rankForYou({
        context,
        candidates,
        profile,
        signals,
        seeds,
        assignment,
        pages,
        viewerKey: viewerId ?? "anon",
        seen,
        session,
        debug: req.debug,
        network,
        followCount: followed.length,
        trace,
      }),
    { candidates, signals, profile, pageSize: FEED.PAGE_SIZE, pages, seen, now },
    (err) => console.error(`[intelligence] ${algorithm} failed, serving fallback`, err),
  );
  timings.total = Date.now() - t0;

  return toRanked(
    result,
    loaded,
    req.debug
      ? {
          intent: intent.intent,
          intentConfidence: Math.round(intent.confidence * 100) / 100,
          sessionActions: session ? session.recentAuthors.length : 0,
          seenCount: [...seen.values()].filter((r) => r.depth !== "served").length,
          served: [...seen.values()].filter((r) => r.depth === "served").length,
          candidates: candidates.length,
          sources: Object.fromEntries(lists.map((l) => [l.source, l.items.length])),
          dropped: trace ? Object.fromEntries(trace) : undefined,
          timings,
        }
      : undefined,
    network,
  );
}

/* ---------------------------------------------------------- Following */

export async function getFollowingFeed(req: FeedRequest): Promise<RankedFeed> {
  const { db, viewerId } = req;
  const now = req.now ?? Date.now();
  const pages = Math.min(Math.max(1, req.pages), FEED.MAX_PAGES);
  const loaded: Loaded = { items: [], posts: new Map() };

  const empty: RankedFeed = {
    posts: [],
    reasons: {},
    socialProof: {},
    algorithm: FEED_ALGORITHM.following,
    variant: "control",
    experimentId: null,
    complete: true,
    fallback: null,
  };
  if (!viewerId) return empty;

  /* Who they follow is read directly, not from the profile: the tab must work
     even if the profile read fails. follows_select_all lets a person read their
     own follow rows whatever the other account's privacy. */
  const [{ data: follows, error }, person] = await Promise.all([
    db.from("follows").select("following_id").eq("follower_id", viewerId).limit(1000),
    personFor(db, viewerId, now),
  ]);
  if (error) {
    console.error("[intelligence] follows failed", error.code, error.message);
    throw new Error("Could not read who you follow.");
  }
  const followed = ((follows as { following_id: string }[]) ?? []).map((f) => f.following_id);
  /* Following nobody is an empty feed, not the whole feed. */
  if (followed.length === 0) return empty;

  const profile = person.profile ?? emptyWithFollows(viewerId, followed);
  for (const id of followed) profile.followedAuthors.add(id);

  const lists = await settle([
    src("following", "follows_author", retrieveFollowingCandidates(db, loaded, followed, now, 200)),
  ]);
  const candidates = mergeCandidateSources(lists);
  const signals = (await loadPostSignals(candidates.map((c) => c.item.id))) ?? new Map();
  const seen = seenStateFor(profile, req.seenCookie, candidates.map((c) => c.item.id), now);

  const assignment = assignVariant(viewerId, FEED_ALGORITHM.following);
  const context = contextFor(
    "following",
    FEED_ALGORITHM.following,
    viewerId,
    now,
    assignment.variant,
    assignment.experimentId,
    person.intent.intent,
    person.session?.lastAt || null,
  );

  const result = rankWithFallback(
    () =>
      rankFollowing({
        context,
        candidates,
        profile,
        signals,
        assignment,
        pages,
        viewerKey: viewerId,
        seen,
        session: person.session,
      }),
    { candidates, signals, profile, pageSize: FEED.PAGE_SIZE, pages, seen, now },
    (err) => console.error(`[intelligence] ${FEED_ALGORITHM.following} failed, serving fallback`, err),
  );
  return toRanked(result, loaded);
}

function emptyWithFollows(viewerId: string, followed: string[]) {
  const p = emptyInterestProfile(viewerId);
  for (const id of followed) p.followedAuthors.add(id);
  return p;
}

/* -------------------------------------------------------------- Reels */

/*
  The vertical viewer's list. The requested video is always first (a shared
  link opens on it); the rest is reels_v2's session sequence. The viewer
  component is unchanged and receives FeedPost objects with a video, exactly as
  before.
*/
export async function getReelsFeed(req: FeedRequest & { firstId?: string | null }): Promise<RankedFeed> {
  const { db, viewerId } = req;
  const now = req.now ?? Date.now();
  const loaded: Loaded = { items: [], posts: new Map() };

  const person = await personFor(db, viewerId, now);
  const { session, intent } = person;
  /* Reels stay reels_v2 (the feed_v3 brief excludes video): the profile is
     built from the same history without the rows feed_v3 added (served,
     followed_by, engaged_me) and without ignores, so the viewer's order is
     what v2 produced. */
  const profile = viewerId && person.profile ? buildInterestProfile(viewerId, person.signals, now, { v2Only: true }) : null;
  const [seeds, lists] = await Promise.all([
    loadSeedTokens(db, profile),
    settle([
      src("video", undefined, retrieveVideoCandidates(db, loaded, now)),
      ...(req.firstId ? [src("video", undefined, retrieveByIds(db, loaded, [req.firstId]))] : []),
    ]),
  ]);
  const candidates = mergeCandidateSources(lists).filter((c) => c.item.media === "video");
  const signals = (await loadPostSignals(candidates.map((c) => c.item.id))) ?? new Map();
  const seen = seenStateFor(profile, req.seenCookie, candidates.map((c) => c.item.id), now);
  /* feed_v3 served state is the feed's, not the viewer's (see above). */
  for (const [id, r] of seen) if (r.depth === "served") seen.delete(id);
  /* The requested video is never held back as seen: a link opens on it. */
  if (req.firstId) seen.delete(req.firstId);

  const assignment = assignVariant(viewerId, "reels_v2");
  const context = contextFor(
    "reels",
    "reels_v2",
    viewerId,
    now,
    assignment.variant,
    assignment.experimentId,
    intent.intent,
    session?.lastAt || null,
  );

  const result = rankWithFallback(
    () =>
      reelsFeed(
        {
          context,
          candidates,
          profile,
          signals,
          seeds,
          assignment,
          viewerKey: viewerId ?? "anon",
          session,
          seen,
        },
        req.firstId,
      ),
    { candidates, signals, profile, pageSize: 30, pages: 1, seen, now },
    (err) => console.error("[intelligence] reels_v2 failed, serving fallback", err),
  );

  const ranked = toRanked(result, loaded);
  /* The fallback orders by time and may not put the requested video first. */
  if (req.firstId && ranked.posts[0]?.id !== req.firstId) {
    const first = loaded.posts.get(req.firstId);
    if (first) ranked.posts = [first, ...ranked.posts.filter((p) => p.id !== req.firstId)];
  }
  return ranked;
}

/* ------------------------------------------------ Trending and Rising */

export type TrendingKind = "posts" | "reels" | "topics" | "hashtags" | "creators" | "discussions" | "rising";

export type TrendingResult =
  | { kind: "posts" | "reels" | "discussions" | "rising"; algorithm: AlgorithmId; posts: FeedPost[] }
  | { kind: "topics" | "hashtags" | "creators"; algorithm: AlgorithmId; groups: Omit<GroupTrend, "score">[] };

/*
  Trending is the same for everybody, so it is read through the ANON client:
  only public posts can trend, a private account can never surface in a list
  everybody sees, and the answer can be cached briefly. Scores are dropped
  before anything leaves this function.
*/
const trendCache = new Map<string, { at: number; value: TrendingResult }>();
const TREND_TTL_MS = 60_000;

export async function getTrending(anon: SupabaseClient, kind: TrendingKind, now: number = Date.now()): Promise<TrendingResult> {
  const hit = trendCache.get(kind);
  if (hit && now - hit.at < TREND_TTL_MS) return hit.value;

  const loaded: Loaded = { items: [], posts: new Map() };
  const lists = await settle([
    src("trending", undefined, retrieveTrendingCandidates(anon, loaded, now, 150)),
    src("fresh", undefined, retrieveFreshCandidates(anon, loaded, 100)),
  ]);
  const items = mergeCandidateSources(lists).map((c) => c.item);
  const signals = (await loadPostSignals(items.map((i) => i.id))) ?? new Map();
  const input = { items, signals, now };
  const posts = (xs: { item: { id: string } }[]) => xs.map((x) => loaded.posts.get(x.item.id)).filter((p): p is FeedPost => Boolean(p));
  const strip = (gs: GroupTrend[]) => gs.map(({ key, posts, participants, growth }) => ({ key, posts, participants, growth: Math.round(growth * 100) / 100 }));

  let value: TrendingResult;
  switch (kind) {
    case "posts":
      value = { kind, algorithm: "trending_v1", posts: posts(trendingPosts(input)) };
      break;
    case "reels":
      value = { kind, algorithm: "trending_v1", posts: posts(trendingReels(input)) };
      break;
    case "discussions":
      value = { kind, algorithm: "trending_v1", posts: posts(trendingDiscussions(input)) };
      break;
    case "rising": {
      const top = new Set(trendingPosts(input, 10).map((x) => x.item.id));
      value = { kind, algorithm: "rising_v1", posts: posts(risingContent(input, 10, top)) };
      break;
    }
    case "topics":
      value = { kind, algorithm: "trending_v1", groups: strip(trendingTopics(input)) };
      break;
    case "hashtags":
      value = { kind, algorithm: "trending_v1", groups: strip(trendingHashtags(input)) };
      break;
    case "creators":
      value = { kind, algorithm: "trending_v1", groups: strip(trendingCreators(input)) };
      break;
  }
  trendCache.set(kind, { at: now, value });
  return value;
}

/* ----------------------------------------------------- Recommendations */

/*
  people_v1. Candidates are the viewer's second degree (who the people they
  follow follow), the people who follow them, and authors they already engage
  with. Every read is through the viewer's client, so follows_select_all's
  privacy rules decide which edges are visible.
*/
export async function getPeopleRecommendations(db: SupabaseClient, viewerId: string, now: number = Date.now(), limit = 12) {
  const person = await loadInterestProfile(db, viewerId, now);
  const profile = person?.profile ?? null;

  const [{ data: mine }, { data: fans }] = await Promise.all([
    db.from("follows").select("following_id").eq("follower_id", viewerId).limit(500),
    db.from("follows").select("follower_id").eq("following_id", viewerId).limit(500),
  ]);
  const following = ((mine as { following_id: string }[]) ?? []).map((r) => r.following_id);
  const followers = new Set(((fans as { follower_id: string }[]) ?? []).map((r) => r.follower_id));
  if (profile) for (const f of following) profile.followedAuthors.add(f);

  const mutual = new Map<string, number>();
  if (following.length) {
    const { data: second } = await db.from("follows").select("follower_id, following_id").in("follower_id", following.slice(0, 200)).limit(2000);
    for (const r of (second as { follower_id: string; following_id: string }[]) ?? []) {
      mutual.set(r.following_id, (mutual.get(r.following_id) ?? 0) + 1);
    }
  }

  const authorsOfInterest = profile ? topKeys(profile, "author", 20) : [];
  const ids = new Set<string>([...mutual.keys(), ...followers, ...authorsOfInterest]);
  ids.delete(viewerId);

  /* Topics each candidate posts in, from their recent visible posts. */
  const topicsBy = new Map<string, Map<string, number>>();
  if (ids.size) {
    const { data: recent } = await db
      .from("posts")
      .select("author_id, topic_id")
      .in("author_id", [...ids].slice(0, 200))
      .eq("status", "visible")
      .is("deleted_at", null)
      .gte("created_at", new Date(now - 60 * 86_400_000).toISOString())
      .limit(1000);
    for (const r of (recent as { author_id: string; topic_id: string | null }[]) ?? []) {
      if (!r.topic_id) continue;
      const m = topicsBy.get(r.author_id) ?? new Map<string, number>();
      m.set(r.topic_id, (m.get(r.topic_id) ?? 0) + 1);
      topicsBy.set(r.author_id, m);
    }
  }

  const maxAuthor = profile ? Math.max(0, ...[...profile.longTerm.entries()].filter(([k]) => k.startsWith("author:")).map(([, v]) => v)) : 0;
  const candidates: PersonCandidate[] = [...ids].map((id) => ({
    id,
    mutualFollows: mutual.get(id) ?? 0,
    followsViewer: followers.has(id),
    topics: topicsBy.get(id) ?? new Map(),
    interaction: profile && maxAuthor > 0 ? (profile.longTerm.get(`author:${id}`) ?? 0) / maxAuthor : 0,
    quality: 0.5,
  }));

  return { algorithm: "people_v1" as const, people: rankPeople(viewerId, candidates, profile, limit) };
}

/* topics_v1: topics for this person, with trending as a light input. */
export async function getTopicRecommendations(db: SupabaseClient, anon: SupabaseClient, viewerId: string | null, topics: TopicInfo[], now: number = Date.now()) {
  const person = await loadInterestProfile(db, viewerId, now);
  const trend = await getTrending(anon, "topics", now).catch(() => null);
  const trends = trend && "groups" in trend ? trend.groups.map((g) => ({ ...g, score: g.participants })) : [];
  return { algorithm: "topics_v1" as const, topics: getRecommendedTopics(person?.profile ?? null, topics, trends) };
}

/* discussions_v1 and content_v1, over the For You candidate pool. */
export async function getDiscussionRecommendations(db: SupabaseClient, viewerId: string | null, now: number = Date.now()) {
  const loaded: Loaded = { items: [], posts: new Map() };
  const person = await loadInterestProfile(db, viewerId, now);
  const lists = await settle([
    src("fresh", undefined, retrieveFreshCandidates(db, loaded, 150)),
    src("trending", undefined, retrieveTrendingCandidates(db, loaded, now)),
  ]);
  const items = mergeCandidateSources(lists).map((c) => c.item);
  const signals = (await loadPostSignals(items.map((i) => i.id))) ?? new Map();
  const ranked = rankDiscussions({ items, signals, profile: person?.profile ?? null, now });
  return { algorithm: "discussions_v1" as const, posts: ranked.map((r) => loaded.posts.get(r.item.id)).filter((p): p is FeedPost => Boolean(p)) };
}

export async function getSimilarPosts(db: SupabaseClient, viewerId: string | null, seed: FeedPost, now: number = Date.now(), limit = 6) {
  const loaded: Loaded = { items: [], posts: new Map() };
  const person = await loadInterestProfile(db, viewerId, now);
  const seedItem = toContentItem(seed);
  const lists = await settle([
    src("similar_content", undefined, retrieveSimilarContent(db, loaded, tokenize(seedItem.body, 10))),
    src("topic", undefined, retrieveTopicCandidates(db, loaded, seed.topic_id ? [seed.topic_id] : [], now)),
  ]);
  const items = mergeCandidateSources(lists).map((c) => c.item);
  const signals = (await loadPostSignals(items.map((i) => i.id))) ?? new Map();
  const ranked = recommendSimilarPosts([seedItem], { items, signals, profile: person?.profile ?? null, now }, limit);
  return { algorithm: "content_v1" as const, posts: ranked.map((r) => loaded.posts.get(r.item.id)).filter((p): p is FeedPost => Boolean(p)) };
}

/* --------------------------------------------------------- evaluation */

/*
  Metrics per algorithm version over the last week, for the admin debug view:
  position adjusted opens, long reads, diversity, fresh and small creator share.
  The negative, safety and return metrics need joins the report does not do yet,
  and are left at zero rather than estimated (evaluation.ts has their shape).
*/
export async function getAlgorithmEvaluation(days = 7): Promise<{ algorithm: string; variant: string; impressions: number; evaluation: Evaluation }[] | null> {
  const rows = await loadAlgorithmReport(days);
  if (!rows) return null;
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.algorithm}|${r.variant}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].map(([key, rs]) => {
    const [algorithm, variant] = key.split("|");
    const impressions = rs.reduce((a, r) => a + r.impressions, 0);
    return {
      algorithm,
      variant,
      impressions,
      evaluation: evaluate({
        positions: rs.map((r) => ({ position: r.slot, impressions: r.impressions, opens: r.opens })),
        meaningfulActions: rs.reduce((a, r) => a + r.long_dwells, 0),
        impressions,
        impressionsByCreator: [],
        impressionsToSmallCreators: rs.reduce((a, r) => a + r.small_creator_impressions, 0),
        impressionsOfFreshPosts: rs.reduce((a, r) => a + r.fresh_impressions, 0),
        distinctTopics: Math.max(0, ...rs.map((r) => r.topics)),
        notInterested: 0,
        reports: 0,
        unsafeImpressions: 0,
        users: Math.max(0, ...rs.map((r) => r.viewers)),
        returningUsers: 0,
      }),
    };
  });
}
