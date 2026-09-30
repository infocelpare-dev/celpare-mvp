import { PRESETS } from "../compare/intelligence/goals";
import { GOALS, type CompareGoal } from "../compare/types";
import { tokenize } from "../community/intelligence/text";
import { TMR_V1 } from "./config";
import {
  known,
  type Attr,
  type AttrSet,
  type EntityType,
  type FactValue,
  type Maybe,
  type ModelPrice,
  type PriceTier,
  type ToolModelEntity,
  type ToolPrice,
} from "./types";

/*
  The canonical tool and model (guide 17 section 4).

  Built from rows the rest of Celpare already owns: the tool or model row, its
  compare_facts, its cheapest plan, its evaluations. Nothing here invents an
  attribute. Every value says where it came from: a sourced fact, the listing, or
  derived by this file from words. A set we could not read is left undefined,
  which means "unknown", never "none".
*/

/* What the server hands over, one per row. Plain data, no row shapes. */
export type EntityInput = {
  type: EntityType;
  id: string;
  slug: string;
  name: string;
  tagline?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  tags?: string[];
  features?: string[];
  platforms?: string[];
  categories?: string[];
  pricingModel?: string | null;
  /* The cheapest paid monthly plan in USD, from tool_plans. */
  cheapestPlanUsd?: number | null;
  provider?: string | null;
  family?: string | null;
  developerId?: string | null;
  canonicalDomain?: string | null;
  contextWindow?: number | null;
  maxOutput?: number | null;
  inputPrice?: number | null;
  outputPrice?: number | null;
  modalities?: string[];
  outputModalities?: string[];
  openWeights?: boolean | null;
  lifecycle?: string | null;
  evaluations?: number;
  verifiedEvaluations?: number;
  facts?: { attribute: string; flag: boolean | null; text: string | null; number: number | null; source: string | null }[];
  listingQuality: number;
  listingPenalty: number;
  rating?: number | null;
  ratingCount?: number;
  verified?: boolean;
  status?: string;
  createdAt: string | number | null;
  signals?: ToolModelEntity["signals"];
  networkSavers?: number;
};

