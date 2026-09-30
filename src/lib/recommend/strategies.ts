import { clamp01, halfLifeDecay, saturate } from "../community/intelligence/math";
import { TMR_V1 } from "./config";
import type { CatalogueIndex } from "./catalogue";
import { evaluateConstraint } from "./constraints";
import { keysOf } from "./entity";
import { cosine, type SparseVector } from "./similarity/lexical";
import { jaccard, priceProximity } from "./similarity/structured";
import type { Constraint, ConstraintStatus, Strategy, ToolModelEntity } from "./types";
import { noveltyOf, ownedSimilarity, sessionRelevance, userRelevance, type UserContext } from "./user";

/*
  The strategies (guide 17 section 9, D179).

  Each turns a candidate into NAMED PARTS, 0..1. The strategy's objective in
  config.ts weighs them. A part is only ever computed from something real: a
  similarity, a recorded attribute, a recorded behaviour. A part that has nothing
  to rest on is 0.5 (neutral) where missing data must not punish (compatibility),
  and 0 where the part is a claim (relation, constraints).

  Each strategy also names its RELEVANCE part: what a candidate must reach before
  it is recommended at all (RELEVANCE_FLOOR). Quality and freshness can order
  relevant things; they can never make an irrelevant thing relevant.
*/

export type PartsContext = {
  index: CatalogueIndex;
  user: UserContext;
  seeds: ToolModelEntity[];
  queryVector: SparseVector | null;
  constraints: Constraint[];
  now: number;
};

export type Scored = {
  parts: Record<string, number>;
  relevance: number;
  constraintResults: { constraint: Constraint; status: ConstraintStatus; evidence: string | null }[];
  novelty: number;
};

export function freshnessOf(e: ToolModelEntity, now: number): number {
  if (!e.createdAt) return 0.5;
  return halfLifeDecay(Math.max(0, now - e.createdAt) / 86_400_000, TMR_V1.HALF_LIFE_DAYS[e.ref.type]);
}

/* Completeness of the listing, lifted by search's listing quality (verified,
   rating, reviews), less its penalty. Search's qualityOf tops out near 0.35 for
   a model with no ratings, so it is rescaled rather than used raw. */
export function qualityOf(e: ToolModelEntity): number {
  return clamp01(0.6 * e.completeness + 0.4 * Math.min(1, e.listingQuality / 0.6) - 0.5 * e.listingPenalty);
}

/* How much recorded evidence stands behind an entry: sourced facts, verified
   evaluations, reviews. Never popularity. */
export function evidenceOf(e: ToolModelEntity): number {
  return saturate(2 * e.verifiedEvaluations + e.evaluations + 0.5 * e.factCount + e.ratingCount, 6);
}

function bestSeed(e: ToolModelEntity, ctx: PartsContext, f: (s: ToolModelEntity) => number): number {
  let best = 0;
  for (const s of ctx.seeds) if (s.ref.type === e.ref.type) best = Math.max(best, f(s));
  return best;
}

function setJaccard(a: ToolModelEntity, b: ToolModelEntity, set: "capability" | "usecase" | "category" | "platform" | "deployment"): number | null {
  const ka = keysOf(a, set);
  const kb = keysOf(b, set);
  if (!ka || !kb || ka.length === 0 || kb.length === 0) return null;
  return jaccard(ka, kb);
}

