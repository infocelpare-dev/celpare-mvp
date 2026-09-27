import { money, tokens } from "../present";
import type { ComparisonDimension, UnitClass } from "./types";

/*
  How a number reads, per unit class. Presentation only: nothing here rounds a
  value the engine compares, it rounds what a person reads.
*/

const PRICE_SUFFIX: Partial<Record<UnitClass, string>> = {
  per_1m_input: "per 1M input tokens",
  per_1m_cached_input: "per 1M cached input tokens",
  per_1m_cache_write: "per 1M cache write tokens",
  per_1m_output: "per 1M output tokens",
  per_1m_batch_input: "per 1M batch input tokens",
  per_1m_batch_output: "per 1M batch output tokens",
  per_month: "per month",
};

function trim(n: number, digits = 2): string {
  return String(Number(n.toFixed(digits)));
}

export function formatNumber(unit: UnitClass | null, n: number, currency = "USD"): string {
  switch (unit) {
    case "tokens":
      return `${tokens(n)} tokens`;
    case "ms":
      return `${trim(n, 0)} ms`;
    case "tokens_per_s":
      return `${trim(n, 1)} tokens/s`;
    case "requests_per_s":
      return `${trim(n, 1)} requests/s`;
    case "percent":
      return `${trim(n, 1)}%`;
    case "rating":
      return trim(n, 1);
    case "count":
      return String(Math.round(n));
    case "score":
      return trim(n, 2);
    default: {
      const suffix = unit ? PRICE_SUFFIX[unit] : undefined;
      if (suffix) return `${money(n, currency)} ${suffix}`;
      return trim(n, 2);
    }
  }
}

/* A delta in the dimension's own unit, without a sign: "72K tokens", "$1.70". */
export function formatDelta(dim: ComparisonDimension, delta: number, currency = "USD"): string {
  const d = Math.abs(delta);
  if (dim.kind === "money") return money(d, currency);
  if (dim.unit === "percent") return `${trim(d, 1)} points`;
  return formatNumber(dim.unit, d, currency);
}

/* The short form a table cell or a reason uses: "$2.50", "1M". */
export function formatShort(dim: ComparisonDimension, n: number, currency = "USD"): string {
  if (dim.kind === "money") return money(n, currency);
  if (dim.unit === "tokens") return tokens(n);
  return formatNumber(dim.unit, n, currency);
}
