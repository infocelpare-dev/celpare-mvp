import { INTENT, SATURATION, type Intent } from "./config";
import { clamp01, logistic, saturate } from "./math";
import type { ActionPredictions, FeedSurface, RankingFeatures } from "./types";

/*
  From features to a score, in two explicit steps.

    features -> predict()  -> P(like), P(save), P(not interested), ...
    predictions -> value() -> one number, using THIS SURFACE's objective

  WHY NOT ONE SCORE. `likes*10 + comments*20` is the thing the brief rules out,
  and it cannot be replaced by a model without rewriting every caller. Here the
  model boundary is `Scorer.predict`: today `heuristicScorer` estimates the
  probabilities from normalised features with fixed, readable coefficients. A
  trained model is a second Scorer with the same signature, `mlScorer`, and
  nothing else in the pipeline changes.

  THERE IS NO TRAINED MODEL. Celpare does not have the data to train one, and
  the heuristic is labelled as what it is.
*/

export interface Scorer {
  id: string;
  predict(features: RankingFeatures): ActionPredictions;
}

/*
  The heuristic. Each probability is a logistic over the features that plausibly
  drive that action, so a feature can raise one action and not another: a strong
  save rate lifts P(save) far more than P(like). The intercepts put a neutral
  post at a modest probability rather than 50%.
*/
export const heuristicScorer: Scorer = {
  id: "heuristic_v1",
  predict(f) {
    const personal = 0.55 * f.relevance + 0.45 * f.authorAffinity;
    const negative = f.negativeFeedback;
    return {
      like: logistic(-2.4 + 2.2 * personal + 1.4 * f.engagementQuality + 0.5 * f.contentQuality - 1.5 * negative),
      /* conversationDepth is feed_v3 only (0 otherwise): a thread the author
         answers invites the next reply. */
      comment: logistic(
        -3.4 + 1.8 * personal + 1.6 * f.conversationQuality + 1.0 * (f.conversationDepth ?? 0) + 0.8 * f.engagementQuality - 1.5 * negative,
      ),
      share: logistic(-3.8 + 1.4 * personal + 2.2 * f.shareability + 0.8 * f.viral - 1.5 * negative),
      save: logistic(-3.6 + 1.6 * f.relevance + 2.2 * f.saveability + 0.8 * f.contentQuality - 1.5 * negative),
      follow: logistic(-4 + 2.2 * f.relevance + 1.2 * f.creatorQuality + 0.6 * (f.socialRelevance ?? 0) - 2.5 * f.follows),
      profileVisit: logistic(-3 + 1.5 * personal + 0.8 * f.creatorQuality),
      videoWatch: f.isVideo ? logistic(-1.4 + 1.8 * personal + 1.6 * f.watchQuality - 1.2 * negative) : 0,
      videoCompletion: f.isVideo ? logistic(-2 + 1.4 * personal + 2.4 * f.watchQuality - 1.2 * negative) : 0,
      rewatch: f.isVideo ? logistic(-4 + 2.4 * f.watchQuality + 1.2 * personal) : 0,
      notInterested: logistic(
        -4 + 3.5 * negative + 1.2 * f.seen + 1.5 * (1 - f.relevance) * (1 - f.follows) * 0.5 + 1.5 * f.spamRisk + 1.2 * (f.saturation ?? 0) + 1.5 * (f.similarToRejected ?? 0),
      ),
      report: logistic(-6 + 4 * f.spamRisk + 1.5 * negative),
      /* Meaningful continuation, not endless scrolling: relevant, good and
         new keeps a session going; repetitive or saturated ends it. */
      sessionContinuation: logistic(
        -0.5 + 1.2 * personal + 0.8 * f.engagementQuality + 0.6 * f.freshness + 0.5 * (f.novelty ?? 1) - 1.2 * negative - 0.8 * (f.saturation ?? 0),
      ),
    };
  },
};

/*
  The slot a trained ranker fills. It is declared so the seam is real and
  typed, and it deliberately refuses to run: returning heuristic numbers under
  an "ml" name would be exactly the pretence the brief forbids.
*/
export const mlScorer: Scorer | null = null;

/* The names the brief uses, pointing at the one real implementation. */
export function heuristicPredictEngagement(f: RankingFeatures): ActionPredictions {
  return heuristicScorer.predict(f);
}
export const mlPredictEngagement: ((f: RankingFeatures) => ActionPredictions) | null = null;
export function predictEngagement(f: RankingFeatures): ActionPredictions {
  return (mlScorer ?? heuristicScorer).predict(f);
}