/* Compatibility with the seed: platforms, deployment, price. Unknown is neutral. */
function compatibility(e: ToolModelEntity, seed: ToolModelEntity): number {
  const parts = [setJaccard(e, seed, "platform"), setJaccard(e, seed, "deployment"), priceProximity(e, seed)].filter((x): x is number => x !== null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0.5;
}

function contextRelevance(e: ToolModelEntity, ctx: PartsContext): number {
  const seeds = bestSeed(e, ctx, (s) => ctx.index.sim(s.key, e.key).value);
  return Math.max(seeds, sessionRelevance(e, ctx.user, ctx.queryVector, ctx.index));
}

function queryRelevance(e: ToolModelEntity, ctx: PartsContext): number {
  if (!ctx.queryVector || ctx.queryVector.size === 0) return 0;
  const v = ctx.index.lexical.vectorOf(e.key);
  return v ? clamp01(1.5 * cosine(ctx.queryVector, v)) : 0;
}

function personal(e: ToolModelEntity, ctx: PartsContext): number {
  return ctx.user.cold ? 0 : userRelevance(e, ctx.user);
}

export function scoreFor(strategy: Strategy, e: ToolModelEntity, ctx: PartsContext): Scored {
  const novelty = noveltyOf(e, ctx.user, ctx.now);
  const quality = qualityOf(e);
  const freshness = freshnessOf(e, ctx.now);
  const none: Scored["constraintResults"] = [];

  switch (strategy) {
    case "similar": {
      const hybrid = bestSeed(e, ctx, (s) => ctx.index.sim(s.key, e.key).value);
      const capability = bestSeed(e, ctx, (s) => setJaccard(e, s, "capability") ?? 0);
      const usecase = bestSeed(e, ctx, (s) => setJaccard(e, s, "usecase") ?? 0);
      const category = bestSeed(e, ctx, (s) => setJaccard(e, s, "category") ?? 0);
      return {
        parts: { hybrid, capability, usecase, category, quality, freshness, personal: personal(e, ctx) },
        relevance: hybrid,
        constraintResults: none,
        novelty,
      };
    }

    case "alternative": {
      const usecase = bestSeed(e, ctx, (s) => setJaccard(e, s, "usecase") ?? setJaccard(e, s, "category") ?? 0);
      const capability = bestSeed(e, ctx, (s) => setJaccard(e, s, "capability") ?? ctx.index.sim(s.key, e.key).value);
      const compat = ctx.seeds.length ? Math.max(...ctx.seeds.filter((s) => s.ref.type === e.ref.type).map((s) => compatibility(e, s)), 0) : 0.5;
      const results = ctx.constraints.map((c) => ({ constraint: c, ...evaluateConstraint(e, c, ctx.index) }));
      /* An alternative must be a SUBSTITUTE for a seed (catalogue.ts): similar
         enough and doing the same job. For tools the job is also the recorded
         category, when both have one: a voice tool is not an alternative to a
         code editor because both mention "business". */
      const substitute = bestSeed(e, ctx, (s) => {
        if (ctx.index.relation(s, e).kind !== "substitute") return 0;
        if (e.ref.type === "tool" && setJaccard(e, s, "category") === 0) return 0;
        return ctx.index.sim(s.key, e.key).value;
      });
      return {
        parts: { usecase, capability, compatibility: compat, quality, evidence: evidenceOf(e), substitute },
        relevance: substitute,
        constraintResults: results,
        novelty,
      };
    }

    case "personalized": {
      const user = personal(e, ctx);
      const context = contextRelevance(e, ctx);
      return {
        parts: { user, owned: ownedSimilarity(e, ctx.user, ctx.index), novelty, quality, freshness, context },
        /* A cold visitor has no personal relevance; the quality prior carries. */
        relevance: ctx.user.cold ? Math.max(quality, context) : Math.max(user, context),
        constraintResults: none,
        novelty,
      };
    }

    case "fit": {
      const results = ctx.constraints.map((c) => ({ constraint: c, ...evaluateConstraint(e, c, ctx.index) }));
      const scored = results.filter((r) => r.constraint.kind !== "exclude" && r.constraint.kind !== "entity_type");
      const satisfied = scored.filter((r) => r.status === "satisfied").length;
      const constraints = scored.length ? satisfied / scored.length : 0;
      const query = queryRelevance(e, ctx);
      return {
        parts: { constraints, query, evidence: evidenceOf(e), quality, preference: personal(e, ctx) },
        relevance: Math.max(query, scored.some((r) => r.constraint.kind === "usecase" && r.status === "satisfied") ? 0.5 : 0),
        constraintResults: results,
        novelty,
      };
    }

    case "contextual": {
      /* Worth adding to THIS set: similar to the set as a whole (the mean over
         its same type members), not to whichever member it happens to resemble. */
      const same = ctx.seeds.filter((s) => s.ref.type === e.ref.type);
      const context = same.length ? same.reduce((a, s) => a + ctx.index.sim(s.key, e.key).value, 0) / same.length : 0;
      let co = 0;
      for (const s of ctx.seeds) {
        const c = ctx.index.cooccurrence(s.key, e.key);
        if (c) co = Math.max(co, c.people / (c.people + TMR_V1.COOCCUR_K));
      }
      const q = queryRelevance(e, ctx);
      return {
        parts: { context: Math.max(context, q), coCompared: co, quality, personal: personal(e, ctx) },
        relevance: Math.max(context, q),
        constraintResults: none,
        novelty,
      };
    }

    case "related": {
      let relation = 0;
      for (const s of ctx.seeds) {
        if (s.ref.type === e.ref.type) continue;
        const r = ctx.index.relation(s, e);
        if (r.kind !== "related") continue;
        const strength = r.evidence === "name" ? 1 : r.evidence === "tag" ? 0.9 : r.evidence === "co_compared" ? 0.7 : 0.6;
        relation = Math.max(relation, strength);
      }
      return {
        parts: { relation, quality, personal: personal(e, ctx) },
        relevance: relation,
        constraintResults: none,
        novelty,
      };
    }
  }
}
