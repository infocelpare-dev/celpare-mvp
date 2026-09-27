import type {
  Attribute,
  BenchmarkInfo,
  CompareGoal,
  CompareItem,
  CompareItemType,
  Provenance,
} from "../types";

/*
  The shapes compare_v1 passes between its stages (guide 16, D160).

  Pure, relative imports only, so node's test runner loads it the way it loads
  the Explore and Community Intelligence modules.

  THE ONE RULE EVERY TYPE HERE KEEPS: nothing on an entity is a score, a rank or
  a verdict. Values are facts or measurements with evidence; differences are
  arithmetic over two facts; fit is lists of reasons. A guardrail test fails if
  an output field on an entity is named score, winner or rank.
*/

export type StrategyId = "tool" | "model" | "mixed";

/* ---------------------------------------------------------------------------
   Inputs
   --------------------------------------------------------------------------- */

export type PerformanceMetric = "ttft_ms" | "output_tps" | "e2e_latency_ms" | "throughput_rps" | "uptime_pct";

export type PerformanceRow = {
  id: string;
  modelId: string;
  metric: PerformanceMetric;
  value: number;
  unit: "ms" | "tokens_per_s" | "requests_per_s" | "percent";
  providerEndpoint: string | null;
  environment: string | null;
  methodologyUrl: string | null;
  measuredAt: string;
  provenance: Provenance;
};

/* Everything the pure pipeline needs, read once by the server engine. */
export type CompareInput = {
  items: CompareItem[];
  attributes: Attribute[];
  benchmarks: BenchmarkInfo[];
  performance: PerformanceRow[];
  /* Whether each read worked. A failed read is reported, never drawn as empty (D109). */
  health: { facts: boolean; plans: boolean; evaluations: boolean; reviews: boolean; performance: boolean };
  now: number;
};

/* Preference weights, 0 to 5 each, from ?w= (D169). Absent means not stated. */
export type WeightKey = "price" | "quality" | "speed" | "privacy" | "context";
export type PreferenceWeights = Partial<Record<WeightKey, number>>;

/* Explicit usage assumptions for a model cost estimate, from ?scenario= (D165). */
export type UsageScenario = { inputTokens: number; outputTokens: number };

export type CompareRequest = {
  /* Display order, exactly as the person chose. The engine never reorders it. */
  entities: { type: CompareItemType; id: string }[];
  /* Order independent: A,B and B,A share one key, and one cache entry. */
  setKey: string;
  strategy: StrategyId;
  goal: CompareGoal | null;
  weights: PreferenceWeights | null;
  scenario: UsageScenario | null;
};

export type RequestError = "too_few" | "too_many" | "duplicate" | "invalid" | "unsupported";

/* ---------------------------------------------------------------------------
   Entities, dimensions, values
   --------------------------------------------------------------------------- */

export type ComparisonEntity = {
  id: string;
  type: CompareItemType;
  name: string;
  slug: string;
  provider: string | null;
  /* The loaded row. Never re-read and never copied to a table. */
  item: CompareItem;
  /* The catalogue row's own updated_at: a LISTING date, never a verification date. */
  updatedAt: string | null;
};

export type DimensionSection =
  | "overview"
  | "capabilities"
  | "integrations"
  | "platforms"
  | "pricing"
  | "context"
  | "modalities"
  | "performance"
  | "benchmarks"
  | "technical"
  | "privacy"
  | "use_cases"
  | "community";

export type DimensionKind = "number" | "money" | "flag" | "text" | "list" | "fit" | "benchmark" | "performance";

export type UnitClass =
  | "tokens"
  | "per_1m_input"
  | "per_1m_cached_input"
  | "per_1m_cache_write"
  | "per_1m_output"
  | "per_1m_batch_input"
  | "per_1m_batch_output"
  | "per_month"
  | "ms"
  | "tokens_per_s"
  | "requests_per_s"
  | "percent"
  | "score"
  | "rating"
  | "count";

/* A statement about the unit, not about any product: a lower price is lower.
   Whether lower matters is the goal's business. */
export type Direction = "higher" | "lower" | "none";

export type FreshnessClass = "price" | "performance" | "benchmark" | "fact" | "identity";
export type Freshness = "fresh" | "aging" | "stale" | "unknown";

export type ComparisonDimension = {
  id: string;
  label: string;
  section: DimensionSection;
  appliesTo: CompareItemType[];
  kind: DimensionKind;
  unit: UnitClass | null;
  direction: Direction;
  comparableAcross: boolean;
  freshness: FreshnessClass;
  /* Factual leader wording, "Largest context window". Only on directional numbers. */
  leaderLabel?: string;
  /* Fit wording for the favourable and unfavourable end. */
  better?: string;
  worse?: string;
  /* Benchmark dimensions: what was measured, for goal matching and the like for like check. */
  benchmark?: { slug: string | null; name: string; metric: string; domain: string };
  /* compare_facts attribute key, when the dimension reads one. */
  factKey?: string;
};

export type Scalar = number | string | boolean | string[];

