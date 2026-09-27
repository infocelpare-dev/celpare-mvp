import { COMPARE_V1 } from "./config";
import { formatShort } from "./format";
import { known, numeric } from "./matrix";
import type { ComparisonMatrix, FitAnalysis, FitReason, KnownValue, ResolvedGoal } from "./types";

/*
  The fit engine (guide 16 section 18, D161).

  "How does each option match the stated requirements?", never "which is best".
  Per relevant dimension:

  - a directional number: the favourable end of the KNOWN values is a strength,
    the unfavourable end a tradeoff, the middle nothing; within 5% counts as equal
  - a flag: a recorded yes where another records no is a strength, the reverse a
    tradeoff; unrecorded is missing evidence, never a tradeoff (D164)
  - a recorded fit (strong, moderate, limited): stated as recorded, with its source

  Nothing is summed. No number is shown. Order inside a list is importance, then
  the size of the difference, which only decides what is read first.
*/

type Scored = FitReason & { magnitude: number };

export function fitAnalysis(matrix: ComparisonMatrix, goal: ResolvedGoal): { fit: FitAnalysis[]; sharedMissing: string[] } {
  const { entities } = matrix;
  const acc = entities.map((e) => ({ entityId: e.id, strengths: [] as Scored[], tradeoffs: [] as Scored[], missingEvidence: [] as string[] }));
  const relevant: string[] = [];
  const sharedMissing: string[] = [];

  for (const req of goal.requirements) {
    const di = matrix.dimensions.findIndex((d) => d.id === req.dimension);
    if (di === -1) continue;
    const dim = matrix.dimensions[di];
    const row = matrix.values[di];
    const applicable = row.map((v) => v.state !== "not_applicable");
    if (!applicable.some(Boolean)) continue;
    relevant.push(dim.id);

    const knownCount = row.filter(known).length;
    if (knownCount === 0) {
      sharedMissing.push(dim.id);
      continue;
    }
    row.forEach((v, i) => {
      if (applicable[i] && !known(v)) acc[i].missingEvidence.push(dim.id);
    });

    /* A recorded fit is a claim with a source, stated as it is. */
    if (dim.kind === "fit") {
      row.forEach((v, i) => {
        if (!known(v)) return;
        const r: Scored = {
          dimension: dim.id,
          text: `${v.display} (${dim.label}, recorded)`,
          reason: `Recorded as "${v.value}" for ${dim.label.toLowerCase()}.`,
          evidence: v.evidence,
          importance: req.importance,
          magnitude: 1,
        };
        if (v.value === "strong") acc[i].strengths.push(r);
        if (v.value === "limited") acc[i].tradeoffs.push(r);
      });
      continue;
    }

    if (knownCount < 2 || dim.direction === "none") continue;
    const names = entities.map((e) => e.name);

    if (dim.kind === "flag") {
      const vals = row.map((v) => (known(v) && typeof v.value === "boolean" ? v.value : null));
      if (!vals.includes(true) || !vals.includes(false)) continue;
      vals.forEach((b, i) => {
        if (b === null) return;
        const v = row[i] as KnownValue;
        const opposite = names.filter((_, j) => vals[j] === !b);
        const r: Scored = {
          dimension: dim.id,
          text: b ? (dim.better ?? `${dim.label}: recorded yes`) : (dim.worse ?? `${dim.label}: recorded no`),
          reason: `Recorded ${b ? "yes" : "no"}; recorded ${b ? "no" : "yes"} for ${opposite.join(", ")}.`,
          evidence: v.evidence,
          importance: req.importance,
          magnitude: 1,
        };
        (b ? acc[i].strengths : acc[i].tradeoffs).push(r);
      });
      continue;
    }

    const nums = row.map((v, i) => ({ v, i })).filter((x) => numeric(x.v)) as { v: KnownValue & { value: number }; i: number }[];
    if (nums.length < 2 || new Set(nums.map((x) => x.v.currency ?? "USD")).size > 1) continue;
    const vals = nums.map((x) => x.v.value);
    const best = dim.direction === "higher" ? Math.max(...vals) : Math.min(...vals);
    const worst = dim.direction === "higher" ? Math.min(...vals) : Math.max(...vals);
    const span = Math.abs(best - worst);
    const scale = Math.max(Math.abs(best), Math.abs(worst));
    if (span === 0 || scale === 0 || span / scale < COMPARE_V1.equalWithin) continue;

    const cur = nums[0].v.currency ?? "USD";
    for (const { v, i } of nums) {
      const position = Math.abs(v.value - worst) / span;
      const nearBest = Math.abs(v.value - best) / scale < COMPARE_V1.equalWithin;
      const nearWorst = Math.abs(v.value - worst) / scale < COMPARE_V1.equalWithin;
      /* Compared only against values that actually differ; equal ones are named
         as the same, so a shared top value never reads "128K vs 128K". */
      const near = (x: { v: { value: number } }) => Math.abs(x.v.value - v.value) / scale < COMPARE_V1.equalWithin;
      const differ = nums.filter((x) => x.i !== i && !near(x));
      /* "The same" only when it IS the same; close values are said to be close,
         with their number, because 53.3% and 54.4% are not the same result. */
      const same = nums.filter((x) => x.i !== i && x.v.value === v.value).map((x) => names[x.i]);
      const close = nums.filter((x) => x.i !== i && near(x) && x.v.value !== v.value);
      const reason =
        `${dim.label}: ${formatShort(dim, v.value, cur)} vs ` +
        differ.map((x) => `${formatShort(dim, x.v.value, cur)} (${names[x.i]})`).join(", ") +
        (same.length > 0 ? `; the same as ${same.join(", ")}` : "") +
        (close.length > 0 ? `; within 5% of ${close.map((x) => `${formatShort(dim, x.v.value, cur)} (${names[x.i]})`).join(", ")}` : "") +
        ".";
      const base = { dimension: dim.id, reason, evidence: v.evidence, importance: req.importance, magnitude: span / scale };
      if (position >= COMPARE_V1.strengthAt || nearBest) acc[i].strengths.push({ ...base, text: dim.better ?? dim.label });
      else if (position <= COMPARE_V1.tradeoffAt || nearWorst) acc[i].tradeoffs.push({ ...base, text: dim.worse ?? dim.label });
    }
  }

  const order = (a: Scored, b: Scored) => b.importance - a.importance || b.magnitude - a.magnitude;
  const strip = (list: Scored[]): FitReason[] =>
    list
      .sort(order)
      .slice(0, COMPARE_V1.maxReasons)
      .map((r) => ({ dimension: r.dimension, text: r.text, reason: r.reason, evidence: r.evidence, importance: r.importance }));

  return {
    fit: acc.map((a) => ({
      entityId: a.entityId,
      strengths: strip(a.strengths),
      tradeoffs: strip(a.tradeoffs),
      missingEvidence: a.missingEvidence,
      relevantDimensions: relevant,
    })),
    sharedMissing,
  };
}
