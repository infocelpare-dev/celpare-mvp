import { EXPLORE_V1, OBJECTIVES, RELEVANCE_GATED, type SectionObjective } from "./config";
import type { ExploreOverride } from "./versions";
import type { ExploreFeatures, ExploreSectionId } from "./types";

/*
  Section objectives (brief section 25). Each shelf values different things:
  Trending values attention, Rising acceleration, New freshness, Tools use case
  relevance and evidence. The weights live in config.ts.

  A part a type does not have (a tool has no completion rate) is left out of the
  sum AND out of the denominator, so no type is penalised for lacking a part
  that does not apply to it.
*/

export function objectiveFor(section: ExploreSectionId, override: ExploreOverride | null = null): SectionObjective {
  return override?.objectives?.[section] ?? OBJECTIVES[section];
}

export function objectiveValue(parts: Record<string, number>, objective: SectionObjective): number {
  let sum = 0;
  let weight = 0;
  for (const [name, w] of Object.entries(objective)) {
    const v = parts[name];
    if (v === undefined || !Number.isFinite(v)) continue;
    sum += w * v;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0;
}

/*
  The guardrails, as multipliers (brief sections 22 and 35):

    final = value x safety x qualityGate x relevanceGate

  Popularity lives inside `value` and can never buy its way past a severe safety
  problem, poor quality, or a complete lack of relevance to this person. For a
  cold viewer the relevance gate is off: there is nothing to be relevant to.
*/
export function applyGates(
  section: ExploreSectionId,
  value: number,
  f: ExploreFeatures,
  cold: boolean,
): number {
  const E = EXPLORE_V1;
  const qualityGate = f.quality < E.QUALITY_FLOOR ? E.QUALITY_PENALTY : 1;
  const relevanceGate =
    !cold && RELEVANCE_GATED.has(section)
      ? E.RELEVANCE_GATE_FLOOR + (1 - E.RELEVANCE_GATE_FLOOR) * f.personalRelevance
      : 1;
  return value * f.safety * qualityGate * relevanceGate;
}
