import { GOALS, type CompareGoal } from "../types";
import type { ComparisonMatrix, Importance, PreferenceWeights, Requirement, ResolvedGoal, WeightKey } from "./types";

/*
  Goals and preference weights (guide 16 sections 16 and 17).

  A preset states which DIMENSIONS a goal is about. That is a fact about the
  vocabulary ("coding benchmarks are about coding"), not a judgement about any
  product, and nothing here names a tool or a model. There is no rule of the form
  "if coding then Model A".

  Weights (?w=) re-weight or add groups and change fit only (D169). A weight of 0
  removes that group. Nothing is inferred from who the person is.
*/

type Selector =
  | { fact: string }
  | { dim: string }
  | { benchDomain: string[] }
  | { weight: WeightKey };

type PresetPart = { group: string; importance: Importance; select: Selector[] };

const f = (key: string): Selector => ({ fact: key });
const d = (id: string): Selector => ({ dim: id });

const WEIGHT_GROUPS: Record<WeightKey, Selector[]> = {
  price: [d("price_input"), d("price_output"), d("plan:individual"), d("plan:team")],
  quality: [{ benchDomain: ["*"] }],
  speed: [d("perf:ttft_ms"), d("perf:output_tps"), d("perf:e2e_latency_ms")],
  privacy: [f("deploy_self_hosted"), f("deploy_on_prem"), f("deploy_private"), f("enterprise_controls"), f("open_source"), d("model.open_weights")],
  context: [d("context_window"), d("max_output")],
};

export const WEIGHT_LABELS: Record<WeightKey, string> = {
  price: "price",
  quality: "measured quality",
  speed: "speed",
  privacy: "privacy",
  context: "context",
};

export const PRESETS: Record<CompareGoal, PresetPart[]> = {
  coding: [
    { group: "coding", importance: 3, select: [f("fit_coding"), f("coding"), f("code_generation"), d("concept:coding"), { benchDomain: ["coding"] }] },
    { group: "tool calling", importance: 3, select: [f("tool_calling"), f("integration_github")] },
    { group: "reasoning", importance: 3, select: [f("reasoning"), { benchDomain: ["reasoning"] }] },
    { group: "context", importance: 2, select: [{ weight: "context" }] },
    { group: "speed", importance: 2, select: [{ weight: "speed" }] },
    { group: "price", importance: 2, select: [{ weight: "price" }] },
  ],
  research: [
    { group: "research", importance: 3, select: [f("fit_research"), f("web_search"), f("file_analysis")] },
    { group: "reasoning", importance: 3, select: [f("reasoning"), { benchDomain: ["reasoning", "knowledge"] }] },
    { group: "context", importance: 2, select: [{ weight: "context" }] },
    { group: "price", importance: 1, select: [{ weight: "price" }] },
  ],
  writing: [
    { group: "writing", importance: 3, select: [f("fit_writing"), f("text_generation")] },
    { group: "languages", importance: 2, select: [f("multilingual")] },
    { group: "price", importance: 1, select: [{ weight: "price" }] },
  ],
  image: [
    { group: "image generation", importance: 3, select: [f("fit_image"), f("image_generation"), f("image_output"), d("concept:image")] },
    { group: "vision", importance: 2, select: [f("vision"), { benchDomain: ["multimodal"] }] },
    { group: "price", importance: 1, select: [{ weight: "price" }] },
  ],
  video: [
    { group: "video", importance: 3, select: [f("fit_video"), f("video_generation"), f("video_input")] },
    { group: "price", importance: 1, select: [{ weight: "price" }] },
  ],
  business: [
    { group: "business", importance: 3, select: [f("fit_business"), f("collaboration"), f("enterprise_controls"), f("deploy_enterprise")] },
    { group: "integrations", importance: 2, select: [f("integration_slack"), f("integration_google"), f("integration_microsoft"), d("tool.integrations_count")] },
    { group: "price", importance: 2, select: [d("plan:team"), d("plan:business"), d("price_input"), d("price_output")] },
  ],
  agents: [
    { group: "agents", importance: 3, select: [f("fit_agents"), f("agents"), f("agentic"), f("automation"), d("concept:agents"), { benchDomain: ["agentic"] }] },
    { group: "tool calling", importance: 3, select: [f("tool_calling"), f("structured_outputs")] },
    { group: "context", importance: 2, select: [{ weight: "context" }] },
    { group: "price", importance: 1, select: [{ weight: "price" }] },
  ],
  api: [
    { group: "API", importance: 3, select: [f("fit_api"), f("deploy_api"), f("streaming"), f("batch_processing"), f("structured_outputs"), f("tool_calling")] },
    { group: "price", importance: 2, select: [d("price_input"), d("price_output"), d("price_batch_input"), d("price_batch_output")] },
    { group: "speed", importance: 2, select: [{ weight: "speed" }] },
  ],
  personal: [
    { group: "personal use", importance: 3, select: [f("fit_personal")] },
    { group: "price", importance: 2, select: [d("plan:free"), d("plan:individual")] },
  ],
  support: [
    { group: "price", importance: 3, select: [{ weight: "price" }] },
    { group: "conversation", importance: 2, select: [f("text_generation"), f("multilingual"), f("structured_outputs")] },
    { group: "speed", importance: 2, select: [{ weight: "speed" }] },
    { group: "integrations", importance: 1, select: [f("integration_slack"), d("tool.integrations_count")] },
  ],
  long_context: [
    { group: "context", importance: 3, select: [d("context_window"), d("max_output"), { benchDomain: ["long_context"] }] },
    { group: "documents", importance: 2, select: [f("file_analysis")] },
    { group: "price", importance: 1, select: [d("price_input")] },
  ],
  private: [{ group: "privacy", importance: 3, select: [{ weight: "privacy" }] }],
};