/*
  What each surface values. Weights on predicted actions, penalties on the bad
  ones, and a small direct weight on freshness, quality and exploration that
  predictions do not cover. Every surface has its own row: For You, Following
  and Reels want different things, and no surface borrows another's objective.
*/
export type Objective = {
  actions: Partial<Record<keyof ActionPredictions, number>>;
  freshness: number;
  quality: number;
  exploration: number;
  distribution: number;
  viral: number;
  /* v2 weights: session relevance and social relevance as direct support,
     and how strongly repetition (1 - novelty) and session saturation cut in. */
  session: number;
  social: number;
  novelty: number;
  saturation: number;
  /* How much the support terms (freshness, quality, exploration, distribution,
     viral) depend on relevance. 0 leaves them as they are; 0.5 halves them for
     an irrelevant post. This is D97's rule carried over from search: relevance
     dominates by arithmetic, so a popular post cannot outrank a relevant one on
     popularity alone. A cold start person has relevance 0 everywhere, so for
     them it scales every post alike and changes no order. */
  relevanceGate: number;
  /* Multiplicative penalties, 0..1 each. */
  seenPenalty: number;
  duplicatePenalty: number;
  spamPenalty: number;
  /* feed_v3, absent on every v2 row. */
  /* Direct weight on the author taking part in the conversation (relevance gated). */
  conversation?: number;
  /* Direct weight on beating the creator's own usual (relevance gated). */
  outperformance?: number;
  /* Multiplicative, on baitRisk. */
  baitPenalty?: number;
};

export const OBJECTIVES: Record<"for_you" | "for_you_v3" | "following" | "reels" | "discussions" | "content", Objective> = {
  for_you: {
    actions: {
      like: 1,
      comment: 1.6,
      share: 2,
      save: 2.4,
      follow: 1.5,
      profileVisit: 0.5,
      sessionContinuation: 1.2,
      notInterested: -4,
      report: -8,
    },
    freshness: 0.6,
    quality: 0.5,
    exploration: 0.25,
    distribution: 0.35,
    viral: 0.4,
    session: 0.5,
    social: 0.3,
    novelty: 0.35,
    saturation: 1,
    relevanceGate: 0.5,
    seenPenalty: 0.55,
    duplicatePenalty: 0.8,
    spamPenalty: 0.9,
  },
  /*
    feed_v3, conversation first, after X's published heavy ranker weights and
    LinkedIn's emphasis on conversations: a comment is worth three likes, a
    follow two, a profile visit one. Not X's numbers (a reply there is worth 27
    likes on a platform where likes are nearly free); the same order, tuned for
    a small community. Saves and shares stay the strongest private and public
    signals. Placeholders until feed_events has traffic, like every weight here.
  */
  for_you_v3: {
    actions: {
      like: 1,
      comment: 3,
      share: 2,
      save: 2.4,
      follow: 2,
      profileVisit: 1,
      sessionContinuation: 1.2,
      notInterested: -4,
      report: -8,
    },
    freshness: 0.6,
    quality: 0.5,
    exploration: 0.25,
    distribution: 0.35,
    viral: 0.4,
    session: 0.5,
    social: 0.45,
    novelty: 0.35,
    saturation: 1,
    relevanceGate: 0.5,
    seenPenalty: 0.55,
    duplicatePenalty: 0.8,
    spamPenalty: 0.9,
    conversation: 0.4,
    outperformance: 0.3,
    baitPenalty: 0.5,
  },
  following: {
    actions: {
      like: 1,
      comment: 1.4,
      share: 1,
      save: 1.6,
      sessionContinuation: 0.6,
      notInterested: -3,
      report: -6,
    },
    /* Following is a timeline first. */
    freshness: 1.6,
    quality: 0.25,
    exploration: 0,
    distribution: 0,
    viral: 0,
    session: 0.2,
    social: 0,
    novelty: 0.2,
    saturation: 0.5,
    relevanceGate: 0,
    seenPenalty: 0.6,
    duplicatePenalty: 0.8,
    spamPenalty: 0.9,
  },
  reels: {
    actions: {
      videoWatch: 1.2,
      videoCompletion: 2,
      rewatch: 1.2,
      like: 0.8,
      share: 1.6,
      save: 1.4,
      follow: 1.6,
      sessionContinuation: 1.6,
      notInterested: -4,
      report: -8,
    },
    freshness: 0.5,
    quality: 0.4,
    exploration: 0.3,
    distribution: 0.35,
    viral: 0.5,
    session: 0.5,
    social: 0.2,
    novelty: 0.4,
    saturation: 1,
    relevanceGate: 0.4,
    seenPenalty: 0.75,
    duplicatePenalty: 0.8,
    spamPenalty: 0.9,
  },
  discussions: {
    actions: { comment: 2.5, like: 0.6, save: 1, notInterested: -4, report: -8 },
    freshness: 0.8,
    quality: 0.8,
    exploration: 0,
    distribution: 0,
    viral: 0,
    session: 0.3,
    social: 0.1,
    novelty: 0.2,
    saturation: 0.5,
    relevanceGate: 0.3,
    seenPenalty: 0.4,
    duplicatePenalty: 0.8,
    spamPenalty: 0.9,
  },
  content: {
    actions: { like: 1, save: 2, comment: 1, notInterested: -4, report: -8 },
    freshness: 0.3,
    quality: 0.6,
    exploration: 0,
    distribution: 0,
    viral: 0,
    session: 0.2,
    social: 0,
    novelty: 0.2,
    saturation: 0.5,
    relevanceGate: 0.3,
    seenPenalty: 0.5,
    duplicatePenalty: 0.8,
    spamPenalty: 0.9,
  },
};

