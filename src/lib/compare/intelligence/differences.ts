import { likeForLikeCaveat } from "./benchmarks";
import { formatDelta, formatShort } from "./format";
import { known, numeric } from "./matrix";
import type { ComparisonDimension, ComparisonMatrix, ComparisonValue, DataIssue, DimensionDifference, DimensionStats, KnownValue } from "./types";

/*
  The difference engine (guide 16 section 14).

  Pairwise: for every pair, every dimension where BOTH values are known. The
  wording comes from a fixed rule per kind; there is no adjective a rule does not
  define. A missing value is never a difference: it is coverage.

  Multi entity: min, max, median, range and coverage per dimension, and the
  factual leader of a directional dimension. A leader needs two known values,
  ties are named, and leaders are never added up into a winner (D164).
*/

function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function sameCurrency(a: KnownValue, b: KnownValue): boolean {
  return (a.currency ?? "USD") === (b.currency ?? "USD");
}

function caveatFor(dim: ComparisonDimension, row: ComparisonValue[]): string | undefined {
  return dim.kind === "benchmark" ? likeForLikeCaveat(row) : undefined;
}

export function pairwise(matrix: ComparisonMatrix, issues: DataIssue[]): DimensionDifference[] {
  const out: DimensionDifference[] = [];
  const { entities } = matrix;

  matrix.dimensions.forEach((dim, di) => {
    const row = matrix.values[di];
    const caveat = caveatFor(dim, row);
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const va = row[i];
        const vb = row[j];
        if (!known(va) || !known(vb)) continue;
        const A = entities[i].name;
        const B = entities[j].name;
        const base = { dimension: dim.id, a: entities[i].id, b: entities[j].id, displayA: va.display, displayB: vb.display, evidence: [...va.evidence, ...vb.evidence] };

        if (numeric(va) && numeric(vb)) {
          if (!sameCurrency(va, vb)) {
            issues.push({ code: "currency_mismatch", dimension: dim.id, message: `${A} and ${B} are priced in different currencies, so ${lower(dim.label)} is not compared.`, visibility: "debug" });
            out.push({ ...base, interpretation: `${dim.label}: ${A} ${va.display}, ${B} ${vb.display}. Different currencies, not compared.` });
            continue;
          }
          const a = va.value;
          const b = vb.value;
          const delta = a - b;
          const scale = Math.max(Math.abs(a), Math.abs(b));
          const cur = va.currency ?? "USD";
          if (delta === 0 || (scale > 0 && Math.abs(delta) / scale < 0.005)) {
            out.push({ ...base, delta: 0, deltaPercent: 0, interpretation: `${A} and ${B} record the same ${lower(dim.label)} (${formatShort(dim, a, cur)}).`, caveat });
            continue;
          }
          const deltaPercent = b !== 0 ? (delta / Math.abs(b)) * 100 : undefined;
          const word = delta > 0 ? "higher" : "lower";
          const pct = deltaPercent !== undefined ? ` (${Math.abs(Math.round(deltaPercent))}% ${word})` : "";
          out.push({
            ...base,
            delta,
            deltaPercent,
            interpretation: `${dim.label}: ${A} ${formatShort(dim, a, cur)}, ${B} ${formatShort(dim, b, cur)}. ${A} is ${formatDelta(dim, delta, cur)} ${word}${pct}.`,
            caveat,
          });
          continue;
        }

        if (typeof va.value === "boolean" && typeof vb.value === "boolean") {
          if (va.value === vb.value) continue;
          const yes = va.value ? A : B;
          const no = va.value ? B : A;
          /* A platform a listing omits is "not listed", never "not supported". */
          out.push({
            ...base,
            interpretation:
              dim.section === "platforms"
                ? `${dim.label}: listed by ${yes}, not listed by ${no}.`
                : `${dim.label}: recorded yes for ${yes}, recorded no for ${no}.`,
          });
          continue;
        }

        if (Array.isArray(va.value) && Array.isArray(vb.value)) {
          const sa = new Set(va.value.map((s) => s.toLowerCase()));
          const sb = new Set(vb.value.map((s) => s.toLowerCase()));
          const onlyA = va.value.filter((s) => !sb.has(s.toLowerCase()));
          const onlyB = vb.value.filter((s) => !sa.has(s.toLowerCase()));
          if (onlyA.length === 0 && onlyB.length === 0) continue;
          const parts = [
            onlyA.length > 0 ? `only ${A} lists ${onlyA.join(", ")}` : null,
            onlyB.length > 0 ? `only ${B} lists ${onlyB.join(", ")}` : null,
          ].filter(Boolean);
          out.push({ ...base, interpretation: `${dim.label}: ${parts.join("; ")}.` });
          continue;
        }

        if (va.display !== vb.display) {
          out.push({ ...base, interpretation: `${dim.label}: ${A} ${va.display}; ${B} ${vb.display}.` });
        }
      }
    }
  });
  return out;
}

function median(sorted: number[]): number {
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

export function dimensionStats(matrix: ComparisonMatrix): DimensionStats[] {
  return matrix.dimensions.map((dim, di) => {
    const row = matrix.values[di];
    const stats: DimensionStats = { dimension: dim.id, known: row.filter(known).length, total: row.length };
    const nums = row.map((v, i) => ({ v, i })).filter((x): x is { v: KnownValue & { value: number }; i: number } => numeric(x.v));
    if (nums.length === 0) return stats;
    const currencies = new Set(nums.map((x) => x.v.currency ?? "USD"));
    if (currencies.size > 1) return stats;

    const sorted = nums.map((x) => x.v.value).sort((a, b) => a - b);
    stats.min = sorted[0];
    stats.max = sorted[sorted.length - 1];
    stats.range = stats.max - stats.min;
    if (sorted.length >= 3) stats.median = median(sorted);

    if (dim.direction !== "none" && dim.leaderLabel && nums.length >= 2 && stats.range > 0) {
      const best = dim.direction === "higher" ? stats.max : stats.min;
      /* Within 0.5% of the best is a tie, the same threshold as "record the same":
         1,048,576 and 1,050,000 tokens both read 1.05M, and naming one of them
         alone would claim a difference the reader cannot see. */
      const scale = Math.max(Math.abs(stats.max), Math.abs(stats.min));
      const ids = nums
        .filter((x) => scale === 0 || Math.abs(x.v.value - best) / scale < 0.005)
        .map((x) => matrix.entities[x.i].id);
      stats.leader = {
        dimension: dim.id,
        label: dim.leaderLabel,
        entityIds: ids,
        display: formatShort(dim, best, nums[0].v.currency ?? "USD"),
        caveat: caveatFor(dim, row),
      };
    }
    return stats;
  });
}
