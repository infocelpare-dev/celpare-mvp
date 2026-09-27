import { freshnessOf } from "./freshness";
import { formatNumber } from "./format";
import type { ComparisonDimension, ComparisonValue, PerformanceMetric, PerformanceRow } from "./types";

/*
  Performance (guide 16 section 11, D167).

  model_performance is empty in v1, so every value here is not_measured, which is
  a different sentence from not_recorded: nobody has measured it, as opposed to
  Celpare holding no record of a stated fact. Nothing is estimated.

  When rows exist, a value is the most recent measurement, with its endpoint and
  date. Performance is never presented as a constant: other endpoints and older
  measurements are counted in the note.
*/

export function performanceValue(modelId: string, dim: ComparisonDimension, rows: PerformanceRow[], now: number): ComparisonValue {
  const metric = dim.id.slice("perf:".length) as PerformanceMetric;
  const mine = rows.filter((r) => r.modelId === modelId && r.metric === metric && Number.isFinite(r.value) && r.value >= 0);
  if (mine.length === 0) return { state: "not_measured" };

  const head = mine.slice().sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
  const endpoints = new Set(mine.map((r) => r.providerEndpoint ?? ""));
  const notes = [
    head.providerEndpoint ? `Measured on ${head.providerEndpoint}` : null,
    head.environment,
    mine.length > 1 ? `${mine.length - 1} other measurement${mine.length === 2 ? "" : "s"} recorded${endpoints.size > 1 ? " on other endpoints" : ""}` : null,
  ].filter(Boolean);

  return {
    state: "known",
    value: head.value,
    display: formatNumber(dim.unit, head.value),
    evidence: [`perf:${head.id}`],
    freshness: freshnessOf(head.measuredAt, "performance", now),
    note: notes.length > 0 ? notes.join(". ") : undefined,
  };
}
