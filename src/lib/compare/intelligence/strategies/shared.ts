import type { CompareInput, ComparisonDimension, ComparisonEntity, ComparisonValue, DataIssue } from "../types";
import type { Fact } from "../../types";
import { freshnessOf, worstFreshness } from "../freshness";

/*
  What every strategy shares: the contract, and reading a compare_facts value.

  A strategy decides WHICH dimensions a comparison has and HOW a value is read
  from an entity. It never scores. Adding a Course or an Agent later is a new
  strategy and new dimensions; the pipeline does not change (guide 16 section 7).
*/

export type ExtractContext = {
  input: CompareInput;
  now: number;
  issues: DataIssue[];
};

export interface ComparisonStrategy {
  id: "tool" | "model" | "mixed";
  dimensions(input: CompareInput): ComparisonDimension[];
  extract(dim: ComparisonDimension, entity: ComparisonEntity, ctx: ExtractContext): ComparisonValue;
}

const FIT_WORDS: Record<string, string> = { strong: "Strong fit", moderate: "Moderate fit", limited: "Limited fit" };

/* A compare_facts value. Unrecorded is not_recorded; a recorded no is known false (D164). */
export function factValue(entity: ComparisonEntity, key: string, kind: ComparisonDimension["kind"], now: number): ComparisonValue {
  const facts: Fact[] = entity.item.facts.filter((f) => f.attribute === key);
  if (facts.length === 0) return { state: "not_recorded" };
  const evidence = facts.map((f) => `fact:${f.id}`);
  const freshness = worstFreshness(facts.map((f) => freshnessOf(f.provenance.verifiedAt, "fact", now)));
  const note = facts.map((f) => f.note).filter(Boolean).join(". ") || undefined;

  if (kind === "list") {
    const list = facts.map((f) => f.text ?? (f.number !== null ? String(f.number) : null)).filter((s): s is string => Boolean(s));
    if (list.length === 0) return { state: "not_recorded" };
    return { state: "known", value: list, display: list.join(", "), evidence, freshness, note };
  }

  const f = facts[0];
  if (kind === "flag") {
    if (f.flag === null) return { state: "not_recorded" };
    return { state: "known", value: f.flag, display: f.flag ? "Yes" : "No", evidence, freshness, note };
  }
  if (kind === "fit") {
    if (!f.text) return { state: "not_recorded" };
    return { state: "known", value: f.text, display: FIT_WORDS[f.text] ?? f.text, evidence, freshness, note };
  }
  if (kind === "number") {
    if (f.number === null) return { state: "not_recorded" };
    return { state: "known", value: f.number, display: String(f.number), evidence, freshness, note };
  }
  if (!f.text) return { state: "not_recorded" };
  return { state: "known", value: f.text, display: f.text, evidence, freshness, note };
}

export function textValue(v: string | null, evidence: string[], freshness: "fresh" | "unknown" = "fresh"): ComparisonValue {
  if (!v) return { state: "not_recorded" };
  return { state: "known", value: v, display: v, evidence, freshness };
}

export function appliesTo(dim: ComparisonDimension, entity: ComparisonEntity): boolean {
  return dim.appliesTo.includes(entity.type);
}
