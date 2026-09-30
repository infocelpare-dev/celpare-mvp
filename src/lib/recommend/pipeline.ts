import { unitHash } from "../community/intelligence/math";
import { OBJECTIVES, STRATEGY_SOURCES, TMR_V1, type Objective } from "./config";
import { isVersion, type CatalogueIndex } from "./catalogue";
import { keysOf } from "./entity";
import { mmr, type MmrItem } from "./diversity";
import { reasonFor } from "./reasons";
import { normalise, type SparseVector } from "./similarity/lexical";
import { retrieve, type SourceHit } from "./sources";
import { scoreFor, type Scored } from "./strategies";
import type {
  DebugEntry,
  EntityType,
  FitReport,
  RecItem,
  RecommendationRequest,
  RecommendationResult,
  Rejection,
  SourceId,
  ToolModelEntity,
} from "./types";
import type { UserContext } from "./user";
import { TMR_ALGORITHM, type TmrAssignment } from "./versions";

/*
  tool_model_recommendation_v1, one request (guide 17 section 3).

    sources  ->  union  ->  eligibility  ->  strategy parts  ->  objective
             ->  relevance floor  ->  MMR and caps  ->  exploration slot  ->  reasons

  PURE. The server builds the index and the user context and hands them in; this
  function reads nothing else, so the tests drive it with fixtures and the admin
  debug view can show every step. Every candidate that does not make it leaves a
  Rejection with a code, which is what `&why=` answers.
*/

export type PipelineInput = {
  request: RecommendationRequest;
  index: CatalogueIndex;
  user: UserContext;
  now: number;
  requestId: string;
  assignment: TmrAssignment;
};

const clean = (s: string | null | undefined) => (s ?? "").trim();

function objectiveOf(input: PipelineInput): Objective {
  return input.assignment.override?.objectives?.[input.request.strategy] ?? OBJECTIVES[input.request.strategy];
}

function valueOf(parts: Record<string, number>, objective: Objective): number {
  let v = 0;
  for (const [k, w] of Object.entries(objective)) v += w * (parts[k] ?? 0);
  return v;
}

/* When the request has a context strong enough to gate personalization (D180):
   a seed, a query, or a session with at least two tool or model actions. */
function hasContext(req: RecommendationRequest, user: UserContext, now: number): boolean {
  if ((req.seeds?.length ?? 0) > 0 || clean(req.query).length > 0) return true;
  const edge = now - TMR_V1.SESSION_MINUTES * 60_000;
  return user.sequence.filter((x) => x.at >= edge && x.ref !== null).length >= 2 || user.sessionQueries.length > 0;
}

function queryVectorOf(req: RecommendationRequest, user: UserContext, index: CatalogueIndex): SparseVector | null {
  const text = clean(req.query) || (req.strategy === "personalized" || req.strategy === "contextual" ? user.sessionQueries.slice(0, 3).join(" ") : "");
  if (!text) return null;
  const v = index.lexical.queryVector(text);
  return v.size ? normalise(v) : null;
}

