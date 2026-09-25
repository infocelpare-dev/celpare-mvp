import { SESSION } from "./config";
import { freshnessScore, type FreshnessProfile } from "./freshness";
import { interestIn, isColdStart, type InterestMatch, type SessionProfile } from "./interests";
import { clamp01, saturate } from "./math";
import { noveltyOf, saturationOf, NO_EXPOSURE, type Exposure } from "./novelty";
import {
  baitRisk,
  contentQuality,
  conversationDepth,
  conversationQuality,
  creatorQuality,
  engagementQuality,
  outperformance,
  type CreatorStats,
} from "./quality";
import { totalUniq } from "./signals";
import { tokenize } from "./text";
import type {
  ContentItem,
  InterestProfile,
  NetworkEngagement,
  PostSignals,
  RankingFeatures,
  SeenRecord,
} from "./types";
import type { ViralAssessment } from "./viral";
import type { DistributionState } from "./distribution";
import { distributionBoost } from "./distribution";
import { seenPenalty } from "./seen";

/*
  Feature extraction: extractFeatures(user, content, context) -> RankingFeatures.

  The only place a raw fact becomes a ranking input, and every output is 0..1.
  Scoring never sees a count, a timestamp or a row; it sees these, which is what
  lets a learned model replace the heuristic scorer with the same inputs.
*/

/*
  The posts a person liked, saved and watched, each with its own words. Kept
  per post, not merged, for one reason: a post must never be "similar to what
  you watched" because it IS what you watched. The candidate's own entry is
  skipped (found 2026-09-24, when a resurfaced post explained itself).
*/
export type SeedTokens = {
  liked: Map<string, Set<string>>;
  saved: Map<string, Set<string>>;
  watched: Map<string, Set<string>>;
};

export const NO_SEEDS: SeedTokens = { liked: new Map(), saved: new Map(), watched: new Map() };

export type FeatureContext = {
  now: number;
  profile: InterestProfile | null;
  signals: PostSignals;
  freshnessProfile: FreshnessProfile;
  creator?: CreatorStats;
  viral?: ViralAssessment;
  distribution?: DistributionState;
  seeds?: SeedTokens;
  session?: SessionProfile | null;
  exposure?: Exposure;
  seen?: SeenRecord;
  /* The post arrived through a reposted-by-someone-you-follow source. */
  social?: boolean;
  spamRisk?: number;
  duplicateRisk?: number;
  similarToRejected?: number;
  exploration?: boolean;
  explorationValue?: number;
  /* feed_v3 only. Without it the vector is exactly v2's. */
  v3?: boolean;
  /* What the people this person follows did with the post, counts only. */
  network?: NetworkEngagement;
};

/* feed_v3: the people you follow engaging with a post, 0..1. Commenting and
   reposting are public acts and count fully; likes (only ever present when two
   or more followed people liked it) count a little less. */
export function networkScore(n: NetworkEngagement | undefined): number {
  if (!n) return 0;
  return saturate(0.6 * n.likers + n.commenters + n.reposters, 2);
}

export type ExtractedFeatures = {
  features: RankingFeatures;
  match: InterestMatch | null;
  /* Which seed kind the similarity came from, for a truthful reason. */
  similarVia: "saved" | "watched" | "liked" | null;
};

/* Best overlap with any seed post other than the candidate itself. */
function overlap(itemId: string, tokens: string[], seeds: Map<string, Set<string>>): number {
  if (seeds.size === 0 || tokens.length === 0) return 0;
  let best = 0;
  for (const [id, set] of seeds) {
    if (id === itemId || set.size === 0) continue;
    let shared = 0;
    for (const t of tokens) if (set.has(t)) shared++;
    if (shared > best) best = shared;
  }
  return saturate(best, 3);
}

function sessionAffinity(session: SessionProfile, item: ContentItem, tokens: string[]): { pos: number; neg: number } {
  const topicKey = item.topicId ? `topic:${item.topicId}` : null;
  const authorKey = `author:${item.authorId}`;
  let pos = (topicKey ? session.interests.get(topicKey) ?? 0 : 0) + (session.interests.get(authorKey) ?? 0) * 0.7;
  let neg = (topicKey ? session.negative.get(topicKey) ?? 0 : 0) + (session.negative.get(authorKey) ?? 0) * 0.7;
  for (const t of tokens) {
    pos += (session.interests.get(`term:${t}`) ?? 0) * 0.3;
    neg += (session.negative.get(`term:${t}`) ?? 0) * 0.3;
  }
  return { pos: saturate(pos, 1), neg: saturate(neg, 1) };
}

