import { EXPLORATION, IN_NETWORK_SOURCES, NEGATIVE, NOVELTY, SAME_STORY, SOURCE_ORDER, SOURCE_QUOTA } from "./config";
import { applyDiversity, applyFrequencyControls } from "./diversity";
import { distributionStage, inAudience, type DistributionState } from "./distribution";
import { explainRanking } from "./explain";
import { NO_SEEDS, extractFeatures, type SeedTokens } from "./features";
import { calculateFreshness, type FreshnessProfile } from "./freshness";
import { interestIn, isColdStart, topKeys, type SessionProfile } from "./interests";
import { hash32, hoursBetween, unitHash } from "./math";
import { explorationValue, type Exposure } from "./novelty";
import type { CreatorStats } from "./quality";
import { contentQuality, engagementQuality } from "./quality";
import { spamRisk, applySafety, contentIsRecommendationEligible } from "./safety";
import { baitRisk } from "./quality";
import { heuristicScorer, firstStageScore, objectiveForIntent, value, type Objective, type Scorer } from "./scoring";
import { isRecentlySeen, partitionBySeen, seenPenalty, type Tier } from "./seen";
import { semantic, topicAdjacency } from "./semantic";
import { signalsFor, totalUniq } from "./signals";
import { isNearDuplicate, sameStory } from "./text";
import type {
  Candidate,
  CandidateSource,
  ContentItem,
  InterestProfile,
  NetworkEngagement,
  PostSignals,
  RankedItem,
  RankingContext,
  SeenState,
} from "./types";
import { detectBreakoutContent, viralState, type ViralAssessment } from "./viral";

/*
  The ranking pipeline (v2), one stage per step, in this order:

    eligibility          safety.ts, never experimentable
    distribution         new posts reach their test audience first (demoted, D126)
    seen tiers           seen.ts: recently seen posts, and near copies of posts
                         recently read or watched, rank AFTER every unseen post
    first stage          cheap score, per tier, keep the best slice
    features             features.ts, every value 0..1
    scoring              predicted actions valued under the surface objective,
                         bent by the person's current intent
    reasons              explain.ts, only from features that drove the score
    exploration          quality gated, adjacent to known topics, at fixed slots
    session re-rank      what this sitting consumed goes down
    diversity            creator, topic, kind, format, duplicates, per tier
    frequency            per page creator cap, per tier
    assembly             unseen tier, then recently seen tier

  THE TIER ORDER IS THE SEEN FIX. A post seen minutes ago can have a higher
  score than anything unseen (it is relevant; that is why it was shown). Scores
  alone put it back on top, which is what happened before 2026-09-24. Now no
  recently seen post can precede an unseen one, whatever the numbers, and the
  recently seen tier is only reached when the unseen tier runs out, so a small
  feed never goes empty.
*/

export type PipelineOptions = {
  context: RankingContext;
  candidates: Candidate[];
  profile: InterestProfile | null;
  signals: Map<string, PostSignals>;
  objective: Objective;
  freshnessProfile: FreshnessProfile;
  pageSize: number;
  firstStageKeep?: number;
  scorer?: Scorer;
  seeds?: SeedTokens;
  session?: SessionProfile | null;
  /* Seen state. Defaults to the profile's (history). The server merges the
     session cookie in, so what was just on screen counts immediately. */
  seen?: SeenState;
  distribution?: boolean;
  explorationCount?: number;
  followingSurface?: boolean;
  viewerKey?: string;
  /* Keep feature vectors and debug metadata, for tests and the admin view. */
  keepFeatures?: boolean;
  /* feed_v3 stages: source quotas, network features and reasons, the v3
     feature terms, same story clustering. Off, the pipeline is exactly v2. */
  v3?: boolean;
  /* feed_v3: what the people this person follows did with each post. */
  network?: Map<string, NetworkEngagement>;
  /* feed_v3: how many people this person follows, for the in network share. */
  followCount?: number;
  /* Filled when given: post id to the stage that dropped or demoted it, for
     the admin "why not" view. Never read by ranking. */
  trace?: Map<string, DropReason>;
};

