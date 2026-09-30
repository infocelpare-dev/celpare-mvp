import { TMR_V1 } from "./config";
import type { CatalogueIndex } from "./catalogue";
import { keysOf, usecaseLabel } from "./entity";
import {
  isKnown,
  type Constraint,
  type ConstraintStatus,
  type EntityType,
  type ModelPrice,
  type ToolModelEntity,
  type ToolPrice,
} from "./types";

/*
  Constraints (guide 17 section 10, D182).

  DETERMINISTIC. No model call parses a question here: a regex either finds "under
  $20" or it does not, and a test can say which. Every constraint is evaluated per
  candidate as satisfied, violated or unknown, and ONLY a recorded violation
  removes a candidate. Unknown is shown as "not recorded", because most tools
  have no recorded plan price and treating that as failure would hide most of
  the catalogue behind missing data.

  Named products resolve to catalogue entries by name. A name we do not carry is
  reported back as unresolved, never guessed at.
*/

export type ParsedConstraints = {
  constraints: Constraint[];
  /* The types the question asks about. Both when it does not say. */
  entityTypes: EntityType[];
  /* Entries the question names, in order. */
  mentioned: ToolModelEntity[];
  unresolved: string[];
};

const GOAL_PATTERNS: [string, RegExp][] = [
  ["coding", /\b(cod(e|ing)|programm(ing|er)|developer tool|software engineer|ide|autocomplete|pair programm)/],
  ["research", /\b(research|academic|papers?|citations?|literature)\b/],
  ["writing", /\b(writ(e|ing)|copywrit|essays?|blog posts?)\b/],
  ["image", /\b(images?|pictures?|illustrations?|art|logos?|photos?)\b/],
  ["video", /\b(videos?|films?|clips?|animation)\b/],
  ["business", /\b(business|enterprise|team|company)\b/],
  ["agents", /\b(agents?|agentic|autonomous)\b/],
  ["api", /\b(api|sdk|backend|integrate into (my|our) app)\b/],
  ["support", /\b(customer support|help ?desk|support tickets?)\b/],
  ["long_context", /\b(long (context|documents?)|large (documents?|codebases?|files?)|huge (documents?|codebases?))\b/],
  ["private", /\b(private|privacy|on[- ]prem|self[- ]host(ed|ing)?|local(ly)?)\b/],
];

const PLATFORM_PATTERNS: [string, RegExp][] = [
  ["macos", /\b(mac|macos|os x)\b/],
  ["windows", /\bwindows\b/],
  ["linux", /\blinux\b/],
  ["web", /\b(web|browser)\b/],
  ["ios", /\b(ios|iphone|ipad)\b/],
  ["android", /\bandroid\b/],
  ["vs-code", /\b(vs ?code|visual studio code)\b/],
  ["jetbrains", /\b(jetbrains|intellij|pycharm|webstorm)\b/],
  ["cli", /\b(cli|terminal|command line)\b/],
];

const CAPABILITY_PATTERNS: [string, RegExp][] = [
  ["tool_calling", /\b(tool|function) calling\b/],
  ["structured_outputs", /\b(structured outputs?|json mode|json output)\b/],
  ["vision", /\b(vision|image input|see images|read images|screenshots?)\b/],
  ["audio_input", /\b(audio input|speech input|listen)\b/],
  ["video_input", /\bvideo input\b/],
  ["reasoning", /\b(reasoning|think(ing)? model)\b/],
];

const TERMS = ["typescript", "javascript", "python", "rust", "golang", "java", "kotlin", "swift", "react", "nextjs", "vue", "django", "rails", "php", "sql"];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* Catalogue entries named in the text, longest name first so "Claude Code" wins
   over "Claude". Word bounded. */
export function resolveMentions(text: string, index: CatalogueIndex, includeFixtures = false): ToolModelEntity[] {
  const q = ` ${text.toLowerCase().replace(/[^a-z0-9.+#\s-]/g, " ")} `;
  const found: { e: ToolModelEntity; at: number; len: number }[] = [];
  const taken: [number, number][] = [];
  const names = index.list
    .filter((e) => includeFixtures || !e.fixture)
    .flatMap((e) => e.aliases.filter((a) => a.length >= 3).map((a) => ({ e, a })))
    .sort((x, y) => y.a.length - x.a.length);
  for (const { e, a } of names) {
    const re = new RegExp(`[\\s(]${escape(a)}(?=[\\s),.?!])`);
    const m = re.exec(q);
    if (!m) continue;
    const start = m.index + 1;
    const end = start + a.length;
    if (taken.some(([s, t]) => start < t && end > s)) continue;
    if (found.some((f) => f.e.key === e.key)) continue;
    taken.push([start, end]);
    found.push({ e, at: start, len: a.length });
  }
  return found.sort((x, y) => x.at - y.at).map((f) => f.e);
}

