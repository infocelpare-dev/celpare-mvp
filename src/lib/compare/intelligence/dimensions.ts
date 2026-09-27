import { PLATFORMS } from "../present";
import type { Attribute, CompareItem, CompareItemType, Evaluation } from "../types";
import type { ComparisonDimension, DimensionSection, PerformanceMetric } from "./types";

/*
  The dimension registry (guide 16 section 6).

  Three sources: fixed dimensions read from catalogue columns, one dimension per
  compare_attributes key (the closed vocabulary, so a new attribute becomes a
  dimension without code), and one dimension per benchmark and metric that any
  compared model has a result on. Benchmarks are never merged (D166).
*/

export const SECTION_ORDER: DimensionSection[] = [
  "overview",
  "use_cases",
  "capabilities",
  "integrations",
  "platforms",
  "pricing",
  "context",
  "modalities",
  "performance",
  "benchmarks",
  "technical",
  "privacy",
  "community",
];

const T: CompareItemType[] = ["tool"];
const M: CompareItemType[] = ["model"];

type Def = Omit<ComparisonDimension, "comparableAcross" | "freshness"> &
  Partial<Pick<ComparisonDimension, "comparableAcross" | "freshness">>;

function def(d: Def): ComparisonDimension {
  return { comparableAcross: false, freshness: "identity", ...d };
}

/* ---------------------------------------------------------------------------
   Tools
   --------------------------------------------------------------------------- */

const TIER_NAMES = { individual: "individual", team: "team", business: "business" } as const;

export const TOOL_FIXED: ComparisonDimension[] = [
  def({ id: "tool.categories", label: "Categories", section: "overview", appliesTo: T, kind: "list", unit: null, direction: "none" }),
  def({ id: "tool.verified", label: "Owner verified listing", section: "overview", appliesTo: T, kind: "flag", unit: null, direction: "none" }),
  def({ id: "tool.pricing_model", label: "Pricing model", section: "pricing", appliesTo: T, kind: "text", unit: null, direction: "none" }),
  def({
    id: "plan:free",
    label: "Free plan",
    section: "pricing",
    appliesTo: T,
    kind: "flag",
    unit: null,
    direction: "higher",
    freshness: "price",
    better: "Free plan recorded",
  }),
  ...(Object.keys(TIER_NAMES) as (keyof typeof TIER_NAMES)[]).map((tier) =>
    def({
      id: `plan:${tier}`,
      label: `Lowest ${tier} plan, monthly`,
      section: "pricing",
      appliesTo: T,
      kind: "money",
      unit: "per_month",
      direction: "lower",
      freshness: "price",
      leaderLabel: `Lowest listed ${tier} plan price`,
      better: `Lower listed ${tier} plan price`,
      worse: `Higher listed ${tier} plan price`,
    }),
  ),
  def({ id: "plan:enterprise", label: "Enterprise plan", section: "pricing", appliesTo: T, kind: "text", unit: null, direction: "none", freshness: "price" }),
  ...PLATFORMS.map((p) =>
    def({ id: `platform:${p}`, label: p, section: "platforms", appliesTo: T, kind: "flag", unit: null, direction: "none" }),
  ),
  def({
    id: "tool.integrations_count",
    label: "Integrations recorded",
    section: "integrations",
    appliesTo: T,
    kind: "number",
    unit: "count",
    direction: "higher",
    freshness: "fact",
    leaderLabel: "Most integrations recorded",
    better: "More integrations recorded",
    worse: "Fewer integrations recorded",
  }),
  /* Community evidence. Direction none on purpose: an average of a handful of
     ratings is shown, never led or used as a strength (D128, D13). */
  def({ id: "tool.rating", label: "Average rating", section: "community", appliesTo: T, kind: "number", unit: "rating", direction: "none" }),
  def({ id: "tool.rating_count", label: "Ratings", section: "community", appliesTo: T, kind: "number", unit: "count", direction: "none" }),
];

/* ---------------------------------------------------------------------------
   Models
   --------------------------------------------------------------------------- */

const PRICE_DIMS: [string, string, ComparisonDimension["unit"], string][] = [
  ["price_input", "Input price", "per_1m_input", "input"],
  ["price_cached_input", "Cached input price", "per_1m_cached_input", "cached input"],
  ["price_cache_write", "Cache write price", "per_1m_cache_write", "cache write"],
  ["price_output", "Output price", "per_1m_output", "output"],
  ["price_batch_input", "Batch input price", "per_1m_batch_input", "batch input"],
  ["price_batch_output", "Batch output price", "per_1m_batch_output", "batch output"],
];

