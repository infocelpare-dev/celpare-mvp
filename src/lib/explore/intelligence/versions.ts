import { unitHash } from "../../community/intelligence/math";
import type { SectionObjective } from "./config";
import type { ExploreSectionId } from "./types";

/*
  The Explore algorithm registry (D150). Every Explore event records the id
  that produced it, so last month's numbers describe the system that ran.

  A material change is explore_v2 beside explore_v1, never an edit to v1 that
  makes old events describe something else. Feed, Search and Reels versions are
  registered in their own folders and are not touched from here.
*/

export type ExploreAlgorithmId = "explore_v1";

export const EXPLORE_ALGORITHM: ExploreAlgorithmId = "explore_v1";

export const EXPLORE_ALGORITHMS: Record<ExploreAlgorithmId, { id: ExploreAlgorithmId; objective: string; since: string }> = {
  explore_v1: {
    id: "explore_v1",
    objective:
      "Help a person discover tools, models, posts, videos, people and topics they did not search for: relevant, new to them, good, and varied.",
    since: "2026-09-26",
  },
};

/*
  Experiments. Empty today: with six accounts there is nothing to measure a
  variant against. The shape exists so the 70/20/10 mix and the section
  objectives can be tested later without touching the pipeline (D153).
*/
export type ExploreOverride = {
  mix?: { near: number; adjacent: number; far: number };
  objectives?: Partial<Record<ExploreSectionId, SectionObjective>>;
};

export type ExploreExperiment = {
  id: string;
  active: boolean;
  controlWeight: number;
  variants: { id: string; weight: number; override: ExploreOverride }[];
};

export const EXPLORE_EXPERIMENTS: ExploreExperiment[] = [];

export type ExploreAssignment = { experimentId: string | null; variant: string; override: ExploreOverride | null };

export const EXPLORE_CONTROL: ExploreAssignment = { experimentId: null, variant: "control", override: null };

/* Deterministic per unit (account or session): the same person always lands
   in the same arm. */
export function assignExploreVariant(
  unitId: string | null,
  experiments: ExploreExperiment[] = EXPLORE_EXPERIMENTS,
): ExploreAssignment {
  const exp = experiments.find((e) => e.active);
  if (!exp || !unitId) return EXPLORE_CONTROL;
  const total = exp.controlWeight + exp.variants.reduce((a, v) => a + v.weight, 0);
  if (!(total > 0)) return EXPLORE_CONTROL;
  const u = unitHash(`${exp.id}:${unitId}`) * total;
  if (u < exp.controlWeight) return { experimentId: exp.id, variant: "control", override: null };
  let acc = exp.controlWeight;
  for (const v of exp.variants) {
    acc += v.weight;
    if (u < acc) return { experimentId: exp.id, variant: v.id, override: v.override };
  }
  return { experimentId: exp.id, variant: "control", override: null };
}
