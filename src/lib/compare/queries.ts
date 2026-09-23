import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { categoriesOf } from "@/lib/search/rows";
import type {
  Attribute,
  BenchmarkInfo,
  CompareGoal,
  CompareItem,
  CompareRef,
  CompareSlot,
  Comparison,
  Evaluation,
  Fact,
  ModelItem,
  Plan,
  Provenance,
  ToolItem,
} from "@/lib/compare/types";

/*
  Everything a comparison reads.

  IT READS THE PUBLIC RECORD AND NOTHING ELSE, WHOEVER IS SIGNED IN (D111).
  Every read is the anon client with status = 'approved' stated explicitly. The
  authenticated select policy on tools and models also shows a developer their
  own drafts and shows staff everything, so a comparison read with the session
  client would put a draft in a column, and a share link to it would render
  differently for the person who sent it than for everybody they sent it to. A
  comparison is a public artefact. It reads what the public can read.

  NO ROW IS COPIED. Tools and models are read from their own tables. The
  evidence tables (compare_facts, tool_plans, model_evaluations) hold facts
  those tables have no column for, keyed to them, and nothing here writes.

  A FAILED READ DEGRADES, IT DOES NOT THROW. The tool and model reads decide
  which slots exist. Each evidence read has its own health flag, so a dropped
  connection on benchmarks reports itself where benchmarks would be and the
  pricing above it still renders (D109).
*/

type Row = Record<string, unknown>;

const TOOL_COLUMNS =
  "id, slug, name, tagline, description, website_url, logo_url, pricing, pricing_model," +
  " features, platforms, rating, rating_count, verified, published_at, submitted_at," +
  " updated_at, tool_categories(categories(name))";

const MODEL_COLUMNS =
  "id, slug, name, provider, description, website_url, updated_at, context_window," +
  " input_price_per_m, output_price_per_m, modalities, family, version, api_model_id," +
  " release_date, lifecycle, open_weights, max_output_tokens, output_modalities," +
  " cached_input_price_per_m, cache_write_price_per_m, batch_input_price_per_m," +
  " batch_output_price_per_m, pricing_note, pricing_source_url, pricing_verified_at";

const FACT_COLUMNS =
  "id, tool_id, model_id, attribute, value_flag, value_text, value_number, note," +
  " source_label, source_url, verified_at";

const PLAN_COLUMNS =
  "id, tool_id, name, tier, price_amount, annual_price_amount, currency, billing_period," +
  " per_seat, trial_days, limits, sort_order, source_label, source_url, verified_at";

const EVAL_COLUMNS =
  "id, model_id, kind, domain, name, metric, score, unit, higher_is_better, ci_low, ci_high," +
  " model_version, harness, evaluator, dataset_version, evaluated_at, note, benchmark_slug," +
  " source_label, source_url, verified_at";

/* PostgREST returns numeric as a number, a string or null depending on the
   column's scale. One conversion, so no cell ever renders "NaN". */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s !== "") : [];
}

function provenance(r: Row): Provenance {
  return {
    label: str(r.source_label),
    url: str(r.source_url),
    verifiedAt: str(r.verified_at),
  };
}

function toFact(r: Row): Fact {
  return {
    id: String(r.id),
    attribute: String(r.attribute),
    flag: typeof r.value_flag === "boolean" ? r.value_flag : null,
    text: str(r.value_text),
    number: num(r.value_number),
    note: str(r.note),
    provenance: provenance(r),
  };
}

function toPlan(r: Row): Plan {
  return {
    id: String(r.id),
    name: String(r.name),
    tier: r.tier as Plan["tier"],
    price: num(r.price_amount),
    annualPrice: num(r.annual_price_amount),
    currency: str(r.currency),
    period: (str(r.billing_period) as Plan["period"]) ?? null,
    perSeat: r.per_seat === true,
    trialDays: num(r.trial_days),
    limits: str(r.limits),
    provenance: provenance(r),
  };
}

function toEvaluation(r: Row): Evaluation {
  return {
    id: String(r.id),
    kind: r.kind as Evaluation["kind"],
    domain: String(r.domain),
    name: String(r.name),
    metric: String(r.metric),
    score: num(r.score) ?? 0,
    unit: r.unit as Evaluation["unit"],
    higherIsBetter: r.higher_is_better !== false,
    ciLow: num(r.ci_low),
    ciHigh: num(r.ci_high),
    modelVersion: str(r.model_version),
    harness: str(r.harness),
    evaluator: String(r.evaluator),
    datasetVersion: str(r.dataset_version),
    evaluatedAt: String(r.evaluated_at),
    note: str(r.note),
    benchmarkSlug: str(r.benchmark_slug),
    provenance: provenance(r),
  };
}

