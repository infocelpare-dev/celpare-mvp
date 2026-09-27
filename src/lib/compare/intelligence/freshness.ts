import { COMPARE_V1 } from "./config";
import type { Freshness, FreshnessClass } from "./types";

/*
  How old a value is, per class (guide 16 section 12). A stale value is still
  shown, with its date, as older data. It is never presented as current, and it
  is never hidden either: hiding it would turn "old" into "missing".
*/

export function ageDays(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

export function freshnessOf(iso: string | null | undefined, cls: FreshnessClass, now: number): Freshness {
  const age = ageDays(iso, now);
  if (age === null) return "unknown";
  const limit = COMPARE_V1.staleAfterDays[cls];
  if (limit === null) return "fresh";
  if (age > limit) return "stale";
  return age <= limit * COMPARE_V1.freshShare ? "fresh" : "aging";
}

/* The worst of several, for a value built from more than one row. */
export function worstFreshness(list: Freshness[]): Freshness {
  const order: Freshness[] = ["stale", "unknown", "aging", "fresh"];
  for (const f of order) if (list.includes(f)) return f;
  return "unknown";
}
