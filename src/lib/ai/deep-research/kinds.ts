/*
  What kind of research a question is, and the plan's shape (phase DR, D231).
  Pure, so it is tested without a model.

  choose: which tool or model for a job, or A against B. Answered as a
          comparison report.
  build:  making, setting up or launching an app, site, bot or product.
          Answered as a roadmap: phases, a tool per phase, setup steps, cost.

  The planner model decides first; these rules are its fallback and the check
  on it, because a free model returns unusable JSON often enough (research.ts
  learned that on 2026-09-13).
*/

export type ResearchKind = "choose" | "build";

export type ResearchPlan = {
  kind: ResearchKind;
  queries: string[];
  /* Build only: stack slots, each asked of the catalogue on its own. */
  needs: string[];
};

const BUILD =
  /\b(build(ing)?|make|making|create|creating|set ?up|setting up|launch(ing)?|start(ing)?|develop(ing)?|ship(ping)?)\b[^.?!]{0,60}\b(app|apps|application|website|web ?site|site|web ?app|saas|platform|store|shop|bot|chatbot|startup|product|project|mvp|landing page|portfolio|blog|dashboard|marketplace|game|api)\b/i;
const ROADMAP = /\b(roadmap|tech stack|stack for|step by step|steps to|how (do|can|should) i (build|make|create|set up|launch|start))\b/i;

/* A plain comparison stays "choose" even if the planner says build. */
const COMPARISON = /\b(vs\.?|versus|compare|comparison|better than|alternatives? to|which (one|is better))\b/i;

export function detectKind(question: string): ResearchKind {
  return BUILD.test(question) || ROADMAP.test(question) ? "build" : "choose";
}

/* The slots almost every project has, in build order. A no code builder covers
   several at once; the roadmap prompt says so rather than inventing a slot. */
export const DEFAULT_NEEDS = [
  "design and prototyping",
  "website or app builder or frontend framework",
  "backend and database",
  "authentication and payments",
  "hosting and deployment",
  "AI model or AI features",
];

export function localQueries(question: string, topic: string, kind: ResearchKind): string[] {
  const subject = (topic || question).trim().slice(0, 80);
  if (kind === "build") {
    return [
      `how to build ${subject}`,
      `best tech stack for ${subject}`,
      `${subject} no code vs code`,
      `${subject} cost to run per month`,
    ];
  }
  return [subject, `best ${subject} compared`, `${subject} pricing`, `${subject} limitations drawbacks`];
}

function cleanList(raw: unknown, max: number, len: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of raw) {
    if (typeof q !== "string") continue;
    const v = q.replace(/\s+/g, " ").trim().slice(0, len);
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/*
  The planner's reply, or null when it is unusable. The kind it claims is kept
  only when it agrees with a rule or the rule has nothing to say: "build" from
  the model on a plain comparison would turn a tool question into a roadmap.
*/
export function coercePlan(
  raw: string,
  question: string,
  limits: { queries: number; needs: number },
): ResearchPlan | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const queries = cleanList(parsed.queries, limits.queries, 120);
  if (queries.length === 0) return null;

  const ruled = detectKind(question);
  const claimed = parsed.kind === "build" ? "build" : parsed.kind === "choose" ? "choose" : null;
  const kind: ResearchKind =
    ruled === "build" ? "build" : claimed === "build" && !COMPARISON.test(question) ? "build" : "choose";

  const needs = kind === "build" ? cleanList(parsed.needs, limits.needs, 60) : [];
  return { kind, queries, needs: kind === "build" && needs.length === 0 ? DEFAULT_NEEDS.slice(0, limits.needs) : needs };
}

export function fallbackPlan(question: string, topic: string, limits: { queries: number; needs: number }): ResearchPlan {
  const kind = detectKind(question);
  return {
    kind,
    queries: localQueries(question, topic, kind).slice(0, limits.queries),
    needs: kind === "build" ? DEFAULT_NEEDS.slice(0, limits.needs) : [],
  };
}

/* Skill level for a build roadmap, from the question first, then the role the
   person gave at sign up (phase ONB). */
export type SkillLevel = "no_code" | "beginner" | "developer" | "unknown";

export function skillLevel(question: string, role: string | null): SkillLevel {
  const q = question.toLowerCase();
  if (/\b(can'?t|cannot|don'?t|do not|no) (know how to )?code\b|\bno[- ]code\b|\bnon[- ]technical\b|\bwithout coding\b/.test(q)) return "no_code";
  if (/\b(beginner|new to (coding|programming)|learning to code|just started)\b/.test(q)) return "beginner";
  if (/\b(developer|engineer|i code|typescript|python|react|next\.?js|node|rust|golang|java)\b/.test(q)) return "developer";
  /* Sign up roles (onboarding/options.ts ROLES). Only developer says they code;
     the everyday roles lean to no code; the rest is left to the question. */
  if (role === "developer") return "developer";
  if (role === "student" || role === "hobbyist") return "beginner";
  if (role === "everyday" || role === "business" || role === "marketer" || role === "creator" || role === "curious") return "no_code";
  return "unknown";
}