export const PERF_DIMS: { metric: PerformanceMetric; label: string; unit: ComparisonDimension["unit"]; direction: "higher" | "lower"; leader: string; better: string; worse: string }[] = [
  { metric: "ttft_ms", label: "Time to first token", unit: "ms", direction: "lower", leader: "Fastest measured time to first token", better: "Faster measured time to first token", worse: "Slower measured time to first token" },
  { metric: "output_tps", label: "Output speed", unit: "tokens_per_s", direction: "higher", leader: "Highest measured output speed", better: "Higher measured output speed", worse: "Lower measured output speed" },
  { metric: "e2e_latency_ms", label: "End to end latency", unit: "ms", direction: "lower", leader: "Lowest measured end to end latency", better: "Lower measured latency", worse: "Higher measured latency" },
  { metric: "throughput_rps", label: "Throughput", unit: "requests_per_s", direction: "higher", leader: "Highest measured throughput", better: "Higher measured throughput", worse: "Lower measured throughput" },
  { metric: "uptime_pct", label: "Uptime", unit: "percent", direction: "higher", leader: "Highest measured uptime", better: "Higher measured uptime", worse: "Lower measured uptime" },
];

export const MODEL_FIXED: ComparisonDimension[] = [
  def({ id: "model.provider", label: "Provider", section: "overview", appliesTo: M, kind: "text", unit: null, direction: "none" }),
  def({ id: "model.family", label: "Family", section: "overview", appliesTo: M, kind: "text", unit: null, direction: "none" }),
  def({ id: "model.version", label: "Version", section: "overview", appliesTo: M, kind: "text", unit: null, direction: "none" }),
  def({ id: "model.api_model_id", label: "API model id", section: "overview", appliesTo: M, kind: "text", unit: null, direction: "none" }),
  def({ id: "model.release_date", label: "Release date", section: "overview", appliesTo: M, kind: "text", unit: null, direction: "none" }),
  def({ id: "model.lifecycle", label: "Status", section: "overview", appliesTo: M, kind: "text", unit: null, direction: "none" }),
  def({
    id: "model.open_weights",
    label: "Open weights",
    section: "overview",
    appliesTo: M,
    kind: "flag",
    unit: null,
    direction: "higher",
    better: "Open weights",
    worse: "Weights not open",
  }),
  def({
    id: "context_window",
    label: "Context window",
    section: "context",
    appliesTo: M,
    kind: "number",
    unit: "tokens",
    direction: "higher",
    freshness: "fact",
    leaderLabel: "Largest context window",
    better: "Larger context window",
    worse: "Smaller context window",
  }),
  def({
    id: "max_output",
    label: "Maximum output",
    section: "context",
    appliesTo: M,
    kind: "number",
    unit: "tokens",
    direction: "higher",
    freshness: "fact",
    leaderLabel: "Largest maximum output",
    better: "Larger maximum output",
    worse: "Smaller maximum output",
  }),
  def({ id: "modalities_in", label: "Input modalities", section: "modalities", appliesTo: M, kind: "list", unit: null, direction: "none", freshness: "fact" }),
  def({ id: "modalities_out", label: "Output modalities", section: "modalities", appliesTo: M, kind: "list", unit: null, direction: "none", freshness: "fact" }),
  ...PRICE_DIMS.map(([id, label, unit, words]) =>
    def({
      id,
      label: `${label}, per 1M tokens`,
      section: "pricing",
      appliesTo: M,
      kind: "money",
      unit,
      direction: "lower",
      freshness: "price",
      leaderLabel: `Lowest listed ${words} price`,
      better: `Lower listed ${words} price`,
      worse: `Higher listed ${words} price`,
    }),
  ),
  ...PERF_DIMS.map((p) =>
    def({
      id: `perf:${p.metric}`,
      label: p.label,
      section: "performance",
      appliesTo: M,
      kind: "performance",
      unit: p.unit,
      direction: p.direction,
      freshness: "performance",
      leaderLabel: p.leader,
      better: p.better,
      worse: p.worse,
    }),
  ),
];

/* ---------------------------------------------------------------------------
   compare_attributes -> dimensions
   --------------------------------------------------------------------------- */