export function importanceOfWeight(w: number): Importance | 0 {
  if (w <= 0) return 0;
  if (w <= 2) return 1;
  if (w === 3) return 2;
  return 3;
}

function expand(select: Selector[], matrix: ComparisonMatrix): string[] {
  const ids = new Set<string>();
  const present = new Set(matrix.dimensions.map((x) => x.id));
  for (const s of select) {
    if ("fact" in s) {
      if (present.has(`fact:${s.fact}`)) ids.add(`fact:${s.fact}`);
    } else if ("dim" in s) {
      if (present.has(s.dim)) ids.add(s.dim);
    } else if ("benchDomain" in s) {
      for (const dim of matrix.dimensions) {
        if (dim.kind === "benchmark" && dim.benchmark && (s.benchDomain.includes("*") || s.benchDomain.includes(dim.benchmark.domain))) ids.add(dim.id);
      }
    } else {
      for (const id of expand(WEIGHT_GROUPS[s.weight], matrix)) ids.add(id);
    }
  }
  return [...ids];
}

/* Null when neither a goal nor weights were given: no fit, and no pretending (D161). */
export function resolveGoal(goal: CompareGoal | null, weights: PreferenceWeights | null, matrix: ComparisonMatrix): ResolvedGoal | null {
  if (!goal && !weights) return null;

  const parts: PresetPart[] = goal ? PRESETS[goal].map((p) => ({ ...p })) : [];
  if (weights) {
    for (const key of Object.keys(weights) as WeightKey[]) {
      const imp = importanceOfWeight(weights[key] ?? 0);
      const label = WEIGHT_LABELS[key];
      const existing = parts.filter((p) => p.group === label || p.group === key);
      if (imp === 0) {
        for (const p of existing) parts.splice(parts.indexOf(p), 1);
        continue;
      }
      if (existing.length > 0) for (const p of existing) p.importance = imp;
      else parts.push({ group: label, importance: imp, select: [{ weight: key }] });
    }
  }

  const byDim = new Map<string, Requirement>();
  for (const part of parts) {
    for (const id of expand(part.select, matrix)) {
      const prev = byDim.get(id);
      if (!prev || prev.importance < part.importance) byDim.set(id, { dimension: id, importance: part.importance, group: part.group });
    }
  }

  return {
    key: goal ?? "custom",
    name: goal ? (GOALS.find((g) => g.key === goal)?.label ?? goal) : "Your priorities",
    requirements: [...byDim.values()],
    weights,
  };
}
