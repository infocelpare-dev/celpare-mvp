import type { Evaluation, ModelItem } from "../types";
import { benchmarkKey } from "./dimensions";
import { freshnessOf } from "./freshness";
import type { ComparisonDimension, ComparisonValue, DataIssue, KnownValue } from "./types";

/*
  Benchmarks (guide 16 section 10, D166).

  One dimension per benchmark and metric. For one model the most recent model
  version's results are used; older versions are named in a note, never averaged
  in. Two rows with the same score are one result with two sources; two rows with
  different scores for the same version are a conflict, shown with both.
*/

const REPORTER_WORDS: Record<NonNullable<Evaluation["reporterRelation"]>, string> = {
  provider: "reported by the model's provider",
  competitor: "measured by a competing provider",
  independent: "independently measured",
  third_party_cited: "the provider's result, cited by a third party",
};

export function reporterWords(r: Evaluation["reporterRelation"]): string {
  return r ? REPORTER_WORDS[r] : "who reported it is not recorded";
}

function formatScore(e: Evaluation): string {
  const n = Number(e.score.toFixed(2));
  return e.unit === "percent" ? `${n}%` : String(n);
}

export function benchmarkValue(model: ModelItem, dim: ComparisonDimension, now: number, issues: DataIssue[]): ComparisonValue {
  const rows = model.evaluations.filter((e) => benchmarkKey(e) === dim.id);
  if (rows.length === 0) return { state: "not_recorded" };

  for (const r of rows) {
    if (!r.modelVersion) {
      issues.push({ code: "missing_model_version", entityId: model.id, dimension: dim.id, message: `${model.name}: a ${r.name} result has no model version recorded.`, visibility: "debug" });
    }
    if (Number.isNaN(new Date(r.evaluatedAt).getTime())) {
      issues.push({ code: "invalid_date", entityId: model.id, dimension: dim.id, message: `${model.name}: a ${r.name} result has an invalid evaluation date.`, visibility: "debug" });
    }
  }

  /* The newest version's rows. A missing version groups on its own. */
  const byVersion = new Map<string, Evaluation[]>();
  for (const r of rows) {
    const v = r.modelVersion ?? "";
    byVersion.set(v, [...(byVersion.get(v) ?? []), r]);
  }
  const groups = [...byVersion.entries()].sort((a, b) => latest(b[1]).localeCompare(latest(a[1])));
  const [version, current] = groups[0];
  const older = groups.slice(1).map(([v]) => v || "an unrecorded version");

  const scores = new Map<number, Evaluation[]>();
  for (const r of current) scores.set(r.score, [...(scores.get(r.score) ?? []), r]);

  if (scores.size > 1) {
    issues.push({ code: "conflicting_values", entityId: model.id, dimension: dim.id, message: `Sources report different ${dim.label} results for ${model.name}.`, visibility: "public" });
    return {
      state: "conflict",
      values: current.map((r) => ({ display: `${formatScore(r)} (${r.evaluator})`, evidence: `eval:${r.id}` })),
    };
  }
  if (current.length > 1) {
    issues.push({ code: "duplicate_benchmark", entityId: model.id, dimension: dim.id, message: `${model.name}: ${current.length} identical ${dim.label} results, shown once with every source.`, visibility: "debug" });
  }

  const head = current.sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))[0];
  const value: KnownValue = {
    state: "known",
    value: head.score,
    display: formatScore(head),
    evidence: current.map((r) => `eval:${r.id}`),
    freshness: freshnessOf(head.evaluatedAt, "benchmark", now),
    method: {
      modelVersion: version || null,
      harness: head.harness,
      datasetVersion: head.datasetVersion,
      reporter: head.reporterRelation,
    },
    note: [head.note, older.length > 0 ? `Older result also recorded for ${older.join(", ")}` : null].filter(Boolean).join(". ") || undefined,
  };
  return value;
}

function latest(rows: Evaluation[]): string {
  return rows.map((r) => r.evaluatedAt).sort().at(-1) ?? "";
}

/*
  Like for like: results on one benchmark are directly comparable only when they
  were produced the same way. A different harness or dataset version across the
  compared models makes the row "not like for like"; so does a mix of who
  reported them. The row is still shown, with the caveat.
*/
export function likeForLikeCaveat(values: ComparisonValue[]): string | undefined {
  const known = values.filter((v): v is KnownValue => v.state === "known" && Boolean(v.method));
  if (known.length < 2) return undefined;
  const harness = new Set(known.map((v) => v.method!.harness ?? ""));
  const dataset = new Set(known.map((v) => v.method!.datasetVersion ?? ""));
  const reporter = new Set(known.map((v) => v.method!.reporter ?? ""));
  const reasons: string[] = [];
  if (harness.size > 1) reasons.push("different harnesses");
  if (dataset.size > 1) reasons.push("different dataset versions");
  if (reporter.size > 1) reasons.push("reported by different kinds of source");
  return reasons.length > 0 ? `Not like for like: ${reasons.join(", ")}.` : undefined;
}