export function recommend(input: PipelineInput): RecommendationResult {
  const { request: req, index, user, now } = input;
  const strategy = req.strategy;
  const limit = Math.max(1, Math.min(24, req.limit));
  const rejected: Rejection[] = [];
  const reject = (key: string, code: Rejection["code"], detail: string | null = null) => rejected.push({ key, code, detail });

  const seeds = (req.seeds ?? []).map((r) => index.entities.get(`${r.type}:${r.id}`)).filter((e): e is ToolModelEntity => Boolean(e));
  const excluded = new Set((req.exclude ?? []).map((r) => `${r.type}:${r.id}`));
  const constraints = req.constraints ?? [];
  const types: EntityType[] = req.entityTypes.length ? req.entityTypes : ["tool", "model"];
  const queryVector = queryVectorOf(req, user, index);
  const usecases = [
    ...constraints.filter((c) => c.kind === "usecase").map((c) => String(c.value)),
    ...(req.goal ? [req.goal] : []),
    ...(user.intent?.startsWith("usecase:") ? [user.intent.slice(8)] : []),
  ];

  const base: RecommendationResult = {
    algorithm: TMR_ALGORITHM,
    requestId: input.requestId,
    surface: req.surface,
    strategy,
    variant: input.assignment.variant,
    items: [],
    rejected,
    unresolved: [],
    debug: req.debug ? [] : null,
    note: null,
  };

  /* A seeded strategy with no seed we carry has nothing to say. */
  if ((strategy === "similar" || strategy === "alternative" || strategy === "related") && seeds.length === 0) {
    return { ...base, note: "The item this is based on is not in the catalogue." };
  }

  /* 1. Sources. */
  const allowed = STRATEGY_SOURCES[strategy].filter((s) => s !== "popular" || user.cold);
  const pool = retrieve({ index, user, seeds, types, queryVector, usecases, now }, allowed);

  /* 2. Eligibility, then 3. parts and objective. */
  const objective = objectiveOf(input);
  const context = strategy === "personalized" && hasContext(req, user, now);
  const floor = TMR_V1.RELEVANCE_FLOOR[strategy];
  const scored: { entity: ToolModelEntity; s: Scored; value: number; hits: SourceHit[] }[] = [];

  for (const [key, hits] of pool) {
    const e = index.entities.get(key);
    if (!e) continue;
    if (!types.includes(e.ref.type)) { reject(key, "wrong_type"); continue; }
    if (seeds.some((s) => s.key === key)) { reject(key, "seed"); continue; }
    if (excluded.has(key)) { reject(key, "excluded"); continue; }
    if (e.fixture && !req.includeFixtures) { reject(key, "fixture"); continue; }
    if (!e.approved || (e.lifecycle && (TMR_V1.UNAVAILABLE_LIFECYCLES as readonly string[]).includes(e.lifecycle))) { reject(key, "unavailable", e.lifecycle); continue; }
    if (e.listingPenalty >= TMR_V1.PENALTY_BLOCK) { reject(key, "safety", "listing penalty"); continue; }
    if (e.completeness < TMR_V1.QUALITY_FLOOR) { reject(key, "low_quality", `listing ${Math.round(e.completeness * 100)}% complete`); continue; }
    if (user.dismissed.has(key)) { reject(key, "dismissed"); continue; }
    if (strategy === "alternative") {
      const v = seeds.map((s) => isVersion(s, e)).find(Boolean);
      if (v) { reject(key, "version_of_seed", v); continue; }
      if (e.developerId && seeds.some((s) => s.developerId === e.developerId)) { reject(key, "same_developer"); continue; }
    }
    if (strategy === "related" && !seeds.some((s) => s.ref.type !== e.ref.type && index.relation(s, e).kind === "related")) {
      reject(key, "no_relation");
      continue;
    }

    const s = scoreFor(strategy, e, { index, user, seeds, queryVector, constraints, now });
    const violated = s.constraintResults.find((r) => r.constraint.hard && r.status === "violated");
    if (violated) { reject(key, "failed_constraint", `${violated.constraint.phrase}: ${violated.evidence ?? "violated"}`); continue; }
    if (context && (s.parts.context ?? 0) < TMR_V1.CONTEXT_FLOOR) { reject(key, "context_gate", `context ${(s.parts.context ?? 0).toFixed(2)}`); continue; }
    if (s.relevance < floor) { reject(key, "insufficient_relevance", `relevance ${s.relevance.toFixed(2)}`); continue; }
    if (strategy === "personalized" && !user.cold && s.novelty < TMR_V1.SEEN_FLOOR && !user.owned.has(key)) { reject(key, "already_seen"); continue; }

    scored.push({ entity: e, s, value: valueOf(s.parts, objective), hits });
  }

  /* 4. MMR and caps. One slot is held back for exploration when the list is
     long enough, the strategy discovers (personalized), and the person is known. */
  const wantExploration = strategy === "personalized" && !user.cold && limit >= TMR_V1.EXPLORATION_MIN_LIST;
  const mainLimit = wantExploration ? limit - 1 : limit;
  const byKey = new Map(scored.map((x) => [x.entity.key, x]));
  const exploreKeys = new Set(scored.filter((x) => x.hits.some((h) => h.source === "exploration")).map((x) => x.entity.key));
  const mainItems: MmrItem[] = scored.filter((x) => !exploreKeys.has(x.entity.key) || !wantExploration).map((x) => ({ entity: x.entity, value: x.value }));
  const { picked, dropped } = mmr(mainItems, index, TMR_V1.MMR_LAMBDA[strategy], mainLimit, TMR_V1.CAPS[strategy]);
  for (const d of dropped) reject(d.key, d.reason, d.detail);

  let explorationPick: MmrItem | null = null;
  if (wantExploration) {
    const pickedKeys = new Set(picked.map((p) => p.entity.key));
    const options = scored
      .filter((x) => exploreKeys.has(x.entity.key) && !pickedKeys.has(x.entity.key) && x.s.parts.quality >= TMR_V1.EXPLORATION_MIN_QUALITY)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    if (options.length) {
      /* Deterministic per person per day, so a refresh does not reshuffle it. */
      const day = Math.floor(now / 86_400_000);
      const pick = options[Math.floor(unitHash(`${user.userId ?? req.sessionId ?? "anon"}:${day}:${strategy}`) * options.length)];
      explorationPick = { entity: pick.entity, value: pick.value };
    }
  }

  const final: { item: MmrItem; exploration: boolean }[] = picked.map((p) => ({ item: p, exploration: false }));
  if (explorationPick) {
    /* It takes the middle, never the top. */
    final.splice(Math.min(final.length, Math.floor(limit / 2)), 0, { item: explorationPick, exploration: true });
  }
  const finalKeys = new Set(final.map((f) => f.item.entity.key));
  for (const x of scored) if (!finalKeys.has(x.entity.key) && !rejected.some((r) => r.key === x.entity.key)) reject(x.entity.key, "limit");

  /* 5. Items, reasons, fit reports. */
  const items: RecItem[] = final.map(({ item, exploration }, rank) => {
    const x = byKey.get(item.entity.key)!;
    const e = x.entity;
    const sources = [...new Set(x.hits.map((h) => h.source))] as SourceId[];
    const primary = x.hits.slice().sort((a, b) => b.strength - a.strength)[0]?.source ?? sources[0];
    let relationWhy: string | null = null;
    if (strategy === "related") {
      for (const s of seeds) {
        const r = index.relation(s, e);
        if (r.kind === "related") { relationWhy = r.why; break; }
      }
    }
    const isNew = sources.includes("new");
    const reason = reasonFor(e, x.s, { strategy, index, user, seeds, isNew, exploration, relationWhy });
    return {
      ref: e.ref,
      key: e.key,
      rank,
      source: exploration ? "exploration" : primary,
      sources,
      parts: x.s.parts,
      reason,
      exploration,
      fit: strategy === "fit" || constraints.length > 0 ? fitReport(e, x.s) : null,
      relation: relationWhy,
    };
  });

  if (base.debug) {
    const debug: DebugEntry[] = scored
      .map((x) => ({
        key: x.entity.key,
        sources: [...new Set(x.hits.map((h) => h.source))] as SourceId[],
        parts: x.s.parts,
        value: x.value,
        position: items.findIndex((i) => i.key === x.entity.key),
        novelty: x.s.novelty,
        exploration: items.some((i) => i.key === x.entity.key && i.exploration),
      }))
      .map((d) => ({ ...d, position: d.position >= 0 ? d.position : null }))
      .sort((a, b) => b.value - a.value);
    base.debug = debug;
  }

  const note =
    items.length === 0
      ? pool.size === 0
        ? "Nothing in the catalogue is close enough to recommend here yet."
        : "Everything close enough was ruled out by the requirements or the quality checks."
      : null;
  return { ...base, items, note };
}

/* Strengths, tradeoffs and missing information, from the constraint results and
   the recorded attributes. Never a verdict. */
function fitReport(e: ToolModelEntity, s: Scored): FitReport {
  const strengths: string[] = [];
  const tradeoffs: string[] = [];
  const missing: string[] = [];
  for (const r of s.constraintResults) {
    if (r.constraint.kind === "exclude" || r.constraint.kind === "entity_type") continue;
    if (r.status === "satisfied") strengths.push(r.evidence ?? r.constraint.phrase);
    else if (r.status === "violated") tradeoffs.push(r.evidence ?? `does not meet ${r.constraint.phrase}`);
    else missing.push(`${r.constraint.phrase}: ${r.evidence ?? "not recorded"}`);
  }
  if (strengths.length === 0) {
    const caps = (e.attrs.capability ?? []).filter((a) => a.from === "fact").slice(0, 2).map((a) => a.key.replace(/_/g, " "));
    strengths.push(...caps);
  }
  if ((keysOf(e, "platform") ?? []).length === 0 && e.ref.type === "tool") missing.push("platforms not recorded");
  return { constraints: s.constraintResults, strengths: [...new Set(strengths)].slice(0, 4), tradeoffs, missing: [...new Set(missing)].slice(0, 4) };
}
