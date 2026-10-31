/*
  The declared prior (D225): what somebody told us at sign up, as a starting
  point that hands over to what they actually do.

  Day one, a new account has no likes, saves, searches or views, so every
  engine sees it as cold and ranks for nobody in particular. The answers give
  it a direction. Behaviour is the better evidence, though, so the prior's
  weight falls linearly with the engine's own evidence count and reaches zero
  at FADE_AT. Nothing about the person is guessed: only what they picked.

  Pure and shared, so the feed, Explore and the Tool & Model engine all fade
  the same way and one test covers all three.
*/

export const PRIOR = {
  /* The relevance a declared match is worth at zero evidence, in 0..1. */
  WEIGHT: 0.6,
  /* Evidence at which the prior has fully handed over. */
  FADE_AT: 20,
} as const;

export type DeclaredInterests = {
  categoryIds: string[];
  topicIds: string[];
  toolIds: string[];
  goals: string[];
  role: string | null;
};

export const NO_DECLARED: DeclaredInterests = {
  categoryIds: [],
  topicIds: [],
  toolIds: [],
  goals: [],
  role: null,
};

export function declaredWeight(evidence: number): number {
  if (!(evidence >= 0)) return PRIOR.WEIGHT;
  return PRIOR.WEIGHT * Math.max(0, 1 - evidence / PRIOR.FADE_AT);
}

export function hasDeclared(d: DeclaredInterests | null | undefined): d is DeclaredInterests {
  return !!d && (d.categoryIds.length > 0 || d.topicIds.length > 0 || d.toolIds.length > 0);
}

/* The answers row as my_onboarding() returns it, narrowed to what ranking reads. */
export function declaredFrom(answers: unknown): DeclaredInterests {
  if (!answers || typeof answers !== "object") return NO_DECLARED;
  const a = answers as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    categoryIds: ids(a.category_ids),
    topicIds: ids(a.topic_ids),
    toolIds: ids(a.tool_ids),
    goals: ids(a.goals),
    role: typeof a.role === "string" ? a.role : null,
  };
}
