import { hoursBetween, unitHash } from "./math";
import { engagementQuality } from "./quality";
import { totalUniq } from "./signals";
import type { ContentItem, PostSignals } from "./types";
import type { ViralAssessment } from "./viral";

/*
  distribution_v1: the lifecycle of a new post or video.

    upload -> validation -> eligibility -> small test audience -> measure
           -> expand / maintain / reduce -> broader distribution

  Validation and eligibility are the composer's zod schema, the database CHECKs
  and safety.ts. What this file adds is the AUDIENCE: a new post from somebody a
  viewer does not follow is not handed to everybody at once. It goes to a
  deterministic slice of viewers, plus the people most likely to want it (topic
  and creator affinity), and the slice widens or narrows on how that first
  audience responded.

  THE SAME RULES FOR A NEW CREATOR AS FOR AN ESTABLISHED ONE. The stage is
  decided by this post's own audience response, never by follower count, so a
  first post gets the same test a hundredth one does.

  Followers are not gated by any of this. Following shows everything from the
  people you follow; distribution governs only reach beyond them.
*/

export const DISTRIBUTION = {
  /* The test lasts until this many distinct viewers, or this many hours. */
  TEST_VIEWERS: 12,
  TEST_MAX_HOURS: 48,
  /* Share of non-following viewers in the post's audience, by stage. Only the
     test and reduce stages sample: past the test a post is open to everybody,
     and the stage then changes how strongly it is lifted (distributionBoost),
     not who may see it. */
  FRACTION: {
    test: 0.35,
    expand: 1,
    broad: 1,
    maintain: 1,
    reduce: 0.12,
  },
  /* Response thresholds on engagement quality once the test has an audience. */
  EXPAND_AT: 0.45,
  REDUCE_AT: 0.2,
  /* Negative rate above which reach is reduced whatever else happened. */
  NEGATIVE_REDUCE: 0.08,
  /* Topic or creator interest at which a viewer is in the audience regardless
     of the slice: the "relevant topic users" of the brief. */
  RELEVANT_INTEREST: 0.3,
} as const;

export type DistributionStage = keyof typeof DISTRIBUTION.FRACTION;

export type DistributionState = {
  stage: DistributionStage;
  fraction: number;
  viewers: number;
};

export function distributionStage(
  item: ContentItem,
  signals: PostSignals,
  now: number,
  viral?: ViralAssessment,
): DistributionState {
  const viewers = Math.max(totalUniq(signals, "impression"), totalUniq(signals, "watch"));
  const age = hoursBetween(item.createdAt, now);
  const q = engagementQuality(signals, item);

  let stage: DistributionStage;
  if (viral?.breakout) stage = "broad";
  else if (q.negativeRate >= DISTRIBUTION.NEGATIVE_REDUCE && viewers >= DISTRIBUTION.TEST_VIEWERS / 2) stage = "reduce";
  else if (viewers < DISTRIBUTION.TEST_VIEWERS && age < DISTRIBUTION.TEST_MAX_HOURS) stage = "test";
  else if (q.quality >= DISTRIBUTION.EXPAND_AT) stage = "expand";
  else if (q.quality < DISTRIBUTION.REDUCE_AT) stage = "reduce";
  else stage = "maintain";

  return { stage, fraction: DISTRIBUTION.FRACTION[stage], viewers };
}

/*
  Is this viewer in this post's audience right now? Deterministic per viewer and
  post, so refreshing does not flicker a post in and out, and a signed out
  visitor is keyed by session or treated as one shared audience.
*/
export function inAudience(
  viewerKey: string,
  postId: string,
  state: DistributionState,
  relevance: number,
): boolean {
  if (relevance >= DISTRIBUTION.RELEVANT_INTEREST) return true;
  return unitHash(`${viewerKey}:${postId}:dist`) < state.fraction;
}

/* The multiplier a stage applies to ranking beyond the audience check: a post
   in test gets a small lift so it actually collects its first signals. */
export function distributionBoost(state: DistributionState): number {
  switch (state.stage) {
    case "test":
      return 0.6;
    case "broad":
      return 0.9;
    case "expand":
      return 0.7;
    case "maintain":
      return 0.5;
    case "reduce":
      return 0.15;
  }
}
