import type { ModelItem } from "../types";
import { dimensionStats, pairwise } from "./differences";
import { resolveEntities } from "./entities";
import { buildEvidence } from "./evidence";
import { priorityLine } from "./explain";
import { fitAnalysis } from "./fit";
import { resolveGoal } from "./goals";
import { buildMatrix } from "./matrix";
import { defaultTradeoff } from "./pareto";
import { SCENARIO_LABEL, scenarioCosts } from "./pricing";
import { RuleBasedComparisonRanker, type ComparisonRanker } from "./ranker";
import { strategyOf } from "./strategies/index";
import { DeterministicSummaryWriter, type SummaryWriter } from "./summary";
import type { CompareInput, CompareRequest, CompareResult, DataIssue } from "./types";
import { COMPARE_ALGORITHM } from "./versions";

/*
  compare_v1, the pure pipeline (guide 16 section 3).

  request -> entities -> strategy -> matrix (facts, measurements, benchmarks,
  prices, freshness, quality) -> evidence -> differences -> tradeoffs -> order ->
  goal -> fit -> explanation -> summary.

  No I/O, no clock of its own (input.now), no randomness: the same input gives the
  same result, which is what lets the cache key on the input and the tests pin
  behaviour. The goal and weights enter after the matrix is built, so they cannot
  change a fact (D169).
*/

export type PipelineOptions = {
  ranker?: ComparisonRanker;
  summary?: SummaryWriter;
};

export function runCompare(request: CompareRequest, input: CompareInput, options: PipelineOptions = {}): CompareResult {
  const ranker = options.ranker ?? RuleBasedComparisonRanker;
  const writer = options.summary ?? DeterministicSummaryWriter;
  const issues: DataIssue[] = [];

  const entities = resolveEntities(request.entities, input.items);
  const present = new Set(entities.map((e) => `${e.type}:${e.id}`));
  const unavailable = request.entities.filter((e) => !present.has(`${e.type}:${e.id}`)).map((e) => e.id);

  const strategy = strategyOf(request.strategy);
  const matrix = buildMatrix(strategy, entities, input, issues);
  const evidence = buildEvidence(entities.map((e) => e.item), input.performance, input.now);

  for (const [di, dim] of matrix.dimensions.entries()) {
    for (const [ei, v] of matrix.values[di].entries()) {
      if (v.state === "known" && v.freshness === "stale") {
        issues.push({ code: "stale", entityId: matrix.entities[ei].id, dimension: dim.id, message: `${matrix.entities[ei].name}: ${dim.label} is older data.`, visibility: "debug" });
      }
    }
  }

  const diffs = pairwise(matrix, issues);
  const stats = dimensionStats(matrix);
  const pareto = request.strategy === "mixed" ? null : defaultTradeoff(matrix);
  const goal = resolveGoal(request.goal, request.weights, matrix);

  const order = ranker
    .rank(matrix.dimensions.map((d) => ({ dimension: d.id })), { matrix, stats, pairwise: diffs, goal })
    .map((c) => c.dimension);

  const fitted = goal ? fitAnalysis(matrix, goal) : null;

  const summary =
    writer.write({ matrix, stats, pairwise: diffs, issues, goal, order }) ??
    DeterministicSummaryWriter.write({ matrix, stats, pairwise: diffs, issues, goal, order }) ??
    [];

  const models = entities.filter((e) => e.item.type === "model").map((e) => e.item as ModelItem);
  const scenario =
    request.scenario && models.length > 0
      ? { assumptions: request.scenario, costs: scenarioCosts(models, request.scenario), label: SCENARIO_LABEL }
      : null;

  return {
    algorithm: COMPARE_ALGORITHM,
    request,
    matrix,
    evidence,
    issues,
    pairwise: diffs,
    stats,
    pareto,
    order,
    unavailable,
    goal,
    fit: fitted?.fit ?? null,
    sharedMissing: fitted?.sharedMissing ?? [],
    explanation: priorityLine(goal),
    summary,
    scenario,
  };
}