const lower = (s: string) => s.trim().toLowerCase();
const slugify = (s: string) => lower(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* Facts that describe what a thing can do. A true flag is a capability. */
const CAPABILITY_FACTS = new Set([
  "tool_calling",
  "structured_outputs",
  "reasoning",
  "vision",
  "audio_input",
  "video_input",
  "code_generation",
  "agents",
  "agentic",
  "automation",
  "text_generation",
  "video_generation",
  "image_generation",
  "image_output",
  "audio_generation",
  "web_search",
  "file_analysis",
  "collaboration",
  "batch_processing",
  "streaming",
  "multilingual",
  "coding",
]);

/*
  The use case vocabulary is Compare's goals (D179, guide 17 section 4). A goal's
  FIRST preset part is the goal itself ("coding" is about coding facts); later
  parts are what matters for it (price, context) and are not the job. So only the
  first part's facts make an entity FOR that goal.
*/
const GOAL_FACTS: Map<CompareGoal, Set<string>> = new Map(
  GOALS.map((g) => {
    const first = PRESETS[g.key]?.[0];
    const facts = new Set<string>();
    /* Input modalities (video_input, audio_input) say what a model can READ,
       not what it is for: accepting video does not make it a video generator. */
    for (const s of first?.select ?? []) if ("fact" in s && !s.fact.endsWith("_input")) facts.add(s.fact);
    return [g.key, facts] as [CompareGoal, Set<string>];
  }),
);

/* Listing words (tags, categories) that name a use case. Words, not products:
   nothing here says "Cursor is for coding". */
const GOAL_WORDS: Record<CompareGoal, string[]> = {
  coding: ["coding", "ide", "editor", "completion", "code", "cloud-ide", "fullstack", "frontend", "terminal"],
  research: ["search-and-research", "research", "academic", "citations", "answer-engine", "evidence", "science"],
  writing: ["writing", "copywriting"],
  image: ["image-generation", "image", "design", "art", "typography", "stylised", "game-art"],
  video: ["video", "avatar", "motion"],
  business: ["business", "enterprise", "no-code", "marketing"],
  agents: ["agents", "agent", "multi-agent", "workflows"],
  api: ["api", "developer", "framework", "sdk"],
  personal: ["assistant", "general"],
  support: ["support", "customer-support"],
  long_context: ["long-context"],
  private: ["self-hosted", "open-source", "local", "open-weights"],
};

const WORD_TO_GOALS: Map<string, CompareGoal[]> = (() => {
  const m = new Map<string, CompareGoal[]>();
  for (const [goal, words] of Object.entries(GOAL_WORDS) as [CompareGoal, string[]][]) {
    for (const w of words) m.set(w, [...(m.get(w) ?? []), goal]);
  }
  return m;
})();

/* Listing words that describe how something is deployed or reached. */
const DEPLOY_WORDS: Record<string, string> = {
  "self-hosted": "self_hosted",
  "self hosted": "self_hosted",
  docker: "self_hosted",
  local: "local",
  "open-source": "open_source",
  "open-weights": "open_weights",
  api: "api",
  cli: "cli",
  serverless: "serverless",
  managed: "managed",
  browser: "web",
  web: "web",
};

const INTEGRATION_WORDS = new Set(["github", "slack", "discord", "integrations", "google", "microsoft", "zapier"]);

function push(sets: Partial<Record<AttrSet, Attr[]>>, set: AttrSet, a: Attr) {
  const list = sets[set] ?? [];
  if (!list.some((x) => x.key === a.key)) list.push(a);
  sets[set] = list;
}

function tierOf(input: EntityInput): Maybe<ToolPrice> {
  const cheapest = input.cheapestPlanUsd;
  if (typeof cheapest === "number" && Number.isFinite(cheapest) && cheapest >= 0) {
    const tier: PriceTier = cheapest === 0 ? "free" : cheapest <= TMR_V1.PRICE_TIERS.low ? "low" : cheapest <= TMR_V1.PRICE_TIERS.mid ? "mid" : "high";
    return known({ class: "tool", tier, monthlyUsd: cheapest, source: "plan" });
  }
  const pm = input.pricingModel ? lower(input.pricingModel) : null;
  if (pm === "free") return known({ class: "tool", tier: "free", monthlyUsd: null, source: "pricing_model" });
  if (pm === "freemium") return known({ class: "tool", tier: "freemium", monthlyUsd: null, source: "pricing_model" });
  /* "paid" alone says nothing about how much: a tier would be a guess. */
  return "not_recorded";
}

function modelPrice(input: EntityInput): Maybe<ModelPrice> {
  const i = input.inputPrice ?? null;
  const o = input.outputPrice ?? null;
  if (i === null && o === null) return "not_recorded";
  const blended = i !== null && o !== null ? TMR_V1.BLEND.input * i + TMR_V1.BLEND.output * o : (i ?? o)!;
  return known({ class: "model", blendedPerM: blended, inputPerM: i, outputPerM: o });
}

function at(v: string | number | null): number {
  if (typeof v === "number") return v;
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/* The share of the listing that is filled in. The same fields search's
   completeness reads, on the engine's own 0..1 scale. */
export function completenessOf(input: EntityInput): number {
  const parts =
    input.type === "tool"
      ? [
          Boolean(input.logoUrl),
          Boolean(input.tagline),
          (input.description?.length ?? 0) > 80,
          Boolean(input.pricingModel) || typeof input.cheapestPlanUsd === "number",
          (input.tags ?? []).filter((t) => t !== "test-fixture").length > 0,
          (input.features ?? []).length > 0,
          (input.categories ?? []).length > 0,
          (input.platforms ?? []).length > 0,
        ]
      : [
          Boolean(input.provider),
          (input.description?.length ?? 0) > 60,
          Boolean(input.contextWindow),
          (input.modalities ?? []).length > 0,
          (input.tags ?? []).filter((t) => t !== "test-fixture").length > 0,
          input.inputPrice != null || input.outputPrice != null,
        ];
  return parts.filter(Boolean).length / parts.length;
}

export function buildEntity(input: EntityInput): ToolModelEntity {
  const sets: Partial<Record<AttrSet, Attr[]>> = {};
  const tags = (input.tags ?? []).map(lower);
  const categories = (input.categories ?? []).map((c) => c.trim()).filter(Boolean);
  const facts: Record<string, FactValue> = {};

  /* Facts first: they are sourced, so they win on provenance. */
  for (const f of input.facts ?? []) {
    const key = lower(f.attribute);
    facts[key] = { flag: f.flag, text: f.text, number: f.number, source: f.source };
    if (f.flag !== true) continue;
    if (CAPABILITY_FACTS.has(key)) push(sets, "capability", { key, from: "fact", source: f.source });
    if (key.startsWith("deploy_")) push(sets, "deployment", { key: key.slice(7), from: "fact", source: f.source });
    if (key.startsWith("integration_")) push(sets, "integration", { key: key.slice(12), from: "fact", source: f.source });
    for (const [goal, gf] of GOAL_FACTS) if (gf.has(key)) push(sets, "usecase", { key: goal, from: "fact", source: f.source });
  }

  /* The listing. */
  for (const c of categories) {
    push(sets, "category", { key: slugify(c), from: "listing" });
    for (const g of WORD_TO_GOALS.get(slugify(c)) ?? []) push(sets, "usecase", { key: g, from: "listing" });
  }
  for (const t of tags) {
    if (t === "test-fixture") continue;
    for (const g of WORD_TO_GOALS.get(t) ?? []) push(sets, "usecase", { key: g, from: "listing" });
    if (DEPLOY_WORDS[t]) push(sets, "deployment", { key: DEPLOY_WORDS[t], from: "listing" });
    if (INTEGRATION_WORDS.has(t)) push(sets, "integration", { key: t, from: "listing" });
    /* A tag that is not a category slug is a capability word from the listing. */
    if (!categories.some((c) => slugify(c) === t)) push(sets, "capability", { key: t, from: "listing" });
  }
  if (input.type === "tool") {
    if (input.platforms) for (const p of input.platforms) {
      const k = slugify(p);
      push(sets, "platform", { key: k, from: "listing" });
      if (DEPLOY_WORDS[lower(p)]) push(sets, "deployment", { key: DEPLOY_WORDS[lower(p)], from: "listing" });
    }
  }
  if (input.type === "model") {
    for (const m of input.modalities ?? []) push(sets, "modality", { key: lower(m), from: "listing" });
    for (const m of input.outputModalities ?? []) push(sets, "output_modality", { key: lower(m), from: "listing" });
    if (input.openWeights === true) push(sets, "deployment", { key: "open_weights", from: "listing" });
    /* Derived, and labelled as such: a very long context is evidence the model is
       for long documents. */
    if ((input.contextWindow ?? 0) >= 400_000) push(sets, "usecase", { key: "long_context", from: "derived" });
    if (input.openWeights === true) push(sets, "usecase", { key: "private", from: "derived" });
  }
  const provider = input.type === "model" ? (input.provider ? lower(input.provider) : null) : null;
  const nameTokens = tokenize(input.name, 6);
  const aliases = [...new Set([lower(input.name), input.slug.replace(/-/g, " "), input.slug, ...(nameTokens.length === 1 ? nameTokens : [])])];

  return {
    ref: { type: input.type, id: input.id },
    key: `${input.type}:${input.id}`,
    slug: input.slug,
    name: input.name,
    tagline: input.tagline ?? null,
    description: input.description ?? null,
    logoUrl: input.logoUrl ?? null,
    aliases,
    attrs: sets,
    facts,
    tags,
    features: input.features ?? [],
    provider,
    providerLabel: input.type === "model" ? (input.provider ?? null) : null,
    developerId: input.developerId ?? null,
    family: input.family ? lower(input.family) : null,
    canonicalDomain: input.canonicalDomain ?? null,
    price: input.type === "tool" ? tierOf(input) : modelPrice(input),
    pricingModel: input.pricingModel ? lower(input.pricingModel) : null,
    context: typeof input.contextWindow === "number" && input.contextWindow > 0 ? known(input.contextWindow) : "not_recorded",
    maxOutput: typeof input.maxOutput === "number" && input.maxOutput > 0 ? known(input.maxOutput) : "not_recorded",
    openWeights: typeof input.openWeights === "boolean" ? known(input.openWeights) : "not_recorded",
    lifecycle: input.lifecycle ? lower(input.lifecycle) : null,
    evaluations: input.evaluations ?? 0,
    verifiedEvaluations: input.verifiedEvaluations ?? 0,
    factCount: Object.keys(facts).length,
    completeness: completenessOf(input),
    listingQuality: input.listingQuality,
    listingPenalty: input.listingPenalty,
    rating: input.rating ?? null,
    ratingCount: input.ratingCount ?? 0,
    verified: Boolean(input.verified),
    fixture: tags.includes("test-fixture"),
    approved: (input.status ?? "approved") === "approved",
    createdAt: at(input.createdAt),
    signals: input.signals,
    networkSavers: input.networkSavers,
  };
}

/* The attribute keys of one set, or null when the set is unknown. */
export function keysOf(e: ToolModelEntity, set: AttrSet): string[] | null {
  const list = e.attrs[set];
  return list ? list.map((a) => a.key) : null;
}

/* Every taxonomy key of an entity, prefixed, the shape user interests use. */
export function interestKeys(e: ToolModelEntity): string[] {
  const out: string[] = [`${e.ref.type}:${e.ref.id}`];
  for (const k of keysOf(e, "category") ?? []) out.push(`category:${k}`);
  for (const k of keysOf(e, "usecase") ?? []) out.push(`usecase:${k}`);
  for (const k of keysOf(e, "capability") ?? []) out.push(`capability:${k}`);
  for (const t of e.tags) if (t !== "test-fixture") out.push(`tag:${t}`);
  if (e.provider) out.push(`provider:${e.provider}`);
  for (const k of keysOf(e, "modality") ?? []) out.push(`modality:${k}`);
  return out;
}

/* A human label for a use case key. */
export function usecaseLabel(key: string): string {
  return GOALS.find((g) => g.key === key)?.label ?? key.replace(/_/g, " ");
}