/* Why a candidate is not where one might expect (admin debug only). */
export type DropReason =
  | `ineligible:${string}`
  | "out_of_audience"
  | "first_stage_cut"
  | "same_story"
  | "recently_seen"
  | "page_cap";

/* The one source a post is counted under, most specific first (config.ts). */
export function primarySource(sources: CandidateSource[]): CandidateSource {
  for (const s of SOURCE_ORDER) if (sources.includes(s)) return s;
  return sources[0] ?? "fresh";
}

/*
  feed_v3 source balancing for the first stage (config.ts SOURCE_QUOTA). Takes
  a list already in first stage order and keeps `keep` of it such that no source
  holds more than MAX_SHARE, the in network share sits between its floor and a
  ceiling that grows with follows, and fresh posts have a floor. Floors only
  reserve what exists, and whatever the caps leave empty is backfilled in order,
  so balancing never shrinks the pool: it only decides WHICH posts fill it.
*/
export function applySourceQuota<T extends { sources: CandidateSource[] }>(
  ordered: T[],
  keep: number,
  followCount: number,
): { kept: T[]; cut: T[] } {
  if (ordered.length <= keep) return { kept: [...ordered], cut: [] };
  const src = (t: T) => primarySource(t.sources);
  const inNet = (t: T) => IN_NETWORK_SOURCES.has(src(t));
  const inShare =
    SOURCE_QUOTA.IN_NETWORK_MIN +
    (SOURCE_QUOTA.IN_NETWORK_MAX - SOURCE_QUOTA.IN_NETWORK_MIN) * Math.min(1, followCount / SOURCE_QUOTA.FOLLOWS_FOR_MAX);
  const perSource = Math.ceil(SOURCE_QUOTA.MAX_SHARE * keep);
  const inCap = Math.ceil(inShare * keep);
  const inFloor = Math.min(Math.floor(SOURCE_QUOTA.IN_NETWORK_MIN * keep), ordered.filter(inNet).length);
  const freshFloor = Math.min(Math.floor(SOURCE_QUOTA.FRESH_MIN * keep), ordered.filter((t) => src(t) === "fresh").length);

  const taken = new Set<T>();
  const bySource = new Map<string, number>();
  let inCount = 0;
  const take = (t: T) => {
    taken.add(t);
    bySource.set(src(t), (bySource.get(src(t)) ?? 0) + 1);
    if (inNet(t)) inCount++;
  };
  /* Floors first, best of each. */
  for (const t of ordered.filter(inNet).slice(0, inFloor)) take(t);
  for (const t of ordered.filter((x) => src(x) === "fresh" && !taken.has(x)).slice(0, freshFloor)) take(t);
  /* Then in order, under the caps. */
  for (const t of ordered) {
    if (taken.size >= keep) break;
    if (taken.has(t)) continue;
    if ((bySource.get(src(t)) ?? 0) >= perSource) continue;
    if (inNet(t) && inCount >= inCap) continue;
    take(t);
  }
  /* Backfill: caps never leave the pool short. */
  for (const t of ordered) {
    if (taken.size >= keep) break;
    if (!taken.has(t)) take(t);
  }
  const kept = ordered.filter((t) => taken.has(t));
  const cut = ordered.filter((t) => !taken.has(t));
  return { kept, cut };
}

/*
  feed_v3: one story, shown once. Walks a scored list best first and holds back
  any post telling the same story as one already kept (text.ts sameStory),
  returning them separately so the caller can place them after every other
  unseen post. Nothing is removed here: an exact or near duplicate stays in the
  main list, where diversity removes it as v2 always did.
*/
export function splitSameStory<T extends { item: ContentItem }>(list: T[]): { kept: T[]; extras: T[] } {
  const kept: T[] = [];
  const extras: T[] = [];
  const opts = { windowHours: SAME_STORY.WINDOW_HOURS, jaccard: SAME_STORY.JACCARD, minSharedNames: SAME_STORY.MIN_SHARED_NAMES };
  for (const t of list) {
    const dup = kept.some((k) => !isNearDuplicate(k.item.body, t.item.body) && sameStory(k.item, t.item, opts));
    (dup ? extras : kept).push(t);
  }
  return { kept, extras };
}

/* The multiplier on a post still in its test stage, for somebody outside its
   current audience (D126). */
