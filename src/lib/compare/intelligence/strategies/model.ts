import { LIFECYCLE_LABEL } from "../../present";
import type { ModelItem } from "../../types";
import { benchmarkValue } from "../benchmarks";
import { COMPARE_V1 } from "../config";
import { MODEL_FIXED, benchmarkDimensions, factDimensions, sortBySection } from "../dimensions";
import { freshnessOf } from "../freshness";
import { formatNumber } from "../format";
import { performanceValue } from "../performance";
import { PRICE_KEY_OF, modelPriceValue } from "../pricing";
import type { CompareInput, ComparisonDimension, ComparisonEntity, ComparisonValue } from "../types";
import { appliesTo, factValue, textValue, type ComparisonStrategy, type ExtractContext } from "./shared";

/*
  Models: things called through an API (guide 16 section 7). Six separate prices,
  never merged with each other or with a tool's plan; context and output limits
  validated; performance is not_measured until somebody measures it; one
  dimension per benchmark and metric.
*/

export function modelExtract(dim: ComparisonDimension, entity: ComparisonEntity, ctx: ExtractContext): ComparisonValue {
  if (!appliesTo(dim, entity) || entity.item.type !== "model") return { state: "not_applicable" };
  const m: ModelItem = entity.item;
  const listing = [`listing:model:${m.id}`];
  const listed = freshnessOf(m.prices.provenance.verifiedAt, "fact", ctx.now);

  if (dim.factKey) return factValue(entity, dim.factKey, dim.kind, ctx.now);

  if (dim.kind === "benchmark") {
    if (!ctx.input.health.evaluations) return { state: "not_recorded" };
    return benchmarkValue(m, dim, ctx.now, ctx.issues);
  }
  if (dim.kind === "performance") {
    if (!ctx.input.health.performance) return { state: "not_recorded" };
    return performanceValue(m.id, dim, ctx.input.performance, ctx.now);
  }
  if (dim.id in PRICE_KEY_OF) return modelPriceValue(m, PRICE_KEY_OF[dim.id], dim.id, ctx.now, ctx.issues);

  switch (dim.id) {
    case "model.provider":
      return textValue(m.provider, listing);
    case "model.family":
      return textValue(m.family, listing);
    case "model.version":
      return textValue(m.version, listing);
    case "model.api_model_id":
      return textValue(m.apiModelId, listing);
    case "model.release_date":
      return textValue(m.releaseDate, listing);
    case "model.lifecycle":
      return textValue(m.lifecycle ? (LIFECYCLE_LABEL[m.lifecycle] ?? m.lifecycle) : null, listing);
    case "model.open_weights":
      return m.openWeights === null
        ? { state: "not_recorded" }
        : { state: "known", value: m.openWeights, display: m.openWeights ? "Yes" : "No", evidence: listing, freshness: listed };
    case "context_window":
    case "max_output": {
      const n = dim.id === "context_window" ? m.contextWindow : m.maxOutputTokens;
      if (n === null) return { state: "not_recorded" };
      if (n <= 0 || n > COMPARE_V1.maxContextTokens || !Number.isInteger(n)) {
        ctx.issues.push({ code: "invalid_context", entityId: m.id, dimension: dim.id, message: `${m.name} records an invalid ${dim.label.toLowerCase()}, so it is not shown.`, visibility: "public" });
        return { state: "not_recorded" };
      }
      if (dim.id === "max_output" && m.contextWindow !== null && n > m.contextWindow) {
        ctx.issues.push({ code: "invalid_context", entityId: m.id, dimension: dim.id, message: `${m.name} records a maximum output larger than its context window.`, visibility: "debug" });
      }
      return { state: "known", value: n, display: formatNumber("tokens", n), evidence: listing, freshness: listed };
    }
    case "modalities_in":
    case "modalities_out": {
      const list = dim.id === "modalities_in" ? m.modalities : m.outputModalities;
      return list.length === 0
        ? { state: "not_recorded" }
        : { state: "known", value: list.slice().sort(), display: list.join(", "), evidence: listing, freshness: listed };
    }
  }
  return { state: "not_recorded" };
}

export const ModelComparisonStrategy: ComparisonStrategy = {
  id: "model",
  dimensions(input: CompareInput) {
    return sortBySection([
      ...MODEL_FIXED,
      ...factDimensions(input.attributes).filter((d) => d.appliesTo.includes("model")),
      ...benchmarkDimensions(input.items),
    ]);
  },
  extract: modelExtract,
};
