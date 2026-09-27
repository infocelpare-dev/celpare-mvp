import { COMPARE_V1 } from "./config";
import { formatShort } from "./format";
import { known } from "./matrix";
import type { ComparisonMatrix, DataIssue, DimensionDifference, DimensionStats, ResolvedGoal, SummaryLine } from "./types";

/*
  The summary (guide 16 section 20, D168).

  v1 is DETERMINISTIC: every line is built from the matrix and the differences and
  tagged fact, derived or interpretation, and every line lists what it was built
  from. The AI writer exists only as an interface and an input contract: it makes
  no model call, and when it does one day it receives summaryInput() and nothing
  else, and its output is checked with unsupportedNumbers() before it is shown.
*/

export type SummaryContext = {
  matrix: ComparisonMatrix;
  stats: DimensionStats[];
  pairwise: DimensionDifference[];
  issues: DataIssue[];
  goal: ResolvedGoal | null;
  /* Dimension ids in the order the ranker chose. */
  order: string[];
};

export interface SummaryWriter {
  id: string;
  write(ctx: SummaryContext): SummaryLine[] | null;
}

function names(matrix: ComparisonMatrix, ids: string[]): string {
  const list = ids.map((id) => matrix.entities.find((e) => e.id === id)?.name ?? id);
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
}

export const DeterministicSummaryWriter: SummaryWriter = {
  id: "deterministic_v1",
  write(ctx) {
    const { matrix, stats, pairwise, issues, goal, order } = ctx;
    const lines: SummaryLine[] = [];
    const statsById = new Map(stats.map((s) => [s.dimension, s]));
    const n = matrix.entities.length;

    /* Leaders, in the ranker's order, each followed by what it is derived to mean.
       One per section, so five price rows do not crowd out context and benchmarks;
       the full list is in Key differences below the summary. */
    const sectionsUsed = new Set<string>();
    for (const id of order) {
      if (lines.length >= COMPARE_V1.summaryLines) break;
      const s = statsById.get(id);
      if (!s?.leader) continue;
      const di = matrix.dimensions.findIndex((d) => d.id === id);
      const section = matrix.dimensions[di].section;
      if (sectionsUsed.has(section)) continue;
      sectionsUsed.add(section);
      const evidence = matrix.values[di].flatMap((v, i) => (known(v) && s.leader!.entityIds.includes(matrix.entities[i].id) ? v.evidence : []));
      lines.push({
        kind: "fact",
        text: `${s.leader.label}: ${names(matrix, s.leader.entityIds)} (${s.leader.display}).${s.leader.caveat ? ` ${s.leader.caveat}` : ""}`,
        refs: [id, ...evidence],
      });
      if (n === 2) {
        const diff = pairwise.find((p) => p.dimension === id && p.delta !== undefined && p.delta !== 0);
        if (diff) lines.push({ kind: "derived", text: diff.interpretation, refs: [id, ...diff.evidence] });
      } else if (s.min !== undefined && s.max !== undefined) {
        const dim = matrix.dimensions[di];
        const first = matrix.values[di].find(known);
        const cur = first && first.state === "known" ? first.currency : undefined;
        lines.push({
          kind: "derived",
          text: `Range ${formatShort(dim, s.min, cur)} to ${formatShort(dim, s.max, cur)} across the ${s.known} of ${s.total} with a value on record${s.known < s.total ? "; no value is not the same as a lower one" : ""}.`,
          refs: [id],
        });
      }
    }

    /* Coverage worth saying out loud. */
    const bench = matrix.dimensions.map((d, i) => ({ d, i })).filter((x) => x.d.kind === "benchmark");
    if (matrix.entities.every((e) => e.type === "model")) {
      const withAny = matrix.entities.filter((_, ei) => bench.some((b) => known(matrix.values[b.i][ei]))).length;
      if (withAny < n) {
        lines.push({ kind: "fact", text: `Benchmark results are recorded for ${withAny} of ${n}.`, refs: bench.map((b) => b.d.id) });
      }
      const perf = matrix.dimensions.map((d, i) => ({ d, i })).filter((x) => x.d.kind === "performance");
      if (perf.length > 0 && perf.every((p) => matrix.coverage[p.i] === 0)) {
        lines.push({ kind: "fact", text: "No performance measurements are recorded for these models yet.", refs: perf.map((p) => p.d.id) });
      }
    }

    for (const issue of issues.filter((x) => x.code === "conflicting_values" && x.visibility === "public").slice(0, 2)) {
      lines.push({ kind: "fact", text: `${issue.message} See sources.`, refs: issue.dimension ? [issue.dimension] : [] });
    }

    lines.push({
      kind: "interpretation",
      text: goal
        ? "The fit section below reads these against your stated priorities. No option is ranked above the others."
        : "Which of these differences matters depends on your workload.",
      refs: [],
    });
    return lines;
  },
};

