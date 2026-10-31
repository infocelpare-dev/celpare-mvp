/*
  The questions asked after sign up (phase ONB, guide 22, D224).

  These lists are the allowlist. The database CHECKs in user_onboarding hold
  the same keys, so a value that is not here is refused twice: by zod in the
  action and by Postgres. Adding a choice means adding it in both places.

  Labels are what people see; keys are what is stored and counted. A label can
  be reworded freely. A key cannot be renamed without a migration, because the
  admin counts group by it.
*/

export type Choice<K extends string = string> = { key: K; label: string };

export const ROLES = [
  { key: "everyday", label: "Everyday AI user" },
  { key: "professional", label: "Professional" },
  { key: "student", label: "Student" },
  { key: "creator", label: "Creator" },
  { key: "developer", label: "Developer" },
  { key: "designer", label: "Designer" },
  { key: "marketer", label: "Marketer" },
  { key: "researcher", label: "Researcher" },
  { key: "founder", label: "Founder" },
  { key: "business", label: "Business or team" },
  { key: "hobbyist", label: "Hobbyist" },
  { key: "curious", label: "Just curious" },
] as const satisfies readonly Choice[];

export const GOALS = [
  { key: "find_tool", label: "Find the right AI tool" },
  { key: "compare", label: "Compare tools and models" },
  { key: "learn", label: "Learn about AI" },
  { key: "build", label: "Build with AI" },
  { key: "share", label: "Share my work" },
  { key: "news", label: "Keep up with AI news" },
] as const satisfies readonly Choice[];

export const HEARD_FROM = [
  { key: "x", label: "X (Twitter)" },
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "facebook", label: "Facebook" },
  { key: "reddit", label: "Reddit" },
  { key: "google", label: "Google search" },
  { key: "ai_assistant", label: "ChatGPT or another AI" },
  { key: "product_hunt", label: "Product Hunt" },
  { key: "friend", label: "A friend or colleague" },
  { key: "newsletter", label: "A newsletter or blog" },
  { key: "other", label: "Somewhere else" },
] as const satisfies readonly Choice[];

export type RoleKey = (typeof ROLES)[number]["key"];
export type GoalKey = (typeof GOALS)[number]["key"];
export type HeardKey = (typeof HEARD_FROM)[number]["key"];

export const STEPS = ["role", "goals", "interests", "tools", "heard", "people"] as const;
export type StepKey = (typeof STEPS)[number];

export const ROLE_KEYS = ROLES.map((r) => r.key) as [RoleKey, ...RoleKey[]];
export const GOAL_KEYS = GOALS.map((g) => g.key) as [GoalKey, ...GoalKey[]];
export const HEARD_KEYS = HEARD_FROM.map((h) => h.key) as [HeardKey, ...HeardKey[]];

/* The database caps, repeated so the UI can stop before Postgres refuses. */
export const LIMITS = {
  CATEGORIES: 20,
  TOPICS: 20,
  TOOLS: 30,
  HEARD_OTHER: 60,
  /* People suggested on the last step. */
  PEOPLE: 8,
  /* Interests worth nudging towards, not enforced. */
  SUGGESTED_INTERESTS: 3,
} as const;

/* The campaign tag: `?ref=` or `?utm_source=` on any landing link, first touch. */
export const REF_COOKIE = "celpare_ref";
export const REF_MAX_AGE = 30 * 24 * 3600;

export function cleanRef(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  return v.length > 0 ? v : null;
}

export function labelOf(list: readonly Choice[], key: string | null | undefined): string {
  return list.find((c) => c.key === key)?.label ?? key ?? "";
}
