import type { ExtractContext } from "./strategies/shared";
import type { ComparisonStrategy } from "./strategies/index";
import type { CompareInput, ComparisonDimension, ComparisonEntity, ComparisonMatrix, ComparisonValue, DataIssue, KnownValue } from "./types";

/*
  The normalised comparison matrix (guide 16 section 13): values[dimension][entity].
  The one foundation for the page, differences, fit, the summary and any later ML.

  A goal or weights never reach this function, so the matrix is the same with or
  without them (D169, tested).

  Dimensions with no known value for anybody are kept: "nobody in this set has
  this recorded" is information, and the page decides whether to draw it.
*/

export function buildMatrix(
  strategy: ComparisonStrategy,
  entities: ComparisonEntity[],
  input: CompareInput,
  issues: DataIssue[],
): ComparisonMatrix {
  const ctx: ExtractContext = { input, now: input.now, issues };
  const dimensions: ComparisonDimension[] = strategy.dimensions(input);

  if (!input.health.facts) {
    issues.push({ code: "read_failed", message: "Recorded facts could not be read just now. Capability, privacy and technical rows show as not recorded.", visibility: "public" });
  }
  if (!input.health.performance) {
    issues.push({ code: "read_failed", message: "Performance measurements could not be read just now.", visibility: "public" });
  }

  const values: ComparisonValue[][] = dimensions.map((dim) =>
    entities.map((e) => {
      if (dim.factKey && !input.health.facts) return { state: "not_recorded" } as const;
      return strategy.extract(dim, e, ctx);
    }),
  );
  const coverage = values.map((row) => row.filter((v) => v.state === "known").length);
  return { entities, dimensions, values, coverage };
}

export function known(v: ComparisonValue): v is KnownValue {
  return v.state === "known";
}

export function numeric(v: ComparisonValue): v is KnownValue & { value: number } {
  return v.state === "known" && typeof v.value === "number" && Number.isFinite(v.value);
}

export function rowOf(matrix: ComparisonMatrix, dimensionId: string): { dim: ComparisonDimension; values: ComparisonValue[] } | null {
  const i = matrix.dimensions.findIndex((d) => d.id === dimensionId);
  return i === -1 ? null : { dim: matrix.dimensions[i], values: matrix.values[i] };
}
