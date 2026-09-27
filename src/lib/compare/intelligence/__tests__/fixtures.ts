import type { Attribute, Evaluation, Fact, ModelItem, Plan, ToolItem } from "../../types";
import { buildRequest } from "../request";
import { runCompare } from "../pipeline";
import type { CompareInput, CompareResult, PerformanceRow, PreferenceWeights, UsageScenario } from "../types";
import type { CompareGoal } from "../../types";

/*
  Fixtures in the shapes loadComparison returns. Ids are valid uuids built from a
  short name, so a failing assertion still reads.
*/

export const NOW = Date.parse("2026-09-27T12:00:00Z");
const DAY = 86_400_000;

export function uid(name: string): string {
  let h = 0;
  for (const c of name) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  return `${hex}-0000-4000-8000-${hex}0000`.slice(0, 36);
}

export const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

const prov = (verifiedDaysAgo: number | null = 5, url: string | null = "https://example.com/source") => ({
  label: "Source",
  url,
  verifiedAt: verifiedDaysAgo === null ? null : daysAgo(verifiedDaysAgo),
});

export const ATTRIBUTES: Attribute[] = [
  { key: "web_search", section: "capabilities", appliesTo: ["tool"], valueType: "flag", label: "Web search", unit: null, sortOrder: 1 },
  { key: "code_generation", section: "capabilities", appliesTo: ["tool"], valueType: "flag", label: "Code generation", unit: null, sortOrder: 2 },
  { key: "agents", section: "capabilities", appliesTo: ["tool"], valueType: "flag", label: "Agents", unit: null, sortOrder: 3 },
  { key: "coding", section: "capabilities", appliesTo: ["model"], valueType: "flag", label: "Coding", unit: null, sortOrder: 4 },
  { key: "tool_calling", section: "capabilities", appliesTo: ["model"], valueType: "flag", label: "Tool calling", unit: null, sortOrder: 5 },
  { key: "reasoning", section: "capabilities", appliesTo: ["model"], valueType: "flag", label: "Reasoning", unit: null, sortOrder: 6 },
  { key: "integration_github", section: "integrations", appliesTo: ["tool"], valueType: "flag", label: "GitHub", unit: null, sortOrder: 7 },
  { key: "integration_slack", section: "integrations", appliesTo: ["tool"], valueType: "flag", label: "Slack", unit: null, sortOrder: 8 },
  { key: "integration_other", section: "integrations", appliesTo: ["tool"], valueType: "list", label: "Other integrations", unit: null, sortOrder: 9 },
  { key: "deploy_api", section: "deployment", appliesTo: ["tool", "model"], valueType: "flag", label: "API", unit: null, sortOrder: 10 },
  { key: "deploy_self_hosted", section: "deployment", appliesTo: ["tool", "model"], valueType: "flag", label: "Self hosted", unit: null, sortOrder: 11 },
  { key: "trains_on_user_data", section: "privacy", appliesTo: ["tool", "model"], valueType: "text", label: "Trains on user data", unit: null, sortOrder: 12 },
  { key: "enterprise_controls", section: "privacy", appliesTo: ["tool", "model"], valueType: "flag", label: "Enterprise controls", unit: null, sortOrder: 13 },
  { key: "fit_coding", section: "use_cases", appliesTo: ["tool", "model"], valueType: "fit", label: "Coding", unit: null, sortOrder: 14 },
  { key: "strength", section: "strengths", appliesTo: ["tool", "model"], valueType: "list", label: "Strength", unit: null, sortOrder: 15 },
];

let factSeq = 0;
export function fact(attribute: string, v: { flag?: boolean; text?: string; number?: number }, verifiedDaysAgo: number | null = 5): Fact {
  factSeq += 1;
  return {
    id: uid(`fact-${attribute}-${factSeq}`),
    attribute,
    flag: v.flag ?? null,
    text: v.text ?? null,
    number: v.number ?? null,
    note: null,
    provenance: prov(verifiedDaysAgo),
  };
}

let planSeq = 0;
export function plan(tier: Plan["tier"], price: number | null, extra: Partial<Plan> = {}): Plan {
  planSeq += 1;
  return {
    id: uid(`plan-${tier}-${planSeq}`),
    name: `${tier} plan`,
    tier,
    price,
    annualPrice: null,
    currency: price === null ? null : "USD",
    period: price === null ? "custom" : "month",
    perSeat: false,
    trialDays: null,
    limits: null,
    provenance: prov(5),
    ...extra,
  };
}