export const OUT_OF_AUDIENCE = 0.4;

/* Session consumed posts, in the session re-rank. */
export const SESSION_CONSUMED = 0.05;

/* Below this familiarity a post counts as unfamiliar, and may be explored.
   Familiarity is the strongest of long term relevance, this sitting's
   relevance, creator affinity and following: something that matches what the
   person is doing right now is not an exploration, whatever the long term
   profile says. */
export const EXPLORE_BELOW_FAMILIARITY = 0.3;

type Working = RankedItem & {
  firstStage: number;
  exploration: boolean;
  tier: Tier;
  relevance: number;
  familiarity: number;
  explorationValue: number;
};

function byAuthor(candidates: Candidate[]): Map<string, ContentItem[]> {
  const out = new Map<string, ContentItem[]>();
  for (const c of candidates) {
    const list = out.get(c.item.authorId) ?? [];
    list.push(c.item);
    out.set(c.item.authorId, list);
  }
  return out;
}

export function creatorStatsFor(
  authorItems: ContentItem[],
  signals: Map<string, PostSignals>,
): CreatorStats {
  const qualities = authorItems.map((i) => engagementQuality(signalsFor(signals, i.id), i).quality);
  let dupes = 0;
  for (let i = 0; i < authorItems.length; i++) {
    for (let j = 0; j < i; j++) {
      if (isNearDuplicate(authorItems[i].body, authorItems[j].body)) {
        dupes++;
        break;
      }
    }
  }
  const qualifiedReports = authorItems.reduce((a, i) => a + signalsFor(signals, i.id).qualifiedReports, 0);
  return {
    postQualities: qualities,
    duplicateShare: authorItems.length ? dupes / authorItems.length : 0,
    qualifiedReports,
  };
}

function tieBreak(a: { score: number; item: ContentItem }, b: { score: number; item: ContentItem }, salt: string): number {
  if (b.score !== a.score) return b.score - a.score;
  return hash32(`${salt}:${a.item.id}`) - hash32(`${salt}:${b.item.id}`);
}

export function mergeReasons(...lists: (string[] | undefined)[]): string[] {
  const out: string[] = [];
  for (const l of lists) for (const r of l ?? []) if (!out.includes(r)) out.push(r);
  return out;
}

/* Place exploration picks at fixed slots (never the top of the page), taking
   them out of wherever relevance had put them. */
export function placeExploration<T extends { item: ContentItem }>(ranked: T[], picks: T[]): T[] {
  if (picks.length === 0) return ranked;
  const ids = new Set(picks.map((p) => p.item.id));
  const out = ranked.filter((r) => !ids.has(r.item.id));
  let at: number = EXPLORATION.FIRST_SLOT;
  for (const p of picks) {
    out.splice(Math.min(at, out.length), 0, p);
    at += EXPLORATION.EVERY;
  }
  return out;
}

/*
  Session re-rank: what this sitting already consumed goes far down, recent
  creators and topic runs go down a little.
*/
export function personalize<T extends { item: ContentItem; score: number }>(
  items: T[],
  session: SessionProfile | null | undefined,
): T[] {
  if (!session || (session.consumed.size === 0 && session.recentAuthors.length === 0)) return items;
  return items
    .map((t) => {
      const recentSameAuthor = session.recentAuthors.slice(0, 3).includes(t.item.authorId);
      const topicRun =
        t.item.topicId !== null &&
        session.recentTopics.slice(0, 2).length === 2 &&
        session.recentTopics.slice(0, 2).every((x) => x === t.item.topicId);
      let m = 1;
      if (session.consumed.has(t.item.id)) m *= SESSION_CONSUMED;
      if (recentSameAuthor) m *= 0.6;
      if (topicRun) m *= 0.75;
      return { ...t, score: t.score * m };
    })
    .sort((a, b) => b.score - a.score);
}

/* The session re-rank, leaving exploration picks in their slots. */
function personalizeKeepingSlots(list: Working[], session: SessionProfile | null | undefined): Working[] {
  if (!session) return list;
  const slots = new Map<number, Working>();
  list.forEach((w, i) => {
    if (w.exploration) slots.set(i, w);
  });
  const rest = personalize(list.filter((w) => !w.exploration), session);
  const out: Working[] = [];
  let r = 0;
  for (let i = 0; i < list.length; i++) {
    const w = slots.get(i) ?? rest[r++];
    if (w) out.push(w);
  }
  return out;
}