/* The future AI writer. Returns null: no model call in v1 (D168). */
export const AiSummaryWriter: SummaryWriter = {
  id: "ai_v0_disabled",
  write() {
    return null;
  },
};

/* ---------------------------------------------------------------------------
   The only payload a future AI writer may receive: verified values with their
   evidence, the differences, what is missing, and the stated priorities.
   --------------------------------------------------------------------------- */

export type SummaryInput = {
  entities: { id: string; type: string; name: string }[];
  facts: { dimension: string; label: string; values: { entityId: string; display: string; evidence: string[] }[] }[];
  missing: { dimension: string; entityIds: string[] }[];
  conflicts: { dimension: string; entityId: string; values: string[] }[];
  differences: { dimension: string; text: string; evidence: string[] }[];
  priorities: { group: string; importance: number }[] | null;
};

export function summaryInput(ctx: SummaryContext): SummaryInput {
  const { matrix } = ctx;
  const facts: SummaryInput["facts"] = [];
  const missing: SummaryInput["missing"] = [];
  const conflicts: SummaryInput["conflicts"] = [];
  matrix.dimensions.forEach((dim, di) => {
    const row = matrix.values[di];
    const vals = row.flatMap((v, i) => (known(v) ? [{ entityId: matrix.entities[i].id, display: v.display, evidence: v.evidence }] : []));
    if (vals.length > 0) facts.push({ dimension: dim.id, label: dim.label, values: vals });
    const miss = row.flatMap((v, i) => (v.state === "not_recorded" || v.state === "not_measured" ? [matrix.entities[i].id] : []));
    if (miss.length > 0) missing.push({ dimension: dim.id, entityIds: miss });
    row.forEach((v, i) => {
      if (v.state === "conflict") conflicts.push({ dimension: dim.id, entityId: matrix.entities[i].id, values: v.values.map((x) => x.display) });
    });
  });
  const groups = new Map<string, number>();
  for (const r of ctx.goal?.requirements ?? []) groups.set(r.group, Math.max(groups.get(r.group) ?? 0, r.importance));
  return {
    entities: matrix.entities.map((e) => ({ id: e.id, type: e.type, name: e.name })),
    facts,
    missing,
    conflicts,
    differences: ctx.pairwise.map((p) => ({ dimension: p.dimension, text: p.interpretation, evidence: p.evidence })),
    priorities: ctx.goal ? [...groups.entries()].map(([group, importance]) => ({ group, importance })) : null,
  };
}

/*
  The check a generated summary must pass: every number in it must appear in the
  input it was given. A number the input does not hold is invented, and the text
  is rejected. Deliberately strict: it may reject a correct rewording, which is
  the cheaper failure.
*/
export function unsupportedNumbers(text: string, input: SummaryInput): string[] {
  const haystack = JSON.stringify(input);
  const found = text.match(/\d+(?:[.,]\d+)*%?/g) ?? [];
  return found.filter((n) => !haystack.includes(n.replace(/%$/, "")));
}
