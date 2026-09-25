import { applyOverride, type Assignment } from "./experiments";
import type { SeedTokens } from "./features";
import { getSessionInterestProfile, type SessionEvent, type SessionProfile } from "./interests";
import { unitHash } from "./math";
import { runPipeline } from "./pipeline";
import { OBJECTIVES } from "./scoring";
import type {
  Candidate,
  FeedResult,
  InterestProfile,
  PostSignals,
  RankedItem,
  RankingContext,
  SeenState,
} from "./types";

/*
  reels_v1: the vertical video viewer's order.

  THE VIEWER IS NOT TOUCHED. It already takes an ordered VideoPost[] and does not
  care where the order came from; this module produces the order and the server
  hands it over. No new player, no new UI.

  JUDGED BY WATCHING. The reels objective weights predicted watch, completion,
  rewatch, share and follow above likes, and watch quality comes from the
  seventeen signals post_video_events already records: completion rate, how far
  people got, rewatches, and fast swipe aways as a negative.

  SESSION SEQUENCING. rankReels() scores the pool; sequenceReels() then builds
  the list one video at a time with selectNextReel(), which looks at what this
  sitting has already shown: never the same video twice, not the same creator
  within three, not three of one topic in a row, and an exploration pick every
  so often. The order the viewer receives is that sequence.
*/

export const REELS = {
  POOL_KEEP: 80,
  LIST_SIZE: 30,
  /* A creator seen in the last N slots is pushed down hard. */
  CREATOR_GAP: 3,
  /* Two in a row from one topic is fine, three is a rut. */
  MAX_TOPIC_RUN: 2,
  /* Every Nth slot may go to an exploration pick. */
  EXPLORE_EVERY: 6,
  EXPLORATION_COUNT: 3,
} as const;

export type ReelsInput = {
  context: RankingContext;
  candidates: Candidate[];
  profile: InterestProfile | null;
  signals: Map<string, PostSignals>;
  seeds?: SeedTokens;
  assignment: Assignment;
  viewerKey: string;
  /* What this person watched recently, newest first, for the session. */
  sessionEvents?: SessionEvent[];
  /* v2: the full session (every kind of action) and seen state. When given,
     they are used instead of sessionEvents. */
  session?: SessionProfile | null;
  seen?: SeenState;
};

export function retrieveReelCandidates(candidates: Candidate[]): Candidate[] {
  return candidates.filter((c) => c.item.media === "video");
}

export function rankReels(input: ReelsInput, session: SessionProfile | null): RankedItem[] {
  const objective = applyOverride(OBJECTIVES.reels, input.assignment.override);
  return runPipeline({
    context: input.context,
    candidates: retrieveReelCandidates(input.candidates),
    profile: input.profile,
    signals: input.signals,
    objective,
    freshnessProfile: "reel",
    pageSize: REELS.LIST_SIZE,
    firstStageKeep: REELS.POOL_KEEP,
    seeds: input.seeds,
    session,
    distribution: true,
    explorationCount: REELS.EXPLORATION_COUNT,
    viewerKey: input.viewerKey,
    seen: input.seen,
  });
}

export type ReelSessionContext = {
  shownIds: string[];
  shownAuthors: string[];
  shownTopics: (string | null)[];
  salt: string;
};

export function newReelSession(salt: string, seed: RankedItem[] = []): ReelSessionContext {
  return {
    shownIds: seed.map((r) => r.item.id),
    shownAuthors: seed.map((r) => r.item.authorId),
    shownTopics: seed.map((r) => r.item.topicId),
    salt,
  };
}