function toTool(r: Row): ToolItem {
  return {
    type: "tool",
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    href: `/tools/${String(r.slug)}`,
    websiteUrl: str(r.website_url),
    description: str(r.description),
    tagline: str(r.tagline),
    logoUrl: str(r.logo_url),
    categories: categoriesOf(r),
    pricingSummary: str(r.pricing),
    pricingModel: str(r.pricing_model),
    features: strings(r.features),
    platforms: strings(r.platforms),
    verified: r.verified === true,
    /* D40: null until somebody has rated it, and it stays null here. */
    rating: num(r.rating),
    ratingCount: num(r.rating_count) ?? 0,
    ratingBreakdown: null,
    latestReviewAt: null,
    inCatalogueSince: str(r.published_at) ?? str(r.submitted_at),
    listedUpdatedAt: str(r.updated_at),
    facts: [],
    plans: [],
  };
}

function toModel(r: Row): ModelItem {
  return {
    type: "model",
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    /* There is no model page. The header links the provider site instead of a
       route that would 404, the same call Search and Explore made. */
    href: null,
    websiteUrl: str(r.website_url),
    description: str(r.description),
    provider: str(r.provider),
    family: str(r.family),
    version: str(r.version),
    apiModelId: str(r.api_model_id),
    releaseDate: str(r.release_date),
    lifecycle: (str(r.lifecycle) as ModelItem["lifecycle"]) ?? null,
    openWeights: typeof r.open_weights === "boolean" ? r.open_weights : null,
    contextWindow: num(r.context_window),
    maxOutputTokens: num(r.max_output_tokens),
    modalities: strings(r.modalities),
    outputModalities: strings(r.output_modalities),
    prices: {
      input: num(r.input_price_per_m),
      cachedInput: num(r.cached_input_price_per_m),
      cacheWrite: num(r.cache_write_price_per_m),
      output: num(r.output_price_per_m),
      batchInput: num(r.batch_input_price_per_m),
      batchOutput: num(r.batch_output_price_per_m),
      note: str(r.pricing_note),
      provenance: {
        /* Named for where it actually came from, never assumed to be the
           provider's own page. */
        label: !str(r.pricing_source_url)
          ? null
          : String(r.pricing_source_url).startsWith("https://openrouter.ai/")
            ? "OpenRouter model listing"
            : "Pricing page",
        url: str(r.pricing_source_url),
        verifiedAt: str(r.pricing_verified_at),
      },
    },
    listedUpdatedAt: str(r.updated_at),
    facts: [],
    evaluations: [],
  };
}

async function read<T>(
  label: string,
  run: () => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>,
  map: (r: Row) => T,
): Promise<{ rows: T[]; ok: boolean }> {
  try {
    const { data, error } = await run();
    if (error) {
      console.error(`[compare] ${label} failed`, error.code, error.message);
      return { rows: [], ok: false };
    }
    return { rows: ((data as Row[] | null) ?? []).map(map), ok: true };
  } catch (err) {
    console.error(`[compare] ${label} threw`, err);
    return { rows: [], ok: false };
  }
}

async function readAttributes(db: SupabaseClient) {
  return read(
    "attributes",
    () =>
      db
        .from("compare_attributes")
        .select("key, section, applies_to, value_type, label, unit, sort_order")
        .order("section")
        .order("sort_order"),
    (r): Attribute => ({
      key: String(r.key),
      section: r.section as Attribute["section"],
      appliesTo: strings(r.applies_to) as Attribute["appliesTo"],
      valueType: r.value_type as Attribute["valueType"],
      label: String(r.label),
      unit: str(r.unit),
      sortOrder: num(r.sort_order) ?? 0,
    }),
  );
}

function toBenchmark(r: Row): BenchmarkInfo {
  return {
    slug: String(r.slug),
    name: String(r.name),
    domain: String(r.domain),
    category: String(r.category),
    measures: String(r.measures),
    howToRead: String(r.how_to_read),
    useCases: strings(r.use_cases) as CompareGoal[],
    provenance: provenance(r),
  };
}

/* The benchmark catalogue. Small, public and the same for everybody. */
export async function loadBenchmarks(db: SupabaseClient = createAnonClient()) {
  return read(
    "benchmarks",
    () =>
      db
        .from("benchmarks")
        .select("slug, name, domain, category, measures, how_to_read, use_cases, source_label, source_url, verified_at")
        .order("name"),
    toBenchmark,
  );
}