export function extractFeatures(item: ContentItem, ctx: FeatureContext): ExtractedFeatures {
  const tokens = tokenize(item.body, 60);
  const profile = ctx.profile;
  const cold = isColdStart(profile);
  const match = profile && !cold ? interestIn(profile, item, tokens) : null;

  const seeds = ctx.seeds ?? NO_SEEDS;
  const simSaved = overlap(item.id, tokens, seeds.saved);
  const simWatched = overlap(item.id, tokens, seeds.watched);
  const simLiked = overlap(item.id, tokens, seeds.liked);
  const semantic = Math.max(simSaved, simWatched, simLiked);
  const similarVia =
    semantic === 0 ? null : simSaved === semantic ? "saved" : simWatched === semantic ? "watched" : "liked";

  const eng = engagementQuality(ctx.signals, item);
  const follows = profile?.followedAuthors.has(item.authorId) ? 1 : 0;

  const session =
    ctx.session && ctx.session.lastAt > 0 ? sessionAffinity(ctx.session, item, tokens) : { pos: 0, neg: 0 };

  const relevance = clamp01(
    (match ? Math.max(match.overall, 0.8 * semantic) : 0.5 * semantic) + SESSION.RELEVANCE_WEIGHT * session.pos,
  );

  const rejected = clamp01(ctx.similarToRejected ?? 0);
  const negative = clamp01(
    Math.max(match?.negative ?? 0, session.neg * 0.8, clamp01(eng.negativeRate / 0.1) * 0.7, rejected * 0.6),
  );

  const audience = Math.max(1, totalUniq(ctx.signals, "impression"), totalUniq(ctx.signals, "watch"));
  const watchQuality =
    item.media === "video"
      ? clamp01(0.45 * eng.completionRate + 0.35 * eng.watchDepth + 0.2 * saturate(totalUniq(ctx.signals, "rewatch") / audience, 0.1))
      : 0;

  const authorAffinity = clamp01(Math.max(match?.author ?? 0, follows * 0.8));

  const features: RankingFeatures = {
    relevance,
    authorAffinity,
    topicAffinity: clamp01(match?.topic ?? 0),
    semantic,
    follows,
    contentQuality: contentQuality(item),
    creatorQuality: creatorQuality(ctx.creator),
    engagementQuality: eng.quality,
    conversationQuality: conversationQuality(ctx.signals),
    shareability: clamp01(eng.shareRate / 0.04),
    saveability: clamp01(eng.saveRate / 0.05),
    watchQuality,
    freshness: freshnessScore(item, ctx.signals, ctx.now, ctx.freshnessProfile, eng.quality),
    viral: clamp01(ctx.viral?.score ?? 0),
    negativeFeedback: negative,
    spamRisk: clamp01(ctx.spamRisk ?? 0),
    duplicateRisk: clamp01(ctx.duplicateRisk ?? 0),
    seen: seenPenalty(ctx.seen, ctx.now),
    exploration: ctx.exploration ? 1 : 0,
    distribution: ctx.distribution ? distributionBoost(ctx.distribution) : 0,
    isVideo: item.media === "video" ? 1 : 0,
    confidence: eng.confidence,
    sessionRelevance: session.pos,
    socialRelevance: clamp01(
      Math.max(follows, ctx.social ? 0.7 : 0, authorAffinity * 0.5, ctx.v3 ? networkScore(ctx.network) : 0),
    ),
    novelty: noveltyOf(item, ctx.exposure ?? NO_EXPOSURE),
    saturation: ctx.session ? saturationOf(item, ctx.session.topicCounts) : 0,
    explorationValue: clamp01(ctx.explorationValue ?? 0),
    similarToRejected: rejected,
    ...(ctx.v3
      ? {
          conversationDepth: conversationDepth(ctx.signals),
          outperformance: outperformance(eng.quality, ctx.creator),
          baitRisk: baitRisk(item.body),
        }
      : {}),
  };

  return { features, match, similarVia };
}
