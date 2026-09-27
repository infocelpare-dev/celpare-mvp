import { foldPlatforms, type Platform } from "../../present";
import type { ToolItem } from "../../types";
import { TOOL_FIXED, factDimensions, sortBySection } from "../dimensions";
import { freshnessOf, worstFreshness } from "../freshness";
import { planValue } from "../pricing";
import type { CompareInput, ComparisonDimension, ComparisonEntity, ComparisonValue } from "../types";
import { appliesTo, factValue, type ComparisonStrategy, type ExtractContext } from "./shared";

/*
  Tools: products somebody subscribes to (guide 16 section 7). Plans are compared
  tier by tier and never summed; platforms are what the listing says, so an
  absent platform is "Not listed", never "Not supported"; community evidence is
  its own section and never a strength.
*/

export function toolExtract(dim: ComparisonDimension, entity: ComparisonEntity, ctx: ExtractContext): ComparisonValue {
  if (!appliesTo(dim, entity) || entity.item.type !== "tool") return { state: "not_applicable" };
  const t: ToolItem = entity.item;
  const listing = [`listing:tool:${t.id}`];
  const listed = freshnessOf(t.listedUpdatedAt, "identity", ctx.now);

  if (dim.factKey) return factValue(entity, dim.factKey, dim.kind, ctx.now);

  if (dim.id.startsWith("plan:")) {
    if (!ctx.input.health.plans) return { state: "not_recorded" };
    return planValue(t, dim.id.slice(5) as "free" | "individual" | "team" | "business" | "enterprise", ctx.now);
  }

  if (dim.id.startsWith("platform:")) {
    if (t.platforms.length === 0) return { state: "not_recorded" };
    const { known } = foldPlatforms(t.platforms);
    const on = known.has(dim.id.slice(9) as Platform);
    return { state: "known", value: on, display: on ? "Listed" : "Not listed", evidence: listing, freshness: listed };
  }

  switch (dim.id) {
    case "tool.categories":
      return t.categories.length > 0
        ? { state: "known", value: t.categories, display: t.categories.join(", "), evidence: listing, freshness: listed }
        : { state: "not_recorded" };
    case "tool.verified":
      return { state: "known", value: t.verified, display: t.verified ? "Verified" : "Not verified", evidence: listing, freshness: listed };
    case "tool.pricing_model":
      return t.pricingModel
        ? { state: "known", value: t.pricingModel, display: t.pricingModel.charAt(0).toUpperCase() + t.pricingModel.slice(1), evidence: listing, freshness: listed }
        : { state: "not_recorded" };
    case "tool.integrations_count": {
      const facts = t.facts.filter((f) => f.attribute.startsWith("integration_"));
      if (facts.length === 0) return { state: "not_recorded" };
      const yes = facts.filter((f) => f.attribute !== "integration_other" && f.flag === true).length;
      const other = facts.filter((f) => f.attribute === "integration_other" && f.text).length;
      return {
        state: "known",
        value: yes + other,
        display: String(yes + other),
        evidence: facts.map((f) => `fact:${f.id}`),
        freshness: worstFreshness(facts.map((f) => freshnessOf(f.provenance.verifiedAt, "fact", ctx.now))),
        note: "Counts integrations recorded as yes. An integration nobody recorded is not counted as missing.",
      };
    }
    case "tool.rating":
      if (!ctx.input.health.reviews || t.rating === null || t.ratingCount === 0) return { state: "not_recorded" };
      return {
        state: "known",
        value: t.rating,
        display: `${Number(t.rating.toFixed(1))} from ${t.ratingCount} rating${t.ratingCount === 1 ? "" : "s"}`,
        evidence: [`reviews:${t.id}`],
        freshness: "fresh",
      };
    case "tool.rating_count":
      if (!ctx.input.health.reviews) return { state: "not_recorded" };
      return {
        state: "known",
        value: t.ratingCount,
        display: t.ratingCount === 0 ? "No ratings yet" : String(t.ratingCount),
        evidence: t.ratingCount > 0 ? [`reviews:${t.id}`] : listing,
        freshness: "fresh",
      };
  }
  return { state: "not_recorded" };
}

export const ToolComparisonStrategy: ComparisonStrategy = {
  id: "tool",
  dimensions(input: CompareInput) {
    return sortBySection([...TOOL_FIXED, ...factDimensions(input.attributes).filter((d) => d.appliesTo.includes("tool"))]);
  },
  extract: toolExtract,
};
