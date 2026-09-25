import { EXPLORATION, INTENT } from "./config";
import { applyOverride, type Assignment } from "./experiments";
import type { SeedTokens } from "./features";
import { isColdStart, type SessionProfile } from "./interests";
import { assembleFeed, runPipeline, type DropReason } from "./pipeline";
import { OBJECTIVES } from "./scoring";
import type {
  Candidate,
  FeedResult,
  InterestProfile,
  NetworkEngagement,
  PostSignals,
  RankingContext,
  SeenState,
} from "./types";

/*
  The two feed surfaces. Separate functions with separate objectives, sharing
  the pipeline and nothing else.

  feed_v2 (For You): "what should this person see right now", from everybody.
  Relevance dominates: the objective values predicted actions, and every
  prediction leans on relevance and author affinity before engagement. A new
  or signed out person (cold start) gets quality, freshness and a wider spread
  of topics instead, plus more exploration, because there is nothing yet to be
  relevant to.

  following_v2: the people you follow, newest and unseen first. No exploration
  and no distribution gate (you chose these authors), a strong freshness weight,
  and the diversity and frequency rules so one prolific account does not fill it.
*/

export const FEED = {
  PAGE_SIZE: 20,
  MAX_PAGES: 5,
  FIRST_STAGE_KEEP: 120,
  /* Following does not reach back further than this. Older posts from the people
     you follow are on their profiles; a timeline of last year is not a feed. */
  FOLLOWING_MAX_AGE_DAYS: 30,
} as const;

/*
  Which version each surface runs (D131: a material change is a new version).
  ROLLBACK is this one line: set a surface back to its v2 id and the v3 stages
  switch off. The profile inputs added with v3 (served state, position aware
  ignores, mutual follows) are shared by every version and stay.
*/
export const FEED_ALGORITHM: { forYou: "feed_v2" | "feed_v3"; following: "following_v2" | "following_v3" } = {
  forYou: "feed_v3",
  following: "following_v3",
};

export type FeedInput = {
  context: RankingContext;
  candidates: Candidate[];
  profile: InterestProfile | null;
  signals: Map<string, PostSignals>;
  seeds?: SeedTokens;
  assignment: Assignment;
  pages: number;
  viewerKey: string;
  /* v2: seen state (history plus the session cookie) and this sitting. */
  seen?: SeenState;
  session?: SessionProfile | null;
  /* Keep features and ranking metadata for the admin debug view. */
  debug?: boolean;
  /* feed_v3 inputs. */
  network?: Map<string, NetworkEngagement>;
  followCount?: number;
  /* Admin debug: filled with why candidates were dropped or demoted. */
  trace?: Map<string, DropReason>;
};

/*
  How many exploration slots a request gets: a configurable share of the pages
  (config.ts EXPLORATION), larger at cold start, scaled by intent (browsing
  explores more, deep interest less), capped.
*/
export function explorationSlots(pages: number, cold: boolean, intent: RankingContext["intent"]): number {
  const base = cold ? EXPLORATION.COLD_START_SHARE : EXPLORATION.SHARE;
  const share = Math.min(EXPLORATION.MAX_SHARE, base * INTENT[intent ?? "browsing"].exploration);
  return Math.round(share * FEED.PAGE_SIZE * pages);
}

export function rankForYou(input: FeedInput): FeedResult {
  const cold = isColdStart(input.profile);
  const pages = Math.min(Math.max(1, input.pages), FEED.MAX_PAGES);
  const v3 = FEED_ALGORITHM.forYou === "feed_v3";
  const objective = applyOverride(v3 ? OBJECTIVES.for_you_v3 : OBJECTIVES.for_you, input.assignment.override);

  const ranked = runPipeline({
    context: input.context,
    candidates: input.candidates,
    profile: input.profile,
    signals: input.signals,
    objective: cold ? { ...objective, freshness: objective.freshness + 0.3, quality: objective.quality + 0.3 } : objective,
    freshnessProfile: "post",
    pageSize: FEED.PAGE_SIZE,
    firstStageKeep: FEED.FIRST_STAGE_KEEP,
    seeds: input.seeds,
    distribution: true,
    /* Planned for every page the feed can show, not the pages asked for, so
       the order is the same whether one page or five are rendered: Show more
       only takes a longer slice of one ranking. */
    explorationCount: explorationSlots(FEED.MAX_PAGES, cold, input.context.intent),
    viewerKey: input.viewerKey,
    seen: input.seen,
    session: input.session,
    keepFeatures: input.debug,
    v3,
    network: input.network,
    followCount: input.followCount,
    trace: input.trace,
  });

  const { items, complete } = assembleFeed(ranked, FEED.PAGE_SIZE, pages);
  /* Off the page: the page cap is the final answer, unless the post was held
     in a lower tier or group for a reason of its own. Out of audience is a
     demotion, not a drop, so it gives way to the page cap. */
  if (input.trace) {
    for (const r of ranked.slice(items.length)) {
      const why = input.trace.get(r.item.id);
      if (!why || why === "out_of_audience") input.trace.set(r.item.id, "page_cap");
    }
  }
  return {
    items,
    complete,
    algorithm: FEED_ALGORITHM.forYou,
    variant: input.assignment.variant,
    experimentId: input.assignment.experimentId,
    fallback: null,
  };
}

export function rankFollowing(input: FeedInput): FeedResult {
  const pages = Math.min(Math.max(1, input.pages), FEED.MAX_PAGES);
  const objective = applyOverride(OBJECTIVES.following, input.assignment.override);
  const maxAgeMs = FEED.FOLLOWING_MAX_AGE_DAYS * 86_400_000;

  const followed = input.profile?.followedAuthors;
  const candidates = input.candidates.filter(
    (c) =>
      (!followed || followed.size === 0 || followed.has(c.item.authorId)) &&
      input.context.now - c.item.createdAt <= maxAgeMs,
  );

  const ranked = runPipeline({
    context: input.context,
    candidates,
    profile: input.profile,
    signals: input.signals,
    objective,
    freshnessProfile: "following",
    pageSize: FEED.PAGE_SIZE,
    firstStageKeep: FEED.FIRST_STAGE_KEEP,
    seeds: input.seeds,
    distribution: false,
    explorationCount: 0,
    followingSurface: true,
    viewerKey: input.viewerKey,
    seen: input.seen,
    session: input.session,
    /* following_v3 is the v2 pipeline over the v3 seen state: served
       rotation comes in through `seen`. No v3 stages: Following is a timeline
       of people you chose, so no source quotas (one source), no network and no
       story clustering, which would hold back posts you followed them for. */
    v3: false,
  });

  const { items, complete } = assembleFeed(ranked, FEED.PAGE_SIZE, pages);
  return {
    items,
    complete,
    algorithm: FEED_ALGORITHM.following,
    variant: input.assignment.variant,
    experimentId: input.assignment.experimentId,
    fallback: null,
  };
}