/* What the person has had in front of them lately, for novelty. */
function buildExposure(
  pool: Map<string, ContentItem>,
  seen: SeenState,
  session: SessionProfile | null | undefined,
  now: number,
): Exposure {
  const topicCounts = new Map<string, number>(session?.topicCounts ?? []);
  const authorCounts = new Map<string, number>(session?.authorCounts ?? []);
  const mediaCounts = new Map<string, number>(session?.mediaCounts ?? []);
  const bodies: string[] = [];
  let total = [...topicCounts.values()].reduce((a, b) => a + b, 0);
  for (const [id, r] of seen) {
    /* Delivered but never on screen is no exposure (feed_v3 served state). */
    if (r.depth === "served") continue;
    if (hoursBetween(r.lastAt, now) > NOVELTY.WINDOW_HOURS) continue;
    const item = pool.get(id);
    if (!item) continue;
    total++;
    if (item.topicId) topicCounts.set(item.topicId, (topicCounts.get(item.topicId) ?? 0) + 1);
    authorCounts.set(item.authorId, (authorCounts.get(item.authorId) ?? 0) + 1);
    mediaCounts.set(item.media, (mediaCounts.get(item.media) ?? 0) + 1);
    if (r.depth !== "brief" && bodies.length < 30) bodies.push(item.body);
  }
  return { topicCounts, authorCounts, mediaCounts, bodies, total };
}

