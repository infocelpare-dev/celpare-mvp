import type { CompareItem, Evaluation, Fact, ModelItem, Plan, Provenance, ToolItem } from "../types";
import { freshnessOf } from "./freshness";
import type { ComparisonEvidence, EvidenceSourceType, FreshnessClass, PerformanceRow } from "./types";

/*
  Evidence is a VIEW over the provenance Compare already reads (D163). Every fact,
  plan, evaluation, model price and performance row carries source_label,
  source_url and verified_at; this turns those rows into one shape the engine can
  point at. Nothing is copied to a table, and nothing here is derived: a derived
  statement cites the ids of the evidence it was computed from.

  Ids are stable and typed: fact:<uuid>, plan:<uuid>, eval:<uuid>,
  price:<model id>, perf:<uuid>, listing:<type>:<id>, reviews:<tool id>.
*/

/* The registrable part of a host, good enough to tell a vendor's own page from
   somebody else's: www.anthropic.com and docs.anthropic.com both give
   anthropic.com. Not a public suffix list; a .co.uk vendor reads as co.uk, which
   only ever makes a page look less official, never more. */
export function siteOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const parts = host.split(".").filter(Boolean);
    return parts.length >= 2 ? parts.slice(-2).join(".") : host;
  } catch {
    return null;
  }
}

/* official: the vendor's own site. independent: a source URL somewhere else.
   user: no source at all, which is listing text somebody typed. */
export function sourceTypeOf(sourceUrl: string | null, vendorUrl: string | null): EvidenceSourceType {
  const src = siteOf(sourceUrl);
  if (!src) return "user";
  const vendor = siteOf(vendorUrl);
  return vendor && vendor === src ? "official" : "independent";
}

/* high: verified, with a source URL, inside its freshness window. medium: a
   source URL but no verified date, or aging. low: no source URL, or stale. */
export function confidenceOf(p: Provenance, cls: FreshnessClass, now: number): ComparisonEvidence["confidence"] {
  if (!p.url) return "low";
  const f = freshnessOf(p.verifiedAt, cls, now);
  if (f === "stale") return "low";
  if (f === "fresh") return "high";
  return "medium";
}

const PRIVACY_KEYS = new Set(["privacy_policy", "trains_on_user_data", "data_retention", "encryption", "data_residency"]);
const SECURITY_KEYS = new Set(["enterprise_controls", "certifications"]);

function claimTypeOfFact(attribute: string): ComparisonEvidence["claimType"] {
  if (PRIVACY_KEYS.has(attribute)) return "privacy";
  if (SECURITY_KEYS.has(attribute)) return "security";
  if (attribute.startsWith("deploy_") || attribute.startsWith("integration_")) return "availability";
  if (attribute.startsWith("fit_") || attribute === "strength" || attribute === "limitation") return "feature";
  return "capability";
}

function factClaim(f: Fact): string {
  if (f.flag !== null) return `${f.attribute}: ${f.flag ? "yes" : "no"}`;
  if (f.number !== null) return `${f.attribute}: ${f.number}`;
  return `${f.attribute}: ${f.text ?? ""}`.trim();
}

function factEvidence(item: CompareItem, f: Fact, now: number): ComparisonEvidence {
  return {
    id: `fact:${f.id}`,
    entityId: item.id,
    claimType: claimTypeOfFact(f.attribute),
    claim: factClaim(f),
    sourceName: f.provenance.label,
    sourceUrl: f.provenance.url,
    publishedAt: null,
    observedAt: f.provenance.verifiedAt,
    confidence: confidenceOf(f.provenance, "fact", now),
    sourceType: sourceTypeOf(f.provenance.url, item.websiteUrl),
  };
}

function planEvidence(item: ToolItem, p: Plan, now: number): ComparisonEvidence {
  return {
    id: `plan:${p.id}`,
    entityId: item.id,
    claimType: "pricing",
    claim: `${p.name} plan`,
    sourceName: p.provenance.label,
    sourceUrl: p.provenance.url,
    publishedAt: null,
    observedAt: p.provenance.verifiedAt,
    confidence: confidenceOf(p.provenance, "price", now),
    sourceType: sourceTypeOf(p.provenance.url, item.websiteUrl),
  };
}