export function tool(name: string, extra: Partial<ToolItem> = {}): ToolItem {
  return {
    type: "tool",
    id: uid(`tool-${name}`),
    slug: name,
    name,
    href: `/tools/${name}`,
    websiteUrl: `https://${name}.example.com`,
    description: null,
    facts: [],
    listedUpdatedAt: daysAgo(10),
    tagline: null,
    logoUrl: null,
    categories: ["coding"],
    pricingSummary: null,
    pricingModel: "freemium",
    features: [],
    platforms: [],
    verified: false,
    rating: null,
    ratingCount: 0,
    ratingBreakdown: null,
    latestReviewAt: null,
    inCatalogueSince: null,
    plans: [],
    ...extra,
  };
}

let evalSeq = 0;
export function evaluation(name: string, score: number, extra: Partial<Evaluation> = {}): Evaluation {
  evalSeq += 1;
  return {
    id: uid(`eval-${name}-${evalSeq}`),
    kind: "benchmark",
    domain: "coding",
    name,
    metric: "resolved",
    score,
    unit: "percent",
    higherIsBetter: true,
    ciLow: null,
    ciHigh: null,
    modelVersion: "v1",
    harness: "standard",
    evaluator: "Lab",
    datasetVersion: "1",
    evaluatedAt: daysAgo(5).slice(0, 10),
    note: null,
    benchmarkSlug: name.toLowerCase().replace(/\s+/g, "-"),
    reporterRelation: "provider",
    methodologyUrl: null,
    publishedAt: null,
    provenance: prov(5),
    ...extra,
  };
}

export function model(name: string, extra: Partial<Omit<ModelItem, "prices">> & { prices?: Partial<ModelItem["prices"]> } = {}): ModelItem {
  const { prices, ...rest } = extra;
  return {
    type: "model",
    id: uid(`model-${name}`),
    slug: name,
    name,
    href: null,
    websiteUrl: `https://${name}.example.com`,
    description: null,
    facts: [],
    listedUpdatedAt: daysAgo(10),
    provider: "Lab",
    family: null,
    version: null,
    apiModelId: null,
    releaseDate: null,
    lifecycle: null,
    openWeights: null,
    contextWindow: null,
    maxOutputTokens: null,
    modalities: [],
    outputModalities: [],
    evaluations: [],
    ...rest,
    prices: {
      input: null,
      cachedInput: null,
      cacheWrite: null,
      output: null,
      batchInput: null,
      batchOutput: null,
      note: null,
      provenance: { label: "OpenRouter model listing", url: "https://openrouter.ai/x", verifiedAt: daysAgo(5) },
      ...prices,
    },
  };
}

export function input(items: (ToolItem | ModelItem)[], extra: Partial<CompareInput> = {}): CompareInput {
  return {
    items,
    attributes: ATTRIBUTES,
    benchmarks: [],
    performance: [],
    health: { facts: true, plans: true, evaluations: true, reviews: true, performance: true },
    now: NOW,
    ...extra,
  };
}

export function perf(modelName: string, metric: PerformanceRow["metric"], value: number, extra: Partial<PerformanceRow> = {}): PerformanceRow {
  const unit = metric === "output_tps" ? "tokens_per_s" : metric === "throughput_rps" ? "requests_per_s" : metric === "uptime_pct" ? "percent" : "ms";
  return {
    id: uid(`perf-${modelName}-${metric}-${value}`),
    modelId: uid(`model-${modelName}`),
    metric,
    value,
    unit,
    providerEndpoint: "provider-a",
    environment: null,
    methodologyUrl: null,
    measuredAt: daysAgo(3),
    provenance: prov(3),
    ...extra,
  };
}

export function run(
  items: (ToolItem | ModelItem)[],
  opts: { goal?: CompareGoal | null; weights?: PreferenceWeights | null; scenario?: UsageScenario | null; extra?: Partial<CompareInput> } = {},
): CompareResult {
  const req = buildRequest({ entities: items.map((i) => ({ type: i.type, id: i.id })), goal: opts.goal, weights: opts.weights, scenario: opts.scenario });
  if (!req.ok) throw new Error(`request rejected: ${req.error}`);
  return runCompare(req.request, input(items, opts.extra));
}

export function cell(r: CompareResult, dimension: string, entityName: string) {
  const di = r.matrix.dimensions.findIndex((d) => d.id === dimension);
  if (di === -1) throw new Error(`no dimension ${dimension}`);
  const ei = r.matrix.entities.findIndex((e) => e.name === entityName);
  return r.matrix.values[di][ei];
}
