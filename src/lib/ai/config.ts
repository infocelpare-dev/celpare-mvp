import type { AiFeature, Plan } from "./types";

/*
  Every limit in one file, per D29 and D43.

  The budget is dollars. Token counts are derived at the provider's price. That
  is how the Notion pricing page is actually built, and reading it as fixed
  token constants is what produced the false contradiction recorded as G2 for
  three sessions: the two Research rows are the same $7.00 budget priced at two
  providers, GLM for Celpare v1 and Kimi K3 for v2.

  Celpare v1 is GLM only (D45). The Kimi numbers are not used anywhere.
*/

export type PlanLimits = {
  /* Simple limit a person can act on. "12 messages left" means something,
     "84,000 tokens left" does not. */
  messagesPerDay: number;
  dailyInputTokens: number;
  dailyOutputTokens: number;
  monthlyInputTokens: number;
  monthlyOutputTokens: number;
  maxOutputPerReply: number;
  /* How much conversation history is replayed to the model. */
  historyTurns: number;
  toolSearch: boolean;
  webSearch: boolean;
  researchMode: boolean;
  savesHistory: boolean;
};

/*
  From the GLM5-2 (v1) block of the Notion `Pricing of celpare` page.

  Free:    3,750,000 in and 500,000 out per month, so 125,000 / 16,667 per day.
  Premium: the page calls this "Research ($20)", which is the same plan as
           "USER PREMIUM $19.99". 7,500,000 / 1,000,000 monthly.

  Pro is NOT in the GLM block. Notion only gives Free and Research for GLM, so
  the numbers below are interpolated and are still flagged as G24.

  The first interpolation put Pro at roughly a third of Premium, reasoning from
  the $7.99 to $19.99 price gap, and nobody checked it against Free. A third of
  Premium is BELOW Free, so a paying Pro account had a lower token ceiling than
  a free one and would hit the wall while Free still had headroom. Pro now sits
  at the midpoint between Free and Premium, which is the only shape that cannot
  be wrong in that direction: whatever the real numbers turn out to be, paying
  more must never buy less.

  assertPlanOrder below now enforces that, so the next edit cannot reintroduce
  it quietly.
*/
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  anon: {
    // A tenth of free. Enough to try the product, cheap enough to survive a
    // crawler finding the endpoint.
    messagesPerDay: 5,
    dailyInputTokens: 12_500,
    dailyOutputTokens: 1_667,
    monthlyInputTokens: 375_000,
    monthlyOutputTokens: 50_000,
    maxOutputPerReply: 600,
    historyTurns: 4,
    toolSearch: true,
    webSearch: false,
    researchMode: false,
    savesHistory: false, // D36. Nothing anonymous is ever persisted.
  },
  free: {
    messagesPerDay: 25,
    dailyInputTokens: 125_000,
    dailyOutputTokens: 16_667,
    monthlyInputTokens: 3_750_000,
    monthlyOutputTokens: 500_000,
    maxOutputPerReply: 800,
    historyTurns: 8,
    toolSearch: true,
    // On for free accounts: the founder named the catalogue, the documentation
    // and web search as the three sources, without qualifying by plan. It stays
    // off for anonymous visitors, where the cost is unbounded and the abuse
    // surface is a public endpoint rather than an account.
    webSearch: true,
    researchMode: false,
    savesHistory: true,
  },
  pro: {
    // Interpolated, midway between Free and Premium. Notion has no GLM row for
    // Pro. See G24.
    messagesPerDay: 150,
    dailyInputTokens: 187_500,
    dailyOutputTokens: 25_000,
    monthlyInputTokens: 5_625_000,
    monthlyOutputTokens: 750_000,
    maxOutputPerReply: 1_500,
    historyTurns: 16,
    toolSearch: true,
    webSearch: true,
    researchMode: false,
    savesHistory: true,
  },
  premium: {
    messagesPerDay: 500,
    dailyInputTokens: 250_000,
    dailyOutputTokens: 33_333,
    monthlyInputTokens: 7_500_000,
    monthlyOutputTokens: 1_000_000,
    maxOutputPerReply: 3_000,
    historyTurns: 24,
    toolSearch: true,
    webSearch: true,
    researchMode: true,
    savesHistory: true,
  },
};

/*
  Paying more must never buy less.

  A table of four plans read as four separate blocks is easy to get wrong in one
  direction at a time, which is exactly what happened: Pro was interpolated from
  Premium, in isolation, and landed under Free. Nothing in the code noticed,
  because every individual number looked reasonable.

  So the relationship is checked rather than trusted. It runs once when the
  module loads, throws in development where somebody is there to read it, and
  logs in production, because a limit table that is generous in the wrong place
  is not worth taking the product down over.

  Booleans are checked the same way: a capability granted on a lower plan must
  stay granted on every higher one.
*/
const PLAN_LADDER: Plan[] = ["anon", "free", "pro", "premium"];

const MUST_NOT_DECREASE = [
  "messagesPerDay",
  "dailyInputTokens",
  "dailyOutputTokens",
  "monthlyInputTokens",
  "monthlyOutputTokens",
  "maxOutputPerReply",
  "historyTurns",
] as const;

const MUST_NOT_BE_REVOKED = [
  "toolSearch",
  "webSearch",
  "researchMode",
  "savesHistory",
] as const;