export function runPipeline(opts: PipelineOptions): RankedItem[] {
  const { context, candidates, profile, signals, freshnessProfile, pageSize } = opts;
  const now = context.now;
  const scorer = opts.scorer ?? heuristicScorer;
  const keep = opts.firstStageKeep ?? 120;
  const salt = `${context.algorithm}:${opts.viewerKey ?? context.userId ?? "anon"}:${Math.floor(now / 86_400_000)}`;
  const objective = objectiveForIntent(opts.objective, context.intent);
  const seen: SeenState = opts.seen ?? profile?.seen ?? new Map();
  const cold = isColdStart(profile);

  const authors = byAuthor(candidates);
  const pool = new Map(candidates.map((c) => [c.item.id, c.item]));
  const spamOf = new Map<string, number>();
  for (const c of candidates) spamOf.set(c.item.id, spamRisk(c.item, authors.get(c.item.authorId) ?? []));

  /* Bodies of posts this person rejected, for "reduce similar content". The
     rejected posts themselves are ineligible below. */
  const rejectedBodies = profile
    ? [...profile.notInterested].map((id) => pool.get(id)?.body).filter((b): b is string => Boolean(b))
    : [];

  /* 1. Eligibility. */
  const eligible = applySafety(
    candidates,
    (id) => signalsFor(signals, id),
    profile,
    (item) => spamOf.get(item.id) ?? 0,
    { followingSurface: opts.followingSurface },
  );
  const trace = opts.trace;
  if (trace && eligible.length < candidates.length) {
    const ok = new Set(eligible.map((c) => c.item.id));
    for (const c of candidates) {
      if (ok.has(c.item.id)) continue;
      const e = contentIsRecommendationEligible(c.item, signalsFor(signals, c.item.id), profile, {
        spam: spamOf.get(c.item.id) ?? 0,
        followingSurface: opts.followingSurface,
      });
      trace.set(c.item.id, `ineligible:${e.reason}`);
    }
  }

  const viral: Map<string, ViralAssessment> = detectBreakoutContent(
    eligible.map((c) => ({ item: c.item, signals: signalsFor(signals, c.item.id) })),
    now,
  );

  /* 2. Distribution. */
  const dist = new Map<string, DistributionState>();
  const outOfAudience = new Set<string>();
  for (const c of eligible) {
    const s = signalsFor(signals, c.item.id);
    const state = distributionStage(c.item, s, now, viral.get(c.item.id));
    dist.set(c.item.id, state);
    if (!opts.distribution) continue;
    const followed = profile?.followedAuthors.has(c.item.authorId) ?? false;
    const own = context.userId !== null && c.item.authorId === context.userId;
    if (followed || own) continue;
    const rel = profile && !cold ? interestIn(profile, c.item).overall : 0;
    if (!inAudience(opts.viewerKey ?? context.userId ?? "anon", c.item.id, state, rel)) {
      outOfAudience.add(c.item.id);
      trace?.set(c.item.id, "out_of_audience");
    }
  }

  /* 3. Seen tiers. */
  const bodies = new Map(candidates.map((c) => [c.item.id, c.item.body]));
  const { unseen, recentlySeen } = partitionBySeen(eligible, seen, now, bodies);
  if (trace) for (const c of recentlySeen) trace.set(c.item.id, "recently_seen");

  /* Context shared by every feature extraction. */
  const exposure = buildExposure(pool, seen, opts.session, now);
  const adjacency = topicAdjacency(candidates.map((c) => c.item));
  const userTopics = [
    ...(profile && !cold ? topKeys(profile, "topic", 5) : []),
    ...(opts.session ? [...opts.session.topicCounts.keys()] : []),
  ];
  const knownAuthors = new Set<string>([
    ...(profile ? topKeys(profile, "author", 50) : []),
    ...(profile?.followedAuthors ?? []),
  ]);

  /* 4. First stage, per tier. */
  const stage = (list: Candidate[], tier: Tier): Working[] =>
    list
      .map((c) => {
        const s = signalsFor(signals, c.item.id);
        const m = profile && !cold ? interestIn(profile, c.item) : null;
        const follows = profile?.followedAuthors.has(c.item.authorId) ?? false;
        const engagers = totalUniq(s, "like") + totalUniq(s, "comment") + totalUniq(s, "save") + totalUniq(s, "repost");
        const fs =
          firstStageScore({
            relevance: m?.overall ?? 0,
            authorAffinity: m?.author ?? 0,
            freshness: calculateFreshness(c.item, now, freshnessProfile),
            engagers,
            follows,
          }) * (outOfAudience.has(c.item.id) ? OUT_OF_AUDIENCE : 1);
        const w: Working = {
          item: c.item,
          score: fs,
          firstStage: fs,
          reasons: [],
          sources: [...c.sources],
          exploration: false,
          tier,
          relevance: m?.overall ?? 0,
          familiarity: Math.max(m?.overall ?? 0, follows ? 1 : 0),
          explorationValue: 0,
        };
        return w;
      })
      .sort((a, b) => tieBreak(a, b, salt));

  const staged1 = stage(unseen, "unseen");
  const staged2 = stage(recentlySeen, "recently_seen");
  /* feed_v3 balances sources while choosing the slice; v2 takes the top. */
  const split1 = opts.v3
    ? applySourceQuota(staged1, keep, opts.followCount ?? profile?.followedAuthors.size ?? 0)
    : { kept: staged1.slice(0, keep), cut: staged1.slice(keep) };
  const kept1 = split1.kept;
  const leftovers1 = split1.cut;
  if (trace) for (const w of leftovers1) trace.set(w.item.id, "first_stage_cut");
  const kept2 = staged2.slice(0, keep);

  /* 5 to 7. Features, score and reasons. */
  const heavy = (w: Working, exploration = false): Working => {
    const authorItems = authors.get(w.item.authorId) ?? [];
    const others = authorItems.filter((i) => i.id !== w.item.id);
    const s = signalsFor(signals, w.item.id);
    const social = w.sources.includes("social");
    let rejected = 0;
    for (const b of rejectedBodies) rejected = Math.max(rejected, semantic.similarity(b, w.item.body));
    const expValue = explorationValue(w.item, {
      adjacency,
      userTopics,
      contentQuality: contentQuality(w.item),
      engagementQuality: engagementQuality(s, w.item).quality,
      freshness: calculateFreshness(w.item, now, freshnessProfile),
      knownAuthor: knownAuthors.has(w.item.authorId),
      exposure,
    });
    const { features, match, similarVia } = extractFeatures(w.item, {
      now,
      profile,
      signals: s,
      freshnessProfile,
      creator: creatorStatsFor(others, signals),
      viral: viral.get(w.item.id),
      distribution: opts.distribution ? dist.get(w.item.id) : undefined,
      seeds: opts.seeds ?? NO_SEEDS,
      session: opts.session,
      exposure,
      seen: seen.get(w.item.id),
      social,
      spamRisk: spamOf.get(w.item.id) ?? 0,
      duplicateRisk: others.some((o) => o.createdAt < w.item.createdAt && isNearDuplicate(o.body, w.item.body)) ? 1 : 0,
      similarToRejected: rejected >= NEGATIVE.SIMILAR_TO_REJECTED ? rejected : 0,
      exploration,
      explorationValue: expValue,
      v3: opts.v3,
      network: opts.v3 ? opts.network?.get(w.item.id) : undefined,
    });
    const audienceFactor = outOfAudience.has(w.item.id) ? OUT_OF_AUDIENCE : 1;
    const score = value(scorer.predict(features), features, objective) * audienceFactor;
    const va = viral.get(w.item.id);
    const explanation = explainRanking({
      features,
      match,
      similarVia,
      ageHours: hoursBetween(w.item.createdAt, now),
      social,
      tier: w.tier,
      exploration,
      breakout: Boolean(va?.breakout),
      viralState: va ? viralState(va) : null,
      network: opts.v3 ? opts.network?.get(w.item.id) : undefined,
    });
    const record = seen.get(w.item.id);
    return {
      ...w,
      score,
      exploration,
      relevance: features.relevance,
      /* feed_v3: a post the people you follow are talking about is not
         unfamiliar, so it is never "something different to try". */
      familiarity: Math.max(
        features.relevance,
        features.sessionRelevance,
        features.authorAffinity,
        features.follows,
        opts.v3 ? features.socialRelevance : 0,
      ),
      explorationValue: expValue,
      explanation,
      reasons: [explanation.primary, ...explanation.supporting].filter((r): r is NonNullable<typeof r> => r !== null),
      features: opts.keepFeatures ? features : undefined,
      debug: opts.keepFeatures
        ? {
            tier: w.tier,
            seenAt: record?.lastAt ?? null,
            seenDepth: record?.depth ?? null,
            seenSource: record?.source ?? null,
            seenPenalty: seenPenalty(record, now),
            firstStage: w.firstStage,
            penalties: {
              seen: features.seen,
              repetition: 1 - features.novelty,
              saturation: features.saturation,
              negative: features.negativeFeedback,
              spam: features.spamRisk,
              duplicate: features.duplicateRisk,
              outOfAudience: audienceFactor < 1 ? 1 - audienceFactor : 0,
            },
          }
        : undefined,
    };
  };

  const scoredAll = kept1.map((w) => heavy(w)).sort((a, b) => tieBreak(a, b, salt));
  /* feed_v3: one story, shown once. The rest of a story follows every other
     unseen post, with its own truthful reasons (it was not seen). */
  const story = opts.v3 ? splitSameStory(scoredAll) : { kept: scoredAll, extras: [] as Working[] };
  const scored1 = story.kept;
  if (trace) for (const w of story.extras) trace.set(w.item.id, "same_story");
  /* The seen tier comes back LEAST RECENTLY SEEN FIRST, not by score. Ordered
     by score it was identical on every reload once everything had been seen
     (founder, 2026-09-24: "when I reload I see the same"); ordered by when it
     was last on screen, whatever was just looked at goes to the back and the
     feed rotates, the way X and TikTok resurface older posts. */
  const lastSeen = (w: Working) => seen.get(w.item.id)?.lastAt ?? 0;
  const scored2 = kept2
    .map((w) => heavy(w))
    .sort((a, b) => lastSeen(a) - lastSeen(b) || tieBreak(a, b, salt));

  /* 8. Exploration, from the unseen tier only: weak matches the first stage
     kept, and posts it left behind. Quality gated (explorationValue is 0 below
     the quality floor), best value first, with a small per day jitter so near
     equals rotate. */
  /* feed_v3: exploration is a SHARE OF THE POOL as well as of the pages. v2
     planned slots for all five pages (D132), which on a small pool with no
     familiar posts (every signed out visitor) made every post an exploration
     pick, so the order was exploration value and the score never applied.
     The pool is fixed for a frozen clock, so the cap keeps D132's stability. */
  const planned = Math.max(0, opts.explorationCount ?? 0);
  /* And exploration is a departure from something familiar: with nothing
     familiar in the pool (a signed out visitor, a new account) there is
     nothing to depart from, and the score, which carries the cold start
     weights on freshness and quality, orders the feed; diversity still mixes
     its topics. */
  const familiar = scored1.filter((w) => w.familiarity >= EXPLORE_BELOW_FAMILIARITY).length;
  const wanted = opts.v3
    ? familiar === 0
      ? 0
      : Math.min(planned, Math.round(EXPLORATION.MAX_SHARE * scored1.length))
    : planned;
  let tier1: Working[] = scored1;
  if (wanted > 0) {
    const weakIds = new Set(scored1.filter((w) => w.familiarity < EXPLORE_BELOW_FAMILIARITY).map((w) => w.item.id));
    const pickFrom = [...scored1.filter((w) => weakIds.has(w.item.id)), ...leftovers1];
    const picks = pickFrom
      .map((w) => heavy(w, true))
      .filter((w) => w.explorationValue > 0 && w.familiarity < EXPLORE_BELOW_FAMILIARITY)
      .map((w) => ({
        w,
        /* feed_v3: an exploration pick is held to the same bar as the rest:
           bait and a recent delivery lower its claim to a slot. */
        v:
          w.explorationValue *
            (opts.v3 ? (1 - 0.5 * baitRisk(w.item.body)) * (1 - 0.55 * seenPenalty(seen.get(w.item.id), now)) : 1) +
          unitHash(`${salt}:x:${w.item.id}`) * 0.05,
      }))
      .sort((a, b) => b.v - a.v)
      .slice(0, wanted)
      .map((x) => x.w);
    tier1 = placeExploration(scored1, picks);
  }

  /* 9 to 11. Session re-rank, diversity and frequency, per tier. The creator
     cap runs per tier so it can never pull a recently seen post above an
     unseen one. Seen handling lives in the tiers, so the old seen demotion in
     applyFrequencyControls is switched off here (profile null). */
  const preferredMedia =
    (opts.session?.mediaCounts.get("video") ?? 0) >= 3 || (profile?.seeds.watched.length ?? 0) >= 5 ? "video" : null;
  const finish = (list: Working[]) =>
    applyFrequencyControls(applyDiversity(personalizeKeepingSlots(list, opts.session), { preferredMedia }), null, pageSize, now);

  const ordered = [...finish(tier1), ...finish(story.extras), ...finish(scored2)];

  return ordered.map(({ item, score, reasons, sources, features, explanation, debug }) => ({
    item,
    score,
    reasons,
    sources,
    ...(explanation ? { explanation } : {}),
    ...(features ? { features } : {}),
    ...(debug ? { debug } : {}),
  }));
}

