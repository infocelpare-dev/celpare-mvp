import { clamp01 } from "./math";

/*
  Algorithm evaluation: is a version of the feed actually better?

  POSITION AWARE. A post at position 1 gets opened because it is at position
  1. Comparing raw open rates between two algorithms that put different posts
  first measures the slot, not the post. So opens are compared with what the
  slot would earn anyway (EXPECTED_OPEN_BY_POSITION), the same idea D98 uses for
  search clicks. The curve is a stated placeholder: Celpare has no traffic to
  measure it yet, and it should be re-fitted from feed_events once it does.

  NOT ONLY ENGAGEMENT. The metrics below include diversity, freshness, how much
  exposure small creators get, negative feedback and unsafe exposure, and a long
  term signal (people coming back), so a version that wins on clicks by making
  the feed narrower or louder does not look like a win.
*/

/* Expected open rate by position, 0 based. Placeholder shape: steep at the top,
   flattening out. */
export const EXPECTED_OPEN_BY_POSITION = [0.12, 0.09, 0.075, 0.065, 0.058, 0.052, 0.047, 0.043, 0.04, 0.037];
export const EXPECTED_OPEN_TAIL = 0.03;

export function expectedOpenRate(position: number): number {
  return EXPECTED_OPEN_BY_POSITION[position] ?? EXPECTED_OPEN_TAIL;
}

/* How likely a slot is to be examined, relative to the top: 1 at position 0,
   falling with the open curve. Used by the interest model (feed_v3) to weight a
   pass over by where it happened. The same stated placeholder curve. */
export function examinationProbability(position: number | null | undefined): number {
  if (position === null || position === undefined || !Number.isFinite(position) || position < 0) return 0.5;
  return expectedOpenRate(Math.floor(position)) / EXPECTED_OPEN_BY_POSITION[0];
}

export type PositionRow = { position: number; impressions: number; opens: number };

/*
  Opens above what the positions would earn anyway, as a ratio. 1 means "as
  expected for where these posts were shown"; above 1, the ranking put better
  posts in those slots.
*/
export function positionAdjustedOpenRate(rows: PositionRow[]): number {
  let opens = 0;
  let expected = 0;
  for (const r of rows) {
    opens += r.opens;
    expected += r.impressions * expectedOpenRate(r.position);
  }
  return expected > 0 ? opens / expected : 0;
}

/* Gini coefficient of impressions across creators: 0 is perfectly even, 1 is
   one creator getting everything. */
export function gini(values: number[]): number {
  const v = values.filter((x) => x >= 0).sort((a, b) => a - b);
  const n = v.length;
  const sum = v.reduce((a, b) => a + b, 0);
  if (n === 0 || sum === 0) return 0;
  let acc = 0;
  v.forEach((x, i) => {
    acc += (2 * (i + 1) - n - 1) * x;
  });
  return acc / (n * sum);
}

export type EvaluationInput = {
  positions: PositionRow[];
  /* Meaningful actions after an impression: saves, comments, follows, long reads. */
  meaningfulActions: number;
  impressions: number;
  impressionsByCreator: number[];
  impressionsToSmallCreators: number;
  impressionsOfFreshPosts: number;
  distinctTopics: number;
  notInterested: number;
  reports: number;
  unsafeImpressions: number;
  users: number;
  returningUsers: number;
};

export type Evaluation = {
  relevance: { meaningfulRate: number; positionAdjustedOpens: number };
  diversity: { topicsPerHundred: number; creatorGini: number };
  freshness: { freshShare: number };
  creators: { smallCreatorShare: number };
  negative: { notInterestedRate: number; reportRate: number };
  safety: { unsafeShare: number };
  longTerm: { returnRate: number };
};

function rate(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

export function evaluate(x: EvaluationInput): Evaluation {
  return {
    relevance: {
      meaningfulRate: rate(x.meaningfulActions, x.impressions),
      positionAdjustedOpens: positionAdjustedOpenRate(x.positions),
    },
    diversity: {
      topicsPerHundred: rate(x.distinctTopics * 100, Math.max(1, x.impressions)),
      creatorGini: gini(x.impressionsByCreator),
    },
    freshness: { freshShare: rate(x.impressionsOfFreshPosts, x.impressions) },
    creators: { smallCreatorShare: rate(x.impressionsToSmallCreators, x.impressions) },
    negative: {
      notInterestedRate: rate(x.notInterested, x.impressions),
      reportRate: rate(x.reports, x.impressions),
    },
    safety: { unsafeShare: rate(x.unsafeImpressions, x.impressions) },
    longTerm: { returnRate: clamp01(rate(x.returningUsers, x.users)) },
  };
}