/*
  The next video, given the session so far. Pure: it does not mutate the pool or
  the session. Returns null when nothing is left.
*/
export function selectNextReel(pool: RankedItem[], session: ReelSessionContext): RankedItem | null {
  const shown = new Set(session.shownIds);
  const slot = session.shownIds.length;
  const recentAuthors = session.shownAuthors.slice(-REELS.CREATOR_GAP);
  const lastTopics = session.shownTopics.slice(-REELS.MAX_TOPIC_RUN);
  const topicRun =
    lastTopics.length === REELS.MAX_TOPIC_RUN && lastTopics[0] !== null && lastTopics.every((t) => t === lastTopics[0])
      ? lastTopics[0]
      : null;

  let best: RankedItem | null = null;
  let bestScore = -Infinity;

  const exploreSlot = slot > 0 && slot % REELS.EXPLORE_EVERY === 0;

  for (const r of pool) {
    if (shown.has(r.item.id)) continue;
    let s = r.score;
    if (recentAuthors.includes(r.item.authorId)) s *= 0.25;
    if (topicRun !== null && r.item.topicId === topicRun) s *= 0.5;
    if (exploreSlot && r.reasons.includes("exploration")) s *= 3;
    /* Deterministic jitter below any real difference, so ties do not always
       resolve the same way across people. */
    s += unitHash(`${session.salt}:${slot}:${r.item.id}`) * 1e-6;
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }
  return best;
}

export function advanceReelSession(session: ReelSessionContext, r: RankedItem): ReelSessionContext {
  return {
    shownIds: [...session.shownIds, r.item.id],
    shownAuthors: [...session.shownAuthors, r.item.authorId],
    shownTopics: [...session.shownTopics, r.item.topicId],
    salt: session.salt,
  };
}

/* Build the viewer's list by repeatedly choosing the next reel. */
export function sequenceReels(
  pool: RankedItem[],
  session: ReelSessionContext,
  size: number = REELS.LIST_SIZE,
): RankedItem[] {
  const out: RankedItem[] = [];
  let s = session;
  while (out.length < size) {
    const next = selectNextReel(pool, s);
    if (!next) break;
    out.push(next);
    s = advanceReelSession(s, next);
  }
  return out;
}

/* Rerank a ranked pool for a session: sequence what the session has not
   consumed, then what it has, so a rewatch is at the end of the list rather
   than missing from it (the same demote, never remove rule as D126). */
export function rerankReels(
  pool: RankedItem[],
  session: SessionProfile | null,
  salt: string,
  first?: RankedItem,
): RankedItem[] {
  const consumed = session?.consumed ?? new Set<string>();
  const rest = pool.filter((r) => r.item.id !== first?.item.id);
  const fresh = rest.filter((r) => !consumed.has(r.item.id));
  const seen = rest.filter((r) => consumed.has(r.item.id));
  const start = newReelSession(salt, first ? [first] : []);
  const seq = sequenceReels(fresh, start);
  const tail = sequenceReels(seen, newReelSession(salt, [...(first ? [first] : []), ...seq]), REELS.LIST_SIZE - seq.length - (first ? 1 : 0));
  return first ? [first, ...seq, ...tail] : [...seq, ...tail];
}

/* Navigation over a sequenced list, for callers that hold the list and an index. */
export function nextReel(list: RankedItem[], index: number): RankedItem | null {
  return list[index + 1] ?? null;
}

export function previousReel(list: RankedItem[], index: number): RankedItem | null {
  return index > 0 ? list[index - 1] ?? null : null;
}

/*
  The whole surface: rank, then sequence, with the requested video first when
  there is one (a shared link must open on that video).
*/
export function reelsFeed(input: ReelsInput, firstId?: string | null): FeedResult {
  const session =
    input.session ??
    (input.sessionEvents?.length ? getSessionInterestProfile(input.sessionEvents, input.context.now) : null);

  /* The requested video is excluded from the session's consumed set: somebody
     who opens a link to a video they watched yesterday should still see it. */
  if (session && firstId) session.consumed.delete(firstId);

  const ranked = rankReels(input, session);
  const firstRanked = firstId ? ranked.find((r) => r.item.id === firstId) : undefined;
  const firstCandidate = firstId && !firstRanked ? input.candidates.find((c) => c.item.id === firstId) : undefined;
  const first: RankedItem | undefined =
    firstRanked ??
    (firstCandidate
      ? { item: firstCandidate.item, score: 0, reasons: firstCandidate.reasons, sources: firstCandidate.sources }
      : undefined);

  const salt = `${input.viewerKey}:${Math.floor(input.context.now / 86_400_000)}`;
  const items = rerankReels(ranked, session, salt, first);

  return {
    items,
    complete: items.length < REELS.LIST_SIZE,
    algorithm: "reels_v2",
    variant: input.assignment.variant,
    experimentId: input.assignment.experimentId,
    fallback: null,
  };
}
