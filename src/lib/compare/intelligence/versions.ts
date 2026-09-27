/*
  The Compare algorithm registry (D160). Every Compare event written since 4BJ
  records the id that produced the page, so last month's numbers describe the
  system that ran.

  A material change is compare_v2 beside compare_v1, never an edit to v1 that
  makes old events describe something else. The database accepts any
  compare_v<n> in compare_events.algorithm.
*/

export type CompareAlgorithmId = "compare_v1";

export const COMPARE_ALGORITHM: CompareAlgorithmId = "compare_v1";

export const COMPARE_ALGORITHMS: Record<CompareAlgorithmId, { id: CompareAlgorithmId; objective: string; since: string }> = {
  compare_v1: {
    id: "compare_v1",
    objective:
      "Show what actually differs between the chosen tools or models, with evidence, and how each matches a stated goal. Never a winner, never an overall score.",
    since: "2026-09-27",
  },
};