const ATTRIBUTE_SECTION: Record<string, DimensionSection | null> = {
  identity: "overview",
  capabilities: "capabilities",
  integrations: "integrations",
  deployment: "technical",
  technical: "technical",
  privacy: "privacy",
  use_cases: "use_cases",
  /* Strengths and limitations are claims with sources, drawn in their own
     section. They are not dimensions: a list of sentences has no value to compare. */
  strengths: null,
  limitations: null,
};

export function factDimensions(attributes: Attribute[]): ComparisonDimension[] {
  const out: ComparisonDimension[] = [];
  for (const a of attributes) {
    const section = ATTRIBUTE_SECTION[a.section];
    if (!section) continue;
    const kind = a.valueType === "fit" ? "fit" : a.valueType;
    out.push({
      id: `fact:${a.key}`,
      label: a.label,
      section,
      appliesTo: a.appliesTo,
      kind,
      unit: null,
      /* A recorded yes is the favourable end of a capability flag. Numbers and
         text in the vocabulary carry no direction. */
      direction: kind === "flag" ? "higher" : "none",
      comparableAcross: a.appliesTo.includes("tool") && a.appliesTo.includes("model"),
      freshness: "fact",
      better: kind === "flag" ? `${a.label}: recorded yes` : undefined,
      worse: kind === "flag" ? `${a.label}: recorded no` : undefined,
      factKey: a.key,
    });
  }
  return out;
}

/*
  Shared concepts for mixed sets (D162): the tool and model vocabularies name the
  same capability differently. Only pairs that mean the same thing are listed.
*/
export const CONCEPTS: { id: string; label: string; tool: string; model: string }[] = [
  { id: "concept:coding", label: "Coding", tool: "code_generation", model: "coding" },
  { id: "concept:agents", label: "Agents", tool: "agents", model: "agentic" },
  { id: "concept:image", label: "Image generation", tool: "image_generation", model: "image_output" },
];

export function conceptDimensions(): ComparisonDimension[] {
  return CONCEPTS.map((c) => ({
    id: c.id,
    label: c.label,
    section: "capabilities" as const,
    appliesTo: ["tool", "model"] as CompareItemType[],
    kind: "flag" as const,
    unit: null,
    direction: "higher" as const,
    comparableAcross: true,
    freshness: "fact" as const,
    better: `${c.label}: recorded yes`,
    worse: `${c.label}: recorded no`,
  }));
}

/* ---------------------------------------------------------------------------
   Benchmarks -> one dimension per benchmark and metric
   --------------------------------------------------------------------------- */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function benchmarkKey(e: Pick<Evaluation, "benchmarkSlug" | "name" | "metric">): string {
  return `bench:${e.benchmarkSlug ?? slugify(e.name)}:${slugify(e.metric)}`;
}

export function benchmarkDimensions(items: CompareItem[]): ComparisonDimension[] {
  const seen = new Map<string, Evaluation>();
  for (const item of items) {
    if (item.type !== "model") continue;
    for (const e of item.evaluations) {
      const key = benchmarkKey(e);
      if (!seen.has(key)) seen.set(key, e);
    }
  }
  const names = new Map<string, number>();
  for (const e of seen.values()) names.set(e.name, (names.get(e.name) ?? 0) + 1);

  return [...seen.entries()]
    .sort((a, b) => a[1].domain.localeCompare(b[1].domain) || a[1].name.localeCompare(b[1].name))
    .map(([key, e]) => {
      const label = (names.get(e.name) ?? 0) > 1 ? `${e.name} (${e.metric})` : e.name;
      const up = e.higherIsBetter;
      return {
        id: key,
        label,
        section: "benchmarks" as const,
        appliesTo: M,
        kind: "benchmark" as const,
        unit: e.unit === "percent" ? ("percent" as const) : ("score" as const),
        direction: up ? ("higher" as const) : ("lower" as const),
        comparableAcross: false,
        freshness: "benchmark" as const,
        leaderLabel: `${up ? "Highest" : "Lowest"} ${label} result`,
        better: `${up ? "Higher" : "Lower"} ${label} result`,
        worse: `${up ? "Lower" : "Higher"} ${label} result`,
        benchmark: { slug: e.benchmarkSlug, name: e.name, metric: e.metric, domain: e.domain },
      };
    });
}

export function sortBySection(dims: ComparisonDimension[]): ComparisonDimension[] {
  const at = new Map(SECTION_ORDER.map((s, i) => [s, i]));
  return dims
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (at.get(a.d.section) ?? 99) - (at.get(b.d.section) ?? 99) || a.i - b.i)
    .map((x) => x.d);
}