export function objectiveFor(surface: FeedSurface): Objective {
  switch (surface) {
    case "following":
      return OBJECTIVES.following;
    case "reels":
      return OBJECTIVES.reels;
    case "discussions":
      return OBJECTIVES.discussions;
    case "content":
      return OBJECTIVES.content;
    default:
      return OBJECTIVES.for_you;
  }
}

/* Predictions to one number under an objective. */
export function value(pred: ActionPredictions, f: RankingFeatures, objective: Objective): number {
  let v = 0;
  for (const [action, w] of Object.entries(objective.actions) as [keyof ActionPredictions, number][]) {
    v += w * pred[action];
  }
  const support =
    objective.freshness * f.freshness +
    objective.quality * (0.5 * f.contentQuality + 0.5 * f.creatorQuality) +
    objective.exploration * f.exploration +
    objective.distribution * f.distribution +
    objective.viral * f.viral +
    /* feed_v3 terms; zero on every v2 objective. Outperformance only ever adds:
       a post below its creator's usual is judged on itself, not punished for
       the creator's good days. */
    (objective.conversation ?? 0) * (f.conversationDepth ?? 0) +
    (objective.outperformance ?? 0) * Math.max(0, (f.outperformance ?? 0.5) - 0.5) * 2;
  v += support * (1 - objective.relevanceGate + objective.relevanceGate * f.relevance);
  /* Session and social relevance are relevance, so they are not gated by it. */
  v += objective.session * (f.sessionRelevance ?? 0) + objective.social * (f.socialRelevance ?? 0);
  /* Exploration value only counts for posts placed as exploration. */
  v += objective.exploration * f.exploration * (f.explorationValue ?? 0);

  /* Repetition and saturation cut in multiplicatively, like the penalties
     below: a relevant post that is the fifth of its kind this sitting should
     wait. Saturation is session only (config.ts SATURATION). */
  v *= 1 - objective.novelty * (1 - (f.novelty ?? 1));
  v *= 1 - SATURATION.PENALTY * objective.saturation * (f.saturation ?? 0);

  /* Penalties multiply, so a duplicate or a spammy post cannot be rescued by
     being relevant. */
  v *= 1 - objective.seenPenalty * f.seen;
  v *= 1 - objective.duplicatePenalty * f.duplicateRisk;
  v *= 1 - objective.spamPenalty * f.spamRisk;
  v *= 1 - (objective.baitPenalty ?? 0) * (f.baitRisk ?? 0);
  return v;
}

/* The heavy score: predict with the active scorer, value under the objective. */
export function heuristicScore(f: RankingFeatures, objective: Objective, scorer: Scorer = heuristicScorer): number {
  return value(scorer.predict(f), f, objective);
}

/*
  The cheap first stage: a few already known numbers, no predictions. Run over
  the whole candidate pool so the heavy stage only sees the best slice of it.
*/
export function firstStageScore(input: {
  relevance: number;
  authorAffinity: number;
  freshness: number;
  engagers: number;
  follows: boolean;
}): number {
  return (
    1.2 * input.relevance +
    0.9 * input.authorAffinity +
    0.8 * input.freshness +
    0.5 * saturate(input.engagers, 5) +
    (input.follows ? 0.4 : 0)
  );
}

export function clampFeatures(f: RankingFeatures): RankingFeatures {
  const out = { ...f };
  for (const k of Object.keys(out) as (keyof RankingFeatures)[]) {
    const v = out[k];
    if (v !== undefined) out[k] = clamp01(v);
  }
  return out;
}

/*
  The objective as the person's current intent bends it (config.ts INTENT).
  Research leans on quality and the session; deep interest cuts exploration;
  social leans on the creator; browsing and topic exploration want variety.
*/
export function objectiveForIntent(base: Objective, intent: Intent | undefined): Objective {
  if (!intent || intent === "browsing") {
    const m = INTENT.browsing;
    return { ...base, exploration: base.exploration * m.exploration, novelty: clamp01(base.novelty * m.novelty) };
  }
  const m = INTENT[intent];
  return {
    ...base,
    session: base.session * m.session,
    social: base.social * m.author,
    quality: base.quality * m.quality,
    exploration: base.exploration * m.exploration,
    novelty: clamp01(base.novelty * m.novelty),
  };
}