function firstEntityIn(phrase: string, index: CatalogueIndex): ToolModelEntity | null {
  return resolveMentions(phrase, index)[0] ?? null;
}

export function parseConstraints(question: string, index: CatalogueIndex): ParsedConstraints {
  const q = question.toLowerCase();
  const constraints: Constraint[] = [];
  const unresolved: string[] = [];
  const mentioned = resolveMentions(question, index);

  /* Type. "Tool calling" is a model capability, not a request for tools. */
  const typeText = q.replace(/\b(tool|function) calling\b/g, " ").replace(/\btool use\b/g, " ");
  const wantsModel = /\b(models?|llms?|language models?)\b/.test(typeText);
  const wantsTool = /\b(tools?|apps?|editors?|ide|platforms?|software|products?|services?)\b/.test(typeText);
  const entityTypes: EntityType[] = wantsModel && !wantsTool ? ["model"] : wantsTool && !wantsModel ? ["tool"] : ["tool", "model"];
  if (entityTypes.length === 1) constraints.push({ kind: "entity_type", value: entityTypes[0], hard: true, phrase: entityTypes[0] });

  /* Use case: soft, relevance decides (a video tool is not "violating" coding). */
  for (const [goal, re] of GOAL_PATTERNS) {
    const m = re.exec(q);
    if (m) constraints.push({ kind: "usecase", value: goal, hard: false, phrase: m[0] });
  }

  /* Budget. */
  const max = /\b(?:under|below|less than|at most|max(?:imum)?|up to)\s*\$\s?(\d+(?:\.\d+)?)|\$\s?(\d+(?:\.\d+)?)\s*(?:or less|max)/.exec(q);
  if (max) constraints.push({ kind: "budget_max", value: Number(max[1] ?? max[2]), hard: true, phrase: max[0] });
  if (/\bfree\b(?! trial)/.test(q) && !/\bfree trial\b/.test(q)) constraints.push({ kind: "budget_free", value: 1, hard: true, phrase: "free" });
  const cheaper = /\b(?:cheaper|less expensive|more affordable) than ([a-z0-9 .+#-]{2,40}?)(?=$|[,.?!;]| for | with | that | which | and | but )/.exec(q);
  if (cheaper) {
    const target = firstEntityIn(cheaper[1], index);
    if (target) {
      constraints.push({ kind: "cheaper_than", value: target.key, hard: true, phrase: cheaper[0] });
      constraints.push({ kind: "exclude", value: target.key, hard: true, phrase: cheaper[1] });
    } else unresolved.push(cheaper[1].trim());
  } else if (/\b(cheap|budget|affordable|low[- ]cost|inexpensive)\b/.test(q)) {
    constraints.push({ kind: "budget_max", value: "cheap", hard: false, phrase: "cheap" });
  }

  /* Exclusions and alternatives. */
  const excl = /\b(?:not|other than|besides|except|instead of|alternatives? to|replace)\s+([a-z0-9 .+#-]{2,40}?)(?=$|[,.?!;]| for | with | that | which | and | but )/g;
  for (let m = excl.exec(q); m; m = excl.exec(q)) {
    const target = firstEntityIn(m[1], index);
    if (target) {
      if (!constraints.some((c) => c.kind === "exclude" && c.value === target.key)) {
        constraints.push({ kind: "exclude", value: target.key, hard: true, phrase: m[0] });
      }
    } else if (/^[a-z]/.test(m[1]) && m[0].startsWith("alternative")) unresolved.push(m[1].trim());
  }

  /* Platforms, deployment, openness. */
  for (const [platform, re] of PLATFORM_PATTERNS) if (re.test(q)) constraints.push({ kind: "platform", value: platform, hard: true, phrase: platform });
  if (/\bopen[- ]source\b/.test(q)) constraints.push({ kind: "open", value: "open_source", hard: true, phrase: "open source" });
  if (/\bopen[- ]weights?\b/.test(q)) constraints.push({ kind: "open", value: "open_weights", hard: true, phrase: "open weights" });
  if (/\bself[- ]host(ed|ing|able)?\b|\bon[- ]prem/.test(q)) constraints.push({ kind: "deployment", value: "self_hosted", hard: true, phrase: "self hosted" });

  /* Context size. */
  const ctx = /\b(\d+(?:\.\d+)?)\s*(k|m|million|thousand)\b[^.?!]{0,20}\b(context|tokens?)\b/.exec(q);
  if (ctx) {
    const n = Number(ctx[1]) * (ctx[2] === "k" || ctx[2] === "thousand" ? 1_000 : 1_000_000);
    constraints.push({ kind: "min_context", value: n, hard: true, phrase: ctx[0] });
  }

  /* Input modalities a model must accept. */
  if (/\b(pdfs?|files?|documents?) (input|upload)|\b(read|accept|take)s? (pdfs?|files?)\b/.test(q)) {
    constraints.push({ kind: "modality", value: "file", hard: true, phrase: "file input" });
  }

  /* Capabilities and soft terms. */
  for (const [cap, re] of CAPABILITY_PATTERNS) if (re.test(q)) constraints.push({ kind: "capability", value: cap, hard: true, phrase: cap.replace(/_/g, " ") });
  for (const t of TERMS) if (new RegExp(`\\b${t}\\b`).test(q)) constraints.push({ kind: "term", value: t, hard: false, phrase: t });

  return { constraints, entityTypes, mentioned, unresolved };
}

/* ---------------------------------------------------------------- evaluation */

const TIER_ORDER = { free: 0, freemium: 1, low: 2, mid: 3, high: 4 } as const;

function toolPrice(e: ToolModelEntity): ToolPrice | null {
  return isKnown(e.price) && e.price.value.class === "tool" ? e.price.value : null;
}
function modelPrice(e: ToolModelEntity): ModelPrice | null {
  return isKnown(e.price) && e.price.value.class === "model" ? e.price.value : null;
}

function tierWords(p: ToolPrice): string {
  if (p.tier === "free") return "free";
  if (p.tier === "freemium") return "has a free plan";
  return p.monthlyUsd !== null ? `from $${p.monthlyUsd}/mo` : `${p.tier} priced`;
}

export type Evaluation ={ status: ConstraintStatus; evidence: string | null };

const has = (e: ToolModelEntity, set: Parameters<typeof keysOf>[1], key: string) => (keysOf(e, set) ?? []).includes(key);

export function evaluateConstraint(e: ToolModelEntity, c: Constraint, index: CatalogueIndex): Evaluation {
  switch (c.kind) {
    case "entity_type":
      return e.ref.type === c.value ? { status: "satisfied", evidence: null } : { status: "violated", evidence: `is a ${e.ref.type}` };

    case "exclude":
      return e.key === c.value ? { status: "violated", evidence: "named as excluded" } : { status: "satisfied", evidence: null };

    case "usecase": {
      const goal = String(c.value);
      if (has(e, "usecase", goal)) return { status: "satisfied", evidence: `for ${usecaseLabel(goal).toLowerCase()}` };
      return { status: "unknown", evidence: null };
    }

    case "budget_free": {
      const t = toolPrice(e);
      if (e.ref.type === "tool") {
        if (t && (t.tier === "free" || t.tier === "freemium")) return { status: "satisfied", evidence: t.tier === "free" ? "free" : "has a free plan" };
        if (e.pricingModel === "paid") return { status: "violated", evidence: "listed as paid" };
        return { status: "unknown", evidence: "price not recorded" };
      }
      const m = modelPrice(e);
      if (m) return m.blendedPerM === 0 ? { status: "satisfied", evidence: "free" } : { status: "violated", evidence: "priced per token" };
      return { status: "unknown", evidence: "price not recorded" };
    }

    case "budget_max": {
      if (c.value === "cheap") {
        if (e.ref.type === "tool") {
          const t = toolPrice(e);
          if (!t) return e.pricingModel === "paid" ? { status: "unknown", evidence: "paid, price not recorded" } : { status: "unknown", evidence: "price not recorded" };
          return TIER_ORDER[t.tier] <= TIER_ORDER.low
            ? { status: "satisfied", evidence: t.tier === "free" ? "free" : t.tier === "freemium" ? "has a free plan" : `from $${t.monthlyUsd}/mo` }
            : { status: "violated", evidence: `from $${t.monthlyUsd}/mo` };
        }
        const m = modelPrice(e);
        if (!m) return { status: "unknown", evidence: "price not recorded" };
        return m.blendedPerM <= TMR_V1.CHEAP_MODEL_PER_M
          ? { status: "satisfied", evidence: `$${m.blendedPerM.toFixed(2)} per million tokens, blended` }
          : { status: "violated", evidence: `$${m.blendedPerM.toFixed(2)} per million tokens, blended` };
      }
      const limit = Number(c.value);
      if (e.ref.type === "tool") {
        const t = toolPrice(e);
        if (t && (t.tier === "free" || t.tier === "freemium")) return { status: "satisfied", evidence: t.tier === "free" ? "free" : "has a free plan" };
        if (t && t.monthlyUsd !== null) return t.monthlyUsd <= limit ? { status: "satisfied", evidence: `from $${t.monthlyUsd}/mo` } : { status: "violated", evidence: `from $${t.monthlyUsd}/mo` };
        return { status: "unknown", evidence: "price not recorded" };
      }
      /* A monthly budget says nothing about a per token price. */
      return { status: "unknown", evidence: "priced per token, not per month" };
    }

    case "cheaper_than": {
      const target = index.entities.get(String(c.value));
      if (!target) return { status: "unknown", evidence: null };
      if (target.ref.type !== e.ref.type) return { status: "unknown", evidence: "different pricing" };
      if (e.ref.type === "tool") {
        const a = toolPrice(e);
        const b = toolPrice(target);
        if (!a || !b) return { status: "unknown", evidence: `price not recorded for ${a ? target.name : e.name}` };
        if (a.monthlyUsd !== null && b.monthlyUsd !== null) {
          return a.monthlyUsd < b.monthlyUsd
            ? { status: "satisfied", evidence: `$${a.monthlyUsd}/mo against $${b.monthlyUsd}/mo` }
            : { status: "violated", evidence: `$${a.monthlyUsd}/mo against $${b.monthlyUsd}/mo` };
        }
        const d = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
        if (d < 0) return { status: "satisfied", evidence: `${tierWords(a)}, ${target.name} ${tierWords(b)}` };
        if (d > 0) return { status: "violated", evidence: `${tierWords(a)}, ${target.name} ${tierWords(b)}` };
        return { status: "unknown", evidence: `both ${a.tier}, amounts not recorded` };
      }
      const a = modelPrice(e);
      const b = modelPrice(target);
      if (!a || !b) return { status: "unknown", evidence: "price not recorded" };
      return a.blendedPerM < b.blendedPerM
        ? { status: "satisfied", evidence: `$${a.blendedPerM.toFixed(2)} against $${b.blendedPerM.toFixed(2)} per million, blended` }
        : { status: "violated", evidence: `$${a.blendedPerM.toFixed(2)} against $${b.blendedPerM.toFixed(2)} per million, blended` };
    }

    case "platform": {
      if (e.ref.type === "model") return { status: "unknown", evidence: null };
      const platforms = keysOf(e, "platform");
      if (platforms?.includes(String(c.value))) return { status: "satisfied", evidence: `runs on ${c.value}` };
      /* A platform missing from a listing is "not listed", not "not supported". */
      return { status: "unknown", evidence: platforms && platforms.length ? `${c.value} not listed` : "platforms not recorded" };
    }

    case "open": {
      if (c.value === "open_weights") {
        if (isKnown(e.openWeights)) return e.openWeights.value ? { status: "satisfied", evidence: "open weights" } : { status: "violated", evidence: "closed weights" };
        if (e.tags.includes("open-weights")) return { status: "satisfied", evidence: "open weights" };
        return { status: "unknown", evidence: "not recorded" };
      }
      if (e.tags.includes("open-source") || has(e, "deployment", "open_source")) return { status: "satisfied", evidence: "open source" };
      const f = e.facts.open_source;
      if (f && f.flag === false) return { status: "violated", evidence: "not open source" };
      return { status: "unknown", evidence: "not recorded" };
    }

    case "deployment": {
      const key = String(c.value);
      if (has(e, "deployment", key) || (key === "self_hosted" && (has(e, "deployment", "local") || has(e, "deployment", "open_weights")))) {
        return { status: "satisfied", evidence: key.replace(/_/g, " ") };
      }
      const f = e.facts[`deploy_${key}`];
      if (f && f.flag === false) return { status: "violated", evidence: `not ${key.replace(/_/g, " ")}` };
      return { status: "unknown", evidence: "not recorded" };
    }

    case "min_context": {
      if (e.ref.type === "tool") return { status: "unknown", evidence: null };
      if (!isKnown(e.context)) return { status: "unknown", evidence: "context not recorded" };
      const need = Number(c.value);
      return e.context.value >= need
        ? { status: "satisfied", evidence: `${Math.round(e.context.value / 1000)}K context` }
        : { status: "violated", evidence: `${Math.round(e.context.value / 1000)}K context` };
    }

    case "capability": {
      const key = String(c.value);
      const f = e.facts[key];
      if (f && f.flag === true) return { status: "satisfied", evidence: key.replace(/_/g, " ") };
      if (f && f.flag === false) return { status: "violated", evidence: `no ${key.replace(/_/g, " ")}` };
      if (has(e, "capability", key)) return { status: "satisfied", evidence: key.replace(/_/g, " ") };
      return { status: "unknown", evidence: "not recorded" };
    }

    case "modality": {
      if (e.ref.type === "tool") return { status: "unknown", evidence: null };
      const mods = [...(keysOf(e, "modality") ?? []), ...(keysOf(e, "output_modality") ?? [])];
      if (mods.includes(String(c.value))) return { status: "satisfied", evidence: `${c.value} supported` };
      return mods.length ? { status: "violated", evidence: `${c.value} not among its modalities` } : { status: "unknown", evidence: "modalities not recorded" };
    }

    case "term": {
      const v = index.lexical.vectorOf(e.key);
      return v?.has(String(c.value)) ? { status: "satisfied", evidence: `mentions ${c.value}` } : { status: "unknown", evidence: null };
    }
  }
}
