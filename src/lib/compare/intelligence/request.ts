import type { CompareGoal, CompareItemType } from "../types";
import { COMPARE_V1 } from "./config";
import type { CompareRequest, PreferenceWeights, RequestError, StrategyId, UsageScenario, WeightKey } from "./types";

/*
  The comparison request (guide 16 section 4).

  parseRefs already drops duplicates and bad slugs at the URL. This is the
  engine's own door, and it REJECTS rather than repairs: a caller that hands the
  engine the same entity twice has a bug, and quietly fixing it would hide it.
*/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function strategyFor(types: CompareItemType[]): StrategyId {
  const tools = types.filter((t) => t === "tool").length;
  if (tools === types.length) return "tool";
  if (tools === 0) return "model";
  return "mixed";
}

/* Sorted, so the same set in any order shares one key. Display order is kept apart. */
export function setKeyOf(entities: { type: CompareItemType; id: string }[]): string {
  return entities
    .map((e) => `${e.type}:${e.id.toLowerCase()}`)
    .sort()
    .join(",");
}

export function buildRequest(input: {
  entities: { type: CompareItemType; id: string }[];
  goal?: CompareGoal | null;
  weights?: PreferenceWeights | null;
  scenario?: UsageScenario | null;
  /* Mixed sets are an engine capability (D162); a caller can refuse them. */
  allowMixed?: boolean;
}): { ok: true; request: CompareRequest } | { ok: false; error: RequestError } {
  const { entities } = input;
  if (entities.length < 2) return { ok: false, error: "too_few" };
  if (entities.length > COMPARE_V1.maxEntities) return { ok: false, error: "too_many" };
  for (const e of entities) {
    if ((e.type !== "tool" && e.type !== "model") || !UUID.test(e.id)) return { ok: false, error: "invalid" };
  }
  const keys = entities.map((e) => `${e.type}:${e.id.toLowerCase()}`);
  if (new Set(keys).size !== keys.length) return { ok: false, error: "duplicate" };

  const strategy = strategyFor(entities.map((e) => e.type));
  if (strategy === "mixed" && input.allowMixed === false) return { ok: false, error: "unsupported" };

  const weights = input.weights && Object.keys(input.weights).length > 0 ? input.weights : null;
  return {
    ok: true,
    request: {
      entities: entities.map((e) => ({ type: e.type, id: e.id })),
      setKey: setKeyOf(entities),
      strategy,
      goal: input.goal ?? null,
      weights,
      scenario: input.scenario ?? null,
    },
  };
}

/* ---------------------------------------------------------------------------
   URL parsers, pure so the browser and the server read the same way.
   --------------------------------------------------------------------------- */

export const WEIGHT_KEYS: WeightKey[] = ["price", "quality", "speed", "privacy", "context"];

/* ?w=price:3,quality:5. Unknown keys and non integers are ignored; values clamp to 0..5. */
export function parseWeights(raw: string | string[] | undefined | null): PreferenceWeights | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  const out: PreferenceWeights = {};
  for (const part of v.split(",").slice(0, WEIGHT_KEYS.length * 2)) {
    const [k, n] = part.split(":");
    if (!WEIGHT_KEYS.includes(k as WeightKey)) continue;
    if (!/^\d{1,2}$/.test(n ?? "")) continue;
    out[k as WeightKey] = Math.max(0, Math.min(5, Number(n)));
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function formatWeights(w: PreferenceWeights | null): string | null {
  if (!w) return null;
  const parts = WEIGHT_KEYS.filter((k) => typeof w[k] === "number").map((k) => `${k}:${w[k]}`);
  return parts.length > 0 ? parts.join(",") : null;
}

/* Up to one billion tokens each way: far above any single workload, and it keeps
   the arithmetic exact in a double. */
const MAX_SCENARIO_TOKENS = 1_000_000_000;

/* ?scenario=1000000:250000, input then output tokens. Both must be whole numbers. */
export function parseScenario(raw: string | string[] | undefined | null): UsageScenario | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  const m = /^(\d{1,10}):(\d{1,10})$/.exec(v);
  if (!m) return null;
  const inputTokens = Number(m[1]);
  const outputTokens = Number(m[2]);
  if (inputTokens > MAX_SCENARIO_TOKENS || outputTokens > MAX_SCENARIO_TOKENS) return null;
  if (inputTokens === 0 && outputTokens === 0) return null;
  return { inputTokens, outputTokens };
}

export function formatScenario(s: UsageScenario | null): string | null {
  return s ? `${s.inputTokens}:${s.outputTokens}` : null;
}
