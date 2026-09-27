import { money } from "../present";
import type { ModelItem, Plan, ToolItem } from "../types";
import { COMPARE_V1 } from "./config";
import { freshnessOf } from "./freshness";
import type { ComparisonValue, DataIssue, ScenarioCost, UsageScenario } from "./types";

/*
  Prices (guide 16 section 9, D165).

  THE ORIGINAL MODEL IS KEPT. A plan stays its tier, amount, currency, period and
  seat rule. Only the same unit is compared: a monthly individual plan with
  another monthly individual plan, an input token price with an input token price.
  An annual price is never silently divided into a monthly one, and a tool's
  subscription never meets a model's token price.
*/

type Tier = "individual" | "team" | "business";

export function planValue(tool: ToolItem, tier: Tier | "free" | "enterprise", now: number): ComparisonValue {
  const plans = tool.plans.filter((p) => p.tier === tier);
  if (plans.length === 0) return { state: "not_recorded" };

  const evidence = plans.map((p) => `plan:${p.id}`);
  const freshness = freshnessOf(oldestVerified(plans), "price", now);

  if (tier === "free") {
    return { state: "known", value: true, display: plans.map((p) => p.name).join(", "), evidence, freshness };
  }
  if (tier === "enterprise") {
    const priced = plans.find((p) => p.price !== null);
    const display = priced ? describePlan(priced) : "Custom terms";
    return { state: "known", value: display, display, evidence, freshness };
  }

  /* The cheapest MONTHLY price in the tier, in one currency. */
  const monthly = plans.filter((p) => p.period === "month" && p.price !== null && p.price >= 0);
  if (monthly.length > 0) {
    const cheapest = monthly.reduce((a, b) => (b.price! < a.price! ? b : a));
    return {
      state: "known",
      value: cheapest.price!,
      display: `${money(cheapest.price!, cheapest.currency)} per month${cheapest.perSeat ? " per seat" : ""} (${cheapest.name})`,
      evidence: [`plan:${cheapest.id}`],
      freshness: freshnessOf(cheapest.provenance.verifiedAt, "price", now),
      currency: cheapest.currency ?? "USD",
      note: cheapest.perSeat ? "per seat" : undefined,
    };
  }
  /* Only yearly, one time, usage or custom terms are recorded: shown as written,
     never converted, so it is text and never enters a numeric comparison. */
  const display = plans.map(describePlan).join("; ");
  return { state: "known", value: display, display, evidence, freshness };
}

function describePlan(p: Plan): string {
  if (p.price === null) return `${p.name}: custom terms`;
  const period =
    p.period === "month" ? "per month" : p.period === "year" ? "per year" : p.period === "one_time" ? "one time" : p.period === "usage" ? "usage based" : "custom terms";
  return `${p.name}: ${money(p.price, p.currency)} ${period}${p.perSeat ? " per seat" : ""}`;
}

function oldestVerified(plans: Plan[]): string | null {
  const dates = plans.map((p) => p.provenance.verifiedAt);
  if (dates.some((d) => !d)) return null;
  return dates.sort()[0] ?? null;
}

export type PriceKey = "input" | "cachedInput" | "cacheWrite" | "output" | "batchInput" | "batchOutput";

export const PRICE_KEY_OF: Record<string, PriceKey> = {
  price_input: "input",
  price_cached_input: "cachedInput",
  price_cache_write: "cacheWrite",
  price_output: "output",
  price_batch_input: "batchInput",
  price_batch_output: "batchOutput",
};

export function modelPriceValue(model: ModelItem, key: PriceKey, dimension: string, now: number, issues: DataIssue[]): ComparisonValue {
  const n = model.prices[key];
  if (n === null) return { state: "not_recorded" };
  if (n < 0) {
    issues.push({ code: "negative_price", entityId: model.id, dimension, message: `${model.name} has a negative recorded price, so it is not shown.`, visibility: "public" });
    return { state: "not_recorded" };
  }
  const flagged = n > COMPARE_V1.implausiblePricePerM;
  if (flagged) {
    issues.push({ code: "implausible_price", entityId: model.id, dimension, message: `${model.name} records ${money(n, "USD")} per 1M tokens, above the plausibility check. Shown as recorded.`, visibility: "public" });
  }
  return {
    state: "known",
    value: n,
    display: money(n, "USD"),
    evidence: [`price:${model.id}`],
    freshness: freshnessOf(model.prices.provenance.verifiedAt, "price", now),
    currency: "USD",
    note: flagged ? "Above the plausibility check" : undefined,
  };
}

/*
  Estimated cost under an explicit usage scenario. Only the standard input and
  output list prices are used; cache and batch discounts depend on how a workload
  is built, which a scenario of two numbers cannot say. A missing price makes the
  estimate null and says which, rather than treating it as free.
*/
export function scenarioCosts(models: ModelItem[], s: UsageScenario): ScenarioCost[] {
  return models.map((m) => {
    const inP = m.prices.input;
    const outP = m.prices.output;
    const missing: ("input" | "output")[] = [];
    if (s.inputTokens > 0 && (inP === null || inP < 0)) missing.push("input");
    if (s.outputTokens > 0 && (outP === null || outP < 0)) missing.push("output");
    const inputCost = s.inputTokens === 0 ? 0 : inP !== null && inP >= 0 ? (inP * s.inputTokens) / 1_000_000 : null;
    const outputCost = s.outputTokens === 0 ? 0 : outP !== null && outP >= 0 ? (outP * s.outputTokens) / 1_000_000 : null;
    return {
      entityId: m.id,
      inputCost,
      outputCost,
      cost: missing.length === 0 && inputCost !== null && outputCost !== null ? round6(inputCost + outputCost) : null,
      missing,
      evidence: [`price:${m.id}`],
    };
  });
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export const SCENARIO_LABEL = "Estimated cost under this usage scenario";
