import { CONCEPTS, conceptDimensions, factDimensions, sortBySection } from "../dimensions";
import type { CompareInput, ComparisonDimension, ComparisonEntity, ComparisonValue } from "../types";
import { factValue, type ComparisonStrategy, type ExtractContext } from "./shared";

/*
  Tools and models together (D162). Only dimensions that mean the same thing for
  both: the attributes the vocabulary applies to both (deployment, privacy,
  technical, the fit_* use cases) and the shared concepts where the two
  vocabularies name one capability differently. Prices never appear: a monthly
  plan and a token price are not the same unit (D165), and there is no honest way
  to put them on one axis.
*/

export function mixedExtract(dim: ComparisonDimension, entity: ComparisonEntity, ctx: ExtractContext): ComparisonValue {
  const concept = CONCEPTS.find((c) => c.id === dim.id);
  if (concept) return factValue(entity, entity.type === "tool" ? concept.tool : concept.model, "flag", ctx.now);
  if (dim.factKey && dim.appliesTo.includes(entity.type)) return factValue(entity, dim.factKey, dim.kind, ctx.now);
  return { state: "not_applicable" };
}

export const MixedComparisonStrategy: ComparisonStrategy = {
  id: "mixed",
  dimensions(input: CompareInput) {
    return sortBySection([...conceptDimensions(), ...factDimensions(input.attributes).filter((d) => d.comparableAcross)]);
  },
  extract: mixedExtract,
};
