import { TMR_V1 } from "./config";
import type { CatalogueIndex } from "./catalogue";
import { keysOf, usecaseLabel } from "./entity";
import type { Scored } from "./strategies";
import type { Reason, Strategy, ToolModelEntity } from "./types";
import type { UserContext } from "./user";

/*
  Why this is here (guide 17 section 12).

  A reason is produced ONLY when the signal behind it is real and crossed its
  threshold. No filler: when nothing honest can be said, the reason is null and
  the card shows none. Social proof is counts only, never a name (D155, D136).
  Text lives in explainReason; the engine returns codes and the words they need.
*/

const humanise = (k: string) => k.replace(/[-_]/g, " ");

/* Capabilities both entries have, facts first. */
export function sharedCapabilities(a: ToolModelEntity, b: ToolModelEntity): string[] {
  const kb = new Map((b.attrs.capability ?? []).map((x) => [x.key, x]));
  return (a.attrs.capability ?? [])
    .filter((x) => kb.has(x.key))
    .sort((x, y) => (x.from === "fact" ? -1 : 0) - (y.from === "fact" ? -1 : 0))
    .map((x) => humanise(x.key));
}

export type ReasonContext = {
  strategy: Strategy;
  index: CatalogueIndex;
  user: UserContext;
  seeds: ToolModelEntity[];
  isNew: boolean;
  exploration: boolean;
  relationWhy: string | null;
};

export function reasonFor(e: ToolModelEntity, s: Scored, ctx: ReasonContext): Reason | null {
  const R = TMR_V1.REASON;
  const seed = ctx.seeds.find((x) => x.ref.type === e.ref.type) ?? null;

  if (ctx.exploration) return { code: "exploration", labels: [], count: null };

  if (ctx.strategy === "related" && ctx.relationWhy) {
    return { code: "made_by_provider", labels: [ctx.relationWhy], count: null };
  }

  if (ctx.strategy === "fit") {
    /* Every hard requirement met, no soft one contradicted, and at least one
       thing positively satisfied. A soft term that is merely not recorded (a
       language the listing does not mention) does not block the reason. */
    const scored = s.constraintResults.filter((r) => r.constraint.kind !== "exclude" && r.constraint.kind !== "entity_type");
    const met = scored.filter((r) => r.status === "satisfied");
    const hardOk = scored.filter((r) => r.constraint.hard).every((r) => r.status === "satisfied");
    const softOk = scored.filter((r) => !r.constraint.hard).every((r) => r.status !== "violated");
    if (met.length > 0 && hardOk && softOk) {
      return { code: "compatible_with_requirements", labels: met.map((r) => r.evidence ?? r.constraint.phrase).slice(0, 3), count: null };
    }
  }

  /* Compared together by enough distinct people. */
  for (const sd of ctx.seeds) {
    const co = ctx.index.cooccurrence(sd.key, e.key);
    if (co && co.source === "co_compared" && co.people >= TMR_V1.COOCCUR_REASON_PEOPLE) {
      return { code: "often_compared_with", labels: [sd.name], count: co.people };
    }
  }

  if (ctx.strategy === "alternative" && seed) {
    return { code: "alternative_to", labels: [seed.name], count: null };
  }

  if ((ctx.strategy === "similar" || ctx.strategy === "contextual") && seed) {
    const shared = sharedCapabilities(e, seed);
    if (shared.length >= R.SHARED_CAPABILITIES) return { code: "similar_capabilities", labels: shared.slice(0, 2), count: null };
    const uc = (keysOf(e, "usecase") ?? []).filter((k) => (keysOf(seed, "usecase") ?? []).includes(k));
    if (uc.length > 0) return { code: "same_use_case", labels: [usecaseLabel(uc[0]).toLowerCase()], count: null };
  }

  if (ctx.strategy === "personalized") {
    if ((s.parts.context ?? 0) >= R.SESSION && ctx.user.sessionQueries.length > 0) return { code: "matches_recent_search", labels: [], count: null };
    if ((s.parts.owned ?? 0) >= R.OWNED) return { code: "matches_saved_interests", labels: [], count: null };
    const savers = ctx.user.networkSavers.get(e.key) ?? e.networkSavers ?? 0;
    if (savers >= R.NETWORK_MIN) return { code: "network_saved", labels: [], count: savers };
    if (ctx.isNew) {
      const cat = (keysOf(e, "category") ?? [])[0];
      if (cat && (ctx.user.long.get(`category:${cat}`) ?? 0) > 0) return { code: "new_in_category", labels: [humanise(cat)], count: null };
    }
  }

  const uc = keysOf(e, "usecase") ?? [];
  if (ctx.strategy === "fit" && uc.length) {
    const asked = s.constraintResults.find((r) => r.constraint.kind === "usecase" && r.status === "satisfied");
    if (asked) return { code: "same_use_case", labels: [usecaseLabel(String(asked.constraint.value)).toLowerCase()], count: null };
  }
  return null;
}

/* The sentence a card shows. Only from the code and its labels. */
export function explainReason(r: Reason): string {
  switch (r.code) {
    case "similar_capabilities":
      return `Also does ${r.labels.join(" and ")}`;
    case "same_use_case":
      return `Also for ${r.labels[0]}`;
    case "alternative_to":
      return `An alternative to ${r.labels[0]}`;
    case "matches_recent_search":
      return "Matches your recent search";
    case "matches_saved_interests":
      return "Close to what you saved";
    case "compatible_with_requirements":
      return `Fits: ${r.labels.join(", ")}`;
    case "often_compared_with":
      return `Often compared with ${r.labels[0]}`;
    case "network_saved":
      return `Saved by ${r.count} people you follow`;
    case "new_in_category":
      return `New in ${r.labels[0]}`;
    case "made_by_provider":
      return r.labels[0] ? r.labels[0].charAt(0).toUpperCase() + r.labels[0].slice(1) : "Related";
    case "exploration":
      return "Something different";
  }
}
