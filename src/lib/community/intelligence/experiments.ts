import { unitHash } from "./math";
import type { Objective } from "./scoring";
import type { AlgorithmId } from "./types";

/*
  Experimentation infrastructure. NO EXPERIMENT IS RUNNING: the registry below
  is empty, so everybody is in `control` and gets exactly the published objective.

  WHAT A VARIANT CAN CHANGE: objective weights, and nothing else. The override
  type is a partial Objective. There is no field for eligibility, safety, mutes
  or report handling, so "do not experiment with safety critical behaviour" is
  enforced by the type system rather than by remembering.

  ASSIGNMENT IS DETERMINISTIC. The same account (or signed out session) always
  lands in the same variant of an experiment, so a person does not flip between
  two feeds on refresh, and the variant is recorded on every impression.
*/

export type ObjectiveOverride = Partial<Omit<Objective, "actions">> & {
  actions?: Objective["actions"];
};

export type Experiment = {
  id: string;
  algorithm: AlgorithmId;
  /* Weights need not sum to 1; they are normalised. control is implicit. */
  variants: { id: string; weight: number; override: ObjectiveOverride }[];
  controlWeight: number;
  active: boolean;
};

export const EXPERIMENTS: Experiment[] = [];

export type Assignment = {
  experimentId: string | null;
  variant: string;
  override: ObjectiveOverride | null;
};

export const CONTROL: Assignment = { experimentId: null, variant: "control", override: null };

export function assignVariant(
  unitId: string | null,
  algorithm: AlgorithmId,
  experiments: Experiment[] = EXPERIMENTS,
): Assignment {
  const exp = experiments.find((e) => e.active && e.algorithm === algorithm);
  if (!exp || !unitId) return CONTROL;

  const total = exp.controlWeight + exp.variants.reduce((a, v) => a + v.weight, 0);
  if (!(total > 0)) return CONTROL;

  const u = unitHash(`${exp.id}:${unitId}`) * total;
  if (u < exp.controlWeight) return { experimentId: exp.id, variant: "control", override: null };

  let acc = exp.controlWeight;
  for (const v of exp.variants) {
    acc += v.weight;
    if (u < acc) return { experimentId: exp.id, variant: v.id, override: v.override };
  }
  return { experimentId: exp.id, variant: "control", override: null };
}

export function applyOverride(base: Objective, override: ObjectiveOverride | null): Objective {
  if (!override) return base;
  return {
    ...base,
    ...override,
    actions: { ...base.actions, ...(override.actions ?? {}) },
  };
}

/*
  Guardrails: the numbers that must not get worse for a variant to ship,
  whatever its headline metric does. Computed from aggregate counts per
  variant (feed_events joined to engagement), never per person.
*/
export type GuardrailInput = {
  impressions: number;
  notInterested: number;
  reports: number;
  spamImpressions: number;
  sessions: number;
  abandonedSessions: number;
  /* Impressions of the single most shown creator. */
  topCreatorImpressions: number;
  distinctCreators: number;
  distinctTopics: number;
  returningUsers: number;
  users: number;
};

export type Guardrails = {
  negativeFeedbackRate: number;
  reportRate: number;
  spamExposureRate: number;
  abandonmentRate: number;
  creatorConcentration: number;
  creatorDiversity: number;
  topicDiversity: number;
  retention: number;
};

function rate(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

export function computeGuardrails(g: GuardrailInput): Guardrails {
  return {
    negativeFeedbackRate: rate(g.notInterested, g.impressions),
    reportRate: rate(g.reports, g.impressions),
    spamExposureRate: rate(g.spamImpressions, g.impressions),
    abandonmentRate: rate(g.abandonedSessions, g.sessions),
    creatorConcentration: rate(g.topCreatorImpressions, g.impressions),
    creatorDiversity: rate(g.distinctCreators, Math.max(1, g.impressions)),
    topicDiversity: rate(g.distinctTopics, Math.max(1, g.impressions)),
    retention: rate(g.returningUsers, g.users),
  };
}

/* A variant fails if any guardrail is worse than control by more than the
   tolerance. Higher is worse for the first five, lower is worse for the rest. */
export function guardrailsHold(control: Guardrails, variant: Guardrails, tolerance = 0.1): boolean {
  const worseIfHigher: (keyof Guardrails)[] = [
    "negativeFeedbackRate",
    "reportRate",
    "spamExposureRate",
    "abandonmentRate",
    "creatorConcentration",
  ];
  const worseIfLower: (keyof Guardrails)[] = ["creatorDiversity", "topicDiversity", "retention"];
  for (const k of worseIfHigher) if (variant[k] > control[k] * (1 + tolerance) + 1e-9) return false;
  for (const k of worseIfLower) if (variant[k] < control[k] * (1 - tolerance) - 1e-9) return false;
  return true;
}