/* Pages from a ranked list. Pages accumulate: page 2 is the first two pages,
   which is how "Show more" works without a client side list. */
export function assembleFeed(ranked: RankedItem[], pageSize: number, pages: number) {
  const n = Math.max(1, pages) * pageSize;
  return { items: ranked.slice(0, n), complete: ranked.length <= n };
}

/*
  The fallback: eligible posts in time order, unseen before recently seen.
  Used when a ranking stage throws.
*/
export function fallbackRanking(
  candidates: Candidate[],
  signals: Map<string, PostSignals>,
  profile: InterestProfile | null,
  seen: SeenState = profile?.seen ?? new Map(),
  now: number = Date.now(),
): RankedItem[] {
  const eligible = applySafety(candidates, (id) => signalsFor(signals, id), profile, () => 0);
  const byTime = (a: Candidate, b: Candidate) => b.item.createdAt - a.item.createdAt;
  const fresh = eligible.filter((c) => !isRecentlySeen(seen.get(c.item.id), now)).sort(byTime);
  const old = eligible.filter((c) => isRecentlySeen(seen.get(c.item.id), now)).sort(byTime);
  return [
    ...fresh.map((c) => ({ item: c.item, score: 0, reasons: ["fresh" as const], sources: c.sources })),
    ...old.map((c) => ({ item: c.item, score: 0, reasons: ["resurfaced" as const], sources: c.sources })),
  ];
}
