import type { Features } from "./types";

/*
  The learning to rank interface, deliberately INACTIVE (D218).

  A learned ranker is only worth having when there is representative data to
  learn from, and with a handful of comments there is none: a model trained on
  it would learn noise and look confident doing it. So the interface exists, the
  pipeline consults it, and it returns null until evidence clears the bar below.
  Impressions with positions are logged from V1 so that, when it is trained,
  exposure bias can be corrected (a comment nobody saw is not a comment nobody
  liked). Dwell time alone is never a positive label.
*/

export type LearnedRanker = {
  version: string;
  /* A replacement for the positive score, 0..1. Penalties still apply after. */
  score(features: Features): number;
};

export type TrainingEvidence = {
  impressions: number;
  positiveLabels: number;
  distinctViewers: number;
  days: number;
};

export const LTR_MINIMUM: TrainingEvidence = {
  impressions: 50_000,
  positiveLabels: 2_000,
  distinctViewers: 1_000,
  days: 30,
};

export function enoughEvidence(e: TrainingEvidence): boolean {
  return (
    e.impressions >= LTR_MINIMUM.impressions &&
    e.positiveLabels >= LTR_MINIMUM.positiveLabels &&
    e.distinctViewers >= LTR_MINIMUM.distinctViewers &&
    e.days >= LTR_MINIMUM.days
  );
}

/* Nothing is registered in V1. */
const REGISTERED: LearnedRanker | null = null;

export function activeLearnedRanker(): LearnedRanker | null {
  return REGISTERED;
}
