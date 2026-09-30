import { unitHash } from "../community/intelligence/math";
import type { Objective } from "./config";
import type { Strategy } from "./types";

/*
  The engine's registry (D174). One algorithm id; the strategy and the surface are
  recorded beside it on every event, so a change to "alternative" is visible
  without renaming the engine. A material change (a new stage, part or source) is
  tool_model_recommendation_v2 beside v1, never an edit that makes old events
  describe a different system. feed_v3, explore_v1 and search are registered in
  their own folders and never touched from here (D173).
*/

export type TmrAlgorithmId = "tool_model_recommendation_v1";

export const TMR_ALGORITHM: TmrAlgorithmId = "tool_model_recommendation_v1";

export const TMR_ALGORITHMS: Record<TmrAlgorithmId, { id: TmrAlgorithmId; objective: string; since: string }> = {
  tool_model_recommendation_v1: {
    id: "tool_model_recommendation_v1",
    objective:
      "Recommend AI tools and models: similar, alternative, personalized, fit to stated needs, worth comparing, and related across types, each by its own objective, grounded in the catalogue.",
    since: "2026-09-28",
  },
};

/* Experiments. Empty: six accounts cannot power a comparison of variants. The
   shape lets one strategy's objective be tested later without touching the
   pipeline. */
export type TmrOverride = { objectives?: Partial<Record<Strategy, Objective>> };

export type TmrExperiment = {
  id: string;
  active: boolean;
  controlWeight: number;
  variants: { id: string; weight: number; override: TmrOverride }[];
};

export const TMR_EXPERIMENTS: TmrExperiment[] = [];

export type TmrAssignment = { experimentId: string | null; variant: string; override: TmrOverride | null };

export const TMR_CONTROL: TmrAssignment = { experimentId: null, variant: "control", override: null };

/* Deterministic per unit (account or session): one person, one arm. */
export function assignTmrVariant(unitId: string | null, experiments: TmrExperiment[] = TMR_EXPERIMENTS): TmrAssignment {
  const exp = experiments.find((e) => e.active);
  if (!exp || !unitId) return TMR_CONTROL;
  const total = exp.controlWeight + exp.variants.reduce((a, v) => a + v.weight, 0);
  if (!(total > 0)) return TMR_CONTROL;
  const u = unitHash(`${exp.id}:${unitId}`) * total;
  if (u < exp.controlWeight) return { experimentId: exp.id, variant: "control", override: null };
  let acc = exp.controlWeight;
  for (const v of exp.variants) {
    acc += v.weight;
    if (u < acc) return { experimentId: exp.id, variant: v.id, override: v.override };
  }
  return { experimentId: exp.id, variant: "control", override: null };
}
