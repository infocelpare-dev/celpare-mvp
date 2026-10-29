import { COMMENT_ALGORITHM, LIMITS, WEIGHTS, type FeatureName } from "./config";
import { computeFeatures, relationOf } from "./features";
import { computePenalties, type DuplicateIndex } from "./penalties";
import { activeLearnedRanker } from "./ltr";
import type { CommentRow, Features, RankContext, ReasonCode, Scored } from "./types";

/*
  comment_intelligence_v1's score:

    positive = sum(weight_i * feature_i)          0..1
    score    = positive * (1 - penalties.total)   0..1
    severe   : score - 2                          below every non severe comment

  The learned ranker hook is consulted and, in V1, always declines (ltr.ts).
*/

export const SCORING_VERSION = COMMENT_ALGORITHM;

const NAMES = Object.keys(WEIGHTS) as FeatureName[];

export function positiveScore(features: Features): { positive: number; contributions: Features } {
  const contributions = {} as Features;
  let positive = 0;
  for (const name of NAMES) {
    const c = WEIGHTS[name] * features[name];
    contributions[name] = c;
    positive += c;
  }
  return { positive, contributions };
}

/* The biggest single reason, as a short code for events and the debug view. */
export function reasonFor(s: Pick<Scored, "contributions" | "relation" | "pinned">): ReasonCode {
  if (s.pinned) return "own";
  const order: [FeatureName, ReasonCode][] = [
    ["relationship", s.relation === "friend" ? "friend" : "following"],
    ["postAuthor", "post_author"],
    ["helpful", "helpful"],
    ["relevance", "relevant"],
    ["replies", "discussed"],
    ["freshness", "fresh"],
  ];
  let best: ReasonCode = "fresh";
  let max = -1;
  for (const [name, code] of order) {
    if (name === "relationship" && !s.relation) continue;
    if (s.contributions[name] > max) {
      max = s.contributions[name];
      best = code;
    }
  }
  return best;
}

export function isOwnFresh(row: CommentRow, ctx: RankContext): boolean {
  if (!ctx.viewerId || row.authorId !== ctx.viewerId) return false;
  return ctx.now - Date.parse(row.createdAt) <= LIMITS.ownFreshMinutes * 60_000;
}

export function scoreComment(
  row: CommentRow,
  ctx: RankContext,
  dupes: DuplicateIndex,
  against: string = ctx.postText,
): Scored {
  const features = computeFeatures(row, ctx, against);
  const { positive, contributions } = positiveScore(features);
  const penalties = computePenalties(row, dupes);
  const learned = activeLearnedRanker();
  const base = learned ? learned.score(features) : positive;
  let score = base * (1 - penalties.total);
  if (penalties.severe) score -= 2;
  const relation = relationOf(row, ctx.viewerId);
  const pinned = !penalties.severe && isOwnFresh(row, ctx);
  const scored: Scored = { row, features, contributions, penalties, positive, score, relation, reason: "fresh", pinned };
  scored.reason = reasonFor(scored);
  return scored;
}

/* Score descending, then newer first, then id: total and deterministic. */
export function byScore(a: Scored, b: Scored): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.row.createdAt !== b.row.createdAt) return b.row.createdAt.localeCompare(a.row.createdAt);
  return a.row.id.localeCompare(b.row.id);
}