export type KnownValue = {
  state: "known";
  value: Scalar;
  /* How the value reads, "1M tokens", "$2.50 per 1M input tokens". */
  display: string;
  evidence: string[];
  freshness: Freshness;
  /* For money: the currency; a delta is only computed within one currency. */
  currency?: string;
  /* Benchmarks: how the number was produced, for the like for like check. */
  method?: { modelVersion: string | null; harness: string | null; datasetVersion: string | null; reporter: string | null };
  note?: string;
};

export type ComparisonValue =
  | KnownValue
  | { state: "not_recorded" }
  | { state: "not_measured" }
  | { state: "not_applicable" }
  | { state: "conflict"; values: { display: string; evidence: string }[] };

/* ---------------------------------------------------------------------------
   Evidence, quality
   --------------------------------------------------------------------------- */

export type EvidenceSourceType = "official" | "independent" | "benchmark" | "community" | "user";

export type ComparisonEvidence = {
  id: string;
  entityId: string;
  claimType: "feature" | "pricing" | "benchmark" | "performance" | "privacy" | "security" | "capability" | "availability";
  claim: string;
  sourceName: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  observedAt: string | null;
  confidence: "high" | "medium" | "low";
  sourceType: EvidenceSourceType;
};

export type DataIssueCode =
  | "negative_price"
  | "implausible_price"
  | "price_without_currency"
  | "invalid_context"
  | "duplicate_benchmark"
  | "conflicting_values"
  | "invalid_date"
  | "missing_model_version"
  | "currency_mismatch"
  | "not_like_for_like"
  | "stale"
  | "read_failed";

export type DataIssue = {
  code: DataIssueCode;
  entityId?: string;
  dimension?: string;
  message: string;
  /* Shown to everybody, or only in debug. */
  visibility: "public" | "debug";
};

/* ---------------------------------------------------------------------------
   Matrix and differences
   --------------------------------------------------------------------------- */

export type ComparisonMatrix = {
  entities: ComparisonEntity[];
  dimensions: ComparisonDimension[];
  /* values[dimension index][entity index] */
  values: ComparisonValue[][];
  /* Known values per dimension, same index as dimensions. */
  coverage: number[];
};

export type DimensionDifference = {
  dimension: string;
  a: string;
  b: string;
  displayA: string;
  displayB: string;
  delta?: number;
  deltaPercent?: number;
  /* From a fixed rule table, never free text. */
  interpretation: string;
  evidence: string[];
  caveat?: string;
};

export type DimensionLeader = {
  dimension: string;
  label: string;
  entityIds: string[];
  display: string;
  caveat?: string;
};

export type DimensionStats = {
  dimension: string;
  known: number;
  total: number;
  min?: number;
  max?: number;
  median?: number;
  range?: number;
  leader?: DimensionLeader;
};

export type ParetoPoint = { entityId: string; x: number; y: number; dominated: boolean };

export type ParetoResult = {
  x: string;
  y: string;
  points: ParetoPoint[];
  /* Entities left out because a value on either axis is missing. */
  missing: string[];
};

/* ---------------------------------------------------------------------------
   Goals, fit, explanation, summary
   --------------------------------------------------------------------------- */

export type Importance = 1 | 2 | 3;

export type Requirement = { dimension: string; importance: Importance; group: string };

export type ResolvedGoal = {
  key: CompareGoal | "custom";
  name: string;
  requirements: Requirement[];
  /* What drove the requirements, for the explanation line. */
  weights: PreferenceWeights | null;
};

export type FitReason = {
  dimension: string;
  text: string;
  reason: string;
  evidence: string[];
  importance: Importance;
};

export type FitAnalysis = {
  entityId: string;
  strengths: FitReason[];
  tradeoffs: FitReason[];
  missingEvidence: string[];
  relevantDimensions: string[];
};

export type SummaryLine = {
  kind: "fact" | "derived" | "interpretation";
  text: string;
  /* Dimension ids and evidence ids this line was built from. */
  refs: string[];
};

export type ScenarioCost = {
  entityId: string;
  cost: number | null;
  inputCost: number | null;
  outputCost: number | null;
  missing: ("input" | "output")[];
  evidence: string[];
};

export type CompareResult = {
  algorithm: string;
  request: CompareRequest;
  matrix: ComparisonMatrix;
  evidence: Record<string, ComparisonEvidence>;
  issues: DataIssue[];
  pairwise: DimensionDifference[];
  stats: DimensionStats[];
  pareto: ParetoResult | null;
  /* Dimension ids in the ranker's order: what to draw and summarise first. */
  order: string[];
  /* Request entities the input did not hold (unavailable slots). */
  unavailable: string[];
  goal: ResolvedGoal | null;
  fit: FitAnalysis[] | null;
  /* Relevant dimensions nobody in the set has data for. */
  sharedMissing: string[];
  explanation: string | null;
  summary: SummaryLine[];
  scenario: { assumptions: UsageScenario; costs: ScenarioCost[]; label: string } | null;
};