export async function loadComparison(refs: CompareRef[]): Promise<Comparison> {
  const empty: Comparison = {
    slots: [],
    attributes: [],
    benchmarks: [],
    health: { facts: true, plans: true, evaluations: true, reviews: true },
    readAt: Date.now(),
  };
  if (refs.length === 0 || !isSupabaseConfigured()) return empty;

  const db = createAnonClient();
  const toolSlugs = refs.filter((r) => r.type === "tool").map((r) => r.slug);
  const modelSlugs = refs.filter((r) => r.type === "model").map((r) => r.slug);

  const [tools, models, attributes, benchmarks] = await Promise.all([
    toolSlugs.length > 0
      ? read(
          "tools",
          () => db.from("tools").select(TOOL_COLUMNS).eq("status", "approved").in("slug", toolSlugs),
          toTool,
        )
      : Promise.resolve({ rows: [] as ToolItem[], ok: true }),
    modelSlugs.length > 0
      ? read(
          "models",
          () => db.from("models").select(MODEL_COLUMNS).eq("status", "approved").in("slug", modelSlugs),
          toModel,
        )
      : Promise.resolve({ rows: [] as ModelItem[], ok: true }),
    readAttributes(db),
    modelSlugs.length > 0 ? loadBenchmarks(db) : Promise.resolve({ rows: [] as BenchmarkInfo[], ok: true }),
  ]);

  const toolIds = tools.rows.map((t) => t.id);
  const modelIds = models.rows.map((m) => m.id);

  const [toolFacts, modelFacts, plans, evaluations, reviews] = await Promise.all([
    toolIds.length > 0
      ? read(
          "tool facts",
          () => db.from("compare_facts").select(FACT_COLUMNS).in("tool_id", toolIds),
          (r) => ({ owner: String(r.tool_id), fact: toFact(r) }),
        )
      : Promise.resolve({ rows: [], ok: true }),
    modelIds.length > 0
      ? read(
          "model facts",
          () => db.from("compare_facts").select(FACT_COLUMNS).in("model_id", modelIds),
          (r) => ({ owner: String(r.model_id), fact: toFact(r) }),
        )
      : Promise.resolve({ rows: [], ok: true }),
    toolIds.length > 0
      ? read(
          "plans",
          () =>
            db
              .from("tool_plans")
              .select(PLAN_COLUMNS)
              .in("tool_id", toolIds)
              .order("sort_order")
              .order("price_amount", { nullsFirst: false }),
          (r) => ({ owner: String(r.tool_id), plan: toPlan(r) }),
        )
      : Promise.resolve({ rows: [], ok: true }),
    modelIds.length > 0
      ? read(
          "evaluations",
          () =>
            db
              .from("model_evaluations")
              .select(EVAL_COLUMNS)
              .in("model_id", modelIds)
              .order("evaluated_at", { ascending: false }),
          (r) => ({ owner: String(r.model_id), evaluation: toEvaluation(r) }),
        )
      : Promise.resolve({ rows: [], ok: true }),
    toolIds.length > 0
      ? read(
          "reviews",
          () =>
            db
              .from("tool_reviews")
              .select("tool_id, rating, created_at")
              .eq("status", "visible")
              .in("tool_id", toolIds),
          (r) => ({
            owner: String(r.tool_id),
            rating: num(r.rating),
            createdAt: String(r.created_at),
          }),
        )
      : Promise.resolve({ rows: [], ok: true }),
  ]);

  for (const t of tools.rows) {
    t.facts = toolFacts.rows.filter((f) => f.owner === t.id).map((f) => f.fact);
    t.plans = plans.rows.filter((p) => p.owner === t.id).map((p) => p.plan);

    if (reviews.ok) {
      const mine = reviews.rows.filter((r) => r.owner === t.id);
      const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
      let latest: string | null = null;
      for (const r of mine) {
        const k = r.rating as 1 | 2 | 3 | 4 | 5;
        if (breakdown[k] !== undefined) breakdown[k] += 1;
        if (!latest || r.createdAt > latest) latest = r.createdAt;
      }
      t.ratingBreakdown = breakdown;
      t.latestReviewAt = latest;
    }
  }
  for (const m of models.rows) {
    m.facts = modelFacts.rows.filter((f) => f.owner === m.id).map((f) => f.fact);
    m.evaluations = evaluations.rows.filter((e) => e.owner === m.id).map((e) => e.evaluation);
  }

  const byKey = new Map<string, CompareItem>();
  for (const t of tools.rows) byKey.set(`tool:${t.slug}`, t);
  for (const m of models.rows) byKey.set(`model:${m.slug}`, m);

  const slots: CompareSlot[] = refs.map((ref) => {
    const item = byKey.get(`${ref.type}:${ref.slug}`);
    if (item) return { status: "ok", ref, item };
    /* A failed read and a missing row are different sentences. "This is no
       longer listed" would be a false claim about an item we simply failed to
       load. */
    const readOk = ref.type === "tool" ? tools.ok : models.ok;
    return { status: "unavailable", ref, reason: readOk ? "not_found" : "failed" };
  });

  return {
    slots,
    attributes: attributes.rows,
    benchmarks: benchmarks.rows,
    health: {
      facts: toolFacts.ok && modelFacts.ok && attributes.ok,
      plans: plans.ok,
      evaluations: evaluations.ok && benchmarks.ok,
      reviews: reviews.ok,
    },
    readAt: Date.now(),
  };
}