function assertPlanOrder(): void {
  const problems: string[] = [];

  for (let i = 1; i < PLAN_LADDER.length; i += 1) {
    const lower = PLAN_LADDER[i - 1];
    const higher = PLAN_LADDER[i];

    for (const key of MUST_NOT_DECREASE) {
      if (PLAN_LIMITS[higher][key] < PLAN_LIMITS[lower][key]) {
        problems.push(
          `${higher}.${key} (${PLAN_LIMITS[higher][key]}) is lower than ${lower}.${key} (${PLAN_LIMITS[lower][key]})`,
        );
      }
    }

    for (const key of MUST_NOT_BE_REVOKED) {
      if (PLAN_LIMITS[lower][key] && !PLAN_LIMITS[higher][key]) {
        problems.push(`${higher}.${key} is off while ${lower}.${key} is on`);
      }
    }
  }

  if (problems.length === 0) return;

  const message = `[ai] PLAN_LIMITS is not monotonic, so a higher plan buys less than a lower one:\n  ${problems.join("\n  ")}`;

  if (process.env.NODE_ENV === "production") {
    console.error(message);
    return;
  }
  throw new Error(message);
}

assertPlanOrder();

/*
  Per feature tool permissions (D41). Notion is explicit: tool permissions are
  granted per AI feature rather than automatically granting every tool to every
  request. Adding the ninth feature should be a row here and a prompt, not a new
  pipeline.
*/
export type FeatureConfig = {
  label: string;
  canToolSearch: boolean;
  canWebSearch: boolean;
  shipped: boolean;
};

export const FEATURES: Record<AiFeature, FeatureConfig> = {
  ask: { label: "Ask Celpare", canToolSearch: true, canWebSearch: true, shipped: true },
  compare: { label: "Tool Comparison", canToolSearch: true, canWebSearch: false, shipped: false },
  recommend: { label: "Recommendations", canToolSearch: true, canWebSearch: false, shipped: false },
  setup: { label: "Setup Guide", canToolSearch: true, canWebSearch: true, shipped: false },
  learn: { label: "Learning Mode", canToolSearch: true, canWebSearch: true, shipped: false },
  workflow: { label: "Workflow Builder", canToolSearch: true, canWebSearch: false, shipped: false },
  video_search: { label: "Video Search", canToolSearch: true, canWebSearch: false, shipped: false },
  image_search: { label: "Image Search", canToolSearch: false, canWebSearch: false, shipped: false },
};

/* Provider prices per million tokens, used to turn tokens back into dollars for
   ai_usage_records. Configuration, not constants in code, because provider
   pricing changes. Confirm against the real GLM price list when the key
   arrives (G23). */
export const PRICE_PER_M: Record<string, { input: number; output: number }> = {
  // Nemotron 3 Ultra is on OpenRouter's free tier, so the cost column is
  // honestly zero rather than a guess. It is still recorded per request,
  // because a free tier is a rate limit rather than a promise, and the day the
  // model stops being free the usage history is what says what that costs.
  openrouter: { input: 0, output: 0 },
  glm: { input: 0.6, output: 2.2 },
  mock: { input: 0, output: 0 },
};

export const INPUT_MAX_CHARS = 4_000;

/*
  Whether the answering model deliberates before it writes.

  On a reasoning model the thinking is generated first and counts against the
  same output budget, so it costs both time and the room the answer needed.
  Measured on 2026-09-13 against Nemotron 3 Ultra: a normal question took 116
  seconds and came back empty, because the deliberation consumed the cap.

  Off for ordinary answers, on founder instruction to make it quick. A tool
  recommendation is a retrieval problem, and the catalogue rows and web snippets
  are already in the prompt: there is little left to reason about.

  On for deep research, where weighing a dozen sources against each other is the
  entire point of the mode and the person chose to wait for it.
*/
export const ANSWER_THINKING: "off" | "default" = "off";
export const RESEARCH_THINKING: "off" | "default" = "default";

/*
  Deep research (D51). Premium only, per PLAN_LIMITS.researchMode.

  It is a different shape of request, not a longer one: the question is broken
  into several angles, each angle is searched, the results are pooled and
  deduplicated, and the model synthesises over the pile. That costs several
  searches and a much larger prompt, which is why it sits behind the plan that
  pays for it rather than behind a toggle everyone has.
*/
export const RESEARCH_QUERIES = 4;
export const RESEARCH_RESULTS_PER_QUERY = 5;
/* The pooled cap after deduplication. Roughly 12 snippets at 300 characters is
   already a large prompt, and more sources past this point add cost without
   adding much that the first twelve did not say. */
export const RESEARCH_MAX_RESULTS = 12;
/* A deep research answer is allowed the plan ceiling even when the person has
   asked for short answers elsewhere: they asked for this one specifically. The
   ceiling itself is never exceeded. */
export const RESEARCH_USES_FULL_CEILING = true;

/*
  When the catalogue counts as having answered.

  Founder instruction on 2026-09-13: if tool search does not find the
  information, go straight to the web. Zero rows is the obvious case, but one
  weak row is the same situation wearing a card: the question about clipping
  long videos into short ones returned a single video generation model, which is
  not an answer to it. Under two matches, the web is worth one call.
*/
export const MIN_CATALOGUE_MATCH = 2;

/* How many tools a single answer may cite. The founder's Notion note: limit
   token and call. Eight rows of description is already a lot of context. */
export const TOOL_SEARCH_LIMIT = 6;
export const WEB_SEARCH_LIMIT = 5;

/* The sliding window the output filter holds back (D38). Every pattern it
   matches is comfortably shorter than this, so nothing can be split across the
   boundary and escape. */
export const OUTPUT_WINDOW_CHARS = 160;