function evalEvidence(item: ModelItem, e: Evaluation, now: number): ComparisonEvidence {
  return {
    id: `eval:${e.id}`,
    entityId: item.id,
    claimType: "benchmark",
    claim: `${e.name} ${e.metric}: ${e.score}`,
    sourceName: e.provenance.label ?? e.evaluator,
    sourceUrl: e.provenance.url,
    publishedAt: e.publishedAt,
    observedAt: e.evaluatedAt,
    confidence: confidenceOf({ ...e.provenance, verifiedAt: e.provenance.verifiedAt ?? e.evaluatedAt }, "benchmark", now),
    sourceType: "benchmark",
  };
}

function priceEvidence(item: ModelItem, now: number): ComparisonEvidence {
  const p = item.prices.provenance;
  return {
    id: `price:${item.id}`,
    entityId: item.id,
    claimType: "pricing",
    claim: "API list prices per 1M tokens",
    sourceName: p.label,
    sourceUrl: p.url,
    publishedAt: null,
    observedAt: p.verifiedAt,
    confidence: confidenceOf(p, "price", now),
    sourceType: sourceTypeOf(p.url, item.websiteUrl),
  };
}

/* The catalogue row itself. Model rows were imported with their price source
   (D117), so that source stands behind context and modalities too. A tool row is
   listing text, labelled as such. */
function listingEvidence(item: CompareItem, now: number): ComparisonEvidence {
  if (item.type === "model") {
    const p = item.prices.provenance;
    return {
      id: `listing:model:${item.id}`,
      entityId: item.id,
      claimType: "capability",
      claim: "Catalogue record: context, output limit, modalities",
      sourceName: p.label ?? "Celpare catalogue",
      sourceUrl: p.url,
      publishedAt: null,
      observedAt: p.verifiedAt,
      confidence: confidenceOf(p, "fact", now),
      sourceType: sourceTypeOf(p.url, item.websiteUrl),
    };
  }
  return {
    id: `listing:tool:${item.id}`,
    entityId: item.id,
    claimType: "capability",
    claim: "Catalogue listing: categories, platforms, pricing model",
    sourceName: "Celpare listing",
    sourceUrl: null,
    publishedAt: null,
    observedAt: item.listedUpdatedAt,
    confidence: "low",
    sourceType: "user",
  };
}

function reviewsEvidence(item: ToolItem): ComparisonEvidence {
  return {
    id: `reviews:${item.id}`,
    entityId: item.id,
    claimType: "feature",
    claim: `${item.ratingCount} visible ratings`,
    sourceName: "Celpare reviews",
    sourceUrl: null,
    publishedAt: null,
    observedAt: item.latestReviewAt,
    confidence: item.ratingCount >= 5 ? "medium" : "low",
    sourceType: "community",
  };
}

function perfEvidence(item: ModelItem, r: PerformanceRow, now: number): ComparisonEvidence {
  return {
    id: `perf:${r.id}`,
    entityId: item.id,
    claimType: "performance",
    claim: `${r.metric}: ${r.value} ${r.unit}${r.providerEndpoint ? ` on ${r.providerEndpoint}` : ""}`,
    sourceName: r.provenance.label,
    sourceUrl: r.provenance.url,
    publishedAt: null,
    observedAt: r.measuredAt,
    confidence: confidenceOf({ ...r.provenance, verifiedAt: r.provenance.verifiedAt ?? r.measuredAt }, "performance", now),
    sourceType: sourceTypeOf(r.provenance.url, item.websiteUrl),
  };
}

export function buildEvidence(items: CompareItem[], performance: PerformanceRow[], now: number): Record<string, ComparisonEvidence> {
  const out: Record<string, ComparisonEvidence> = {};
  const put = (e: ComparisonEvidence) => {
    out[e.id] = e;
  };
  for (const item of items) {
    put(listingEvidence(item, now));
    for (const f of item.facts) put(factEvidence(item, f, now));
    if (item.type === "tool") {
      for (const p of item.plans) put(planEvidence(item, p, now));
      if (item.ratingCount > 0) put(reviewsEvidence(item));
    } else {
      put(priceEvidence(item, now));
      for (const e of item.evaluations) put(evalEvidence(item, e, now));
      for (const r of performance.filter((p) => p.modelId === item.id)) put(perfEvidence(item, r, now));
    }
  }
  return out;
}
