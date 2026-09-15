import type { SupabaseClient } from "@supabase/supabase-js";
import { models, providerName } from "@/lib/ai/providers";
import {
  ANSWER_THINKING,
  FEATURES,
  MIN_CATALOGUE_MATCH,
  PLAN_LIMITS,
  PRICE_PER_M,
  RESEARCH_MAX_RESULTS,
  RESEARCH_QUERIES,
  RESEARCH_THINKING,
  TOOL_SEARCH_LIMIT,
  WEB_SEARCH_LIMIT,
} from "@/lib/ai/config";

/*
  System health and gateway configuration.

  THE RULE for this whole module: a secret is reported as configured or not
  configured, and never as a value. `configured()` below returns a boolean and
  there is no code path that returns the string it read. Not a prefix, not a
  length, not a masked tail: a four character prefix of an API key is still four
  characters of an API key, and a length narrows which provider issued it.

  Model names, base URLs and price tables are configuration rather than secrets
  and are shown in full, because an AI operations page that cannot say which
  model is answering is not an operations page.
*/

function configured(name: string): boolean {
  return Boolean(process.env[name]);
}

export type HealthState = "healthy" | "degraded" | "down" | "unknown";

export type HealthCheck = {
  key: string;
  label: string;
  state: HealthState;
  detail: string;
  /* Round trip in milliseconds, where the check actually measured something.
     Absent rather than zero when it did not, so nothing reads as instant that
     was never timed. */
  latencyMs?: number;
};

/*
  A real query, not a ping.

  `select count from topics` goes through PostgREST, the connection pooler and
  Postgres, and comes back through RLS. If any of those is unwell this is slow
  or it fails, which is the thing worth knowing. A TCP connect would be green
  while every query timed out.
*/
async function checkDatabase(db: SupabaseClient): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const { error } = await db.from("topics").select("id", { count: "exact", head: true });
    const latencyMs = Date.now() - started;
    if (error) {
      return {
        key: "database",
        label: "Database",
        state: "down",
        detail: `${error.code ?? "error"}: ${error.message}`,
        latencyMs,
      };
    }
    return {
      key: "database",
      label: "Database",
      // A read that takes over a second is not down, and pretending it is fine
      // is how a slow database becomes a mystery outage.
      state: latencyMs > 1500 ? "degraded" : "healthy",
      detail: latencyMs > 1500 ? "Responding slowly" : "Queries responding normally",
      latencyMs,
    };
  } catch (err) {
    return {
      key: "database",
      label: "Database",
      state: "down",
      detail: err instanceof Error ? err.message : "Unreachable",
      latencyMs: Date.now() - started,
    };
  }
}

/*
  The AI provider, judged from its own usage record rather than by calling it.

  A synthetic health check request costs money and tokens on every page load,
  and would be indistinguishable from a real one in the billing record. The last
  hour of ai_usage_records answers the same question for free and answers it
  from production traffic: if real requests are succeeding, the provider is up.
*/
async function checkAiProvider(db: SupabaseClient): Promise<HealthCheck> {
  const provider = providerName();

  if (provider === "mock") {
    return {
      key: "ai",
      label: "AI provider",
      state: "degraded",
      detail: "Running on the mock provider. No real model is answering.",
    };
  }

  const { data, error } = await db.rpc("admin_ai_analytics", { p_days: 1 });
  if (error || !data) {
    return {
      key: "ai",
      label: "AI provider",
      state: "unknown",
      detail: `${provider}: no usage visible to check against`,
    };
  }

  const totals = (data as { totals: Record<string, number> }).totals ?? {};
  const requests = totals.requests ?? 0;
  const failed = totals.failed ?? 0;

  if (requests === 0) {
    return {
      key: "ai",
      label: "AI provider",
      state: "unknown",
      detail: `${provider}: no requests in the last 24 hours`,
    };
  }

  const errorRate = failed / requests;
  return {
    key: "ai",
    label: "AI provider",
    state: errorRate > 0.25 ? "down" : errorRate > 0.05 ? "degraded" : "healthy",
    detail: `${provider}: ${failed} of ${requests} requests failed in 24 hours`,
  };
}

export async function getHealth(db: SupabaseClient): Promise<HealthCheck[]> {
  const [database, ai] = await Promise.all([checkDatabase(db), checkAiProvider(db)]);

  const checks: HealthCheck[] = [
    {
      key: "frontend",
      label: "Frontend",
      // This code is running, so the renderer is up. Saying so is not a
      // tautology worth hiding: it is the one row a reader can calibrate the
      // others against.
      state: "healthy",
      detail: `Next.js rendering, ${process.env.NODE_ENV ?? "unknown"} mode`,
    },
    database,
    ai,
    {
      key: "ratelimit",
      label: "Rate limiting",
      state: configured("UPSTASH_REDIS_REST_URL") && configured("UPSTASH_REDIS_REST_TOKEN")
        ? "healthy"
        : "degraded",
      detail: configured("UPSTASH_REDIS_REST_URL")
        ? "Upstash Redis configured"
        : "No Upstash keys. Limits fall back to a per process counter that does not survive a restart.",
    },
    {
      key: "usage",
      label: "Usage recording",
      state: configured("SUPABASE_SERVICE_ROLE_KEY") ? "healthy" : "degraded",
      detail: configured("SUPABASE_SERVICE_ROLE_KEY")
        ? "AI usage and security events are being persisted"
        : "No service role key. Limits still apply, but the billing and security trail is not written.",
    },
    {
      key: "search",
      label: "Tool search",
      // Postgres full text over the catalogue. It is up whenever the database
      // is, because it is the same database.
      state: database.state,
      detail: "Postgres full text search over the tool catalogue",
    },
    {
      key: "websearch",
      label: "Web search",
      state: configured("SERPER_API_KEY") ? "healthy" : "degraded",
      detail: configured("SERPER_API_KEY")
        ? "Serper configured"
        : "No Serper key. Answers fall back to the catalogue alone.",
    },
    {
      key: "captcha",
      label: "Captcha",
      state: configured("NEXT_PUBLIC_TURNSTILE_SITE_KEY") ? "healthy" : "degraded",
      detail: configured("NEXT_PUBLIC_TURNSTILE_SITE_KEY")
        ? "Turnstile site key present"
        : "No Turnstile site key. Sign in fails if Supabase captcha protection is on.",
    },
    {
      key: "storage",
      label: "Storage",
      state: database.state,
      detail: "Supabase Storage, avatars bucket",
    },
  ];

  return checks;
}

/* ------------------------------------------------------ gateway snapshot */

export type GatewaySnapshot = {
  provider: string;
  answeringModel: string;
  classifierModel: string;
  baseUrl: string | null;
  keyConfigured: boolean;
  /* Every provider the code can select, and whether it could be selected right
     now. This is the fallback story: nothing routes automatically today, so it
     is stated as what is available rather than as a chain that exists. */
  available: { name: string; configured: boolean; selected: boolean }[];
  answerThinking: string;
  researchThinking: string;
  toolSearchLimit: number;
  webSearchLimit: number;
  minCatalogueMatch: number;
  researchQueries: number;
  researchMaxResults: number;
  prices: { provider: string; input: number; output: number }[];
  features: { key: string; label: string; shipped: boolean; toolSearch: boolean; webSearch: boolean }[];
  planLimits: {
    plan: string;
    messagesPerDay: number;
    dailyInputTokens: number;
    dailyOutputTokens: number;
    monthlyInputTokens: number;
    monthlyOutputTokens: number;
    maxOutputPerReply: number;
    webSearch: boolean;
    researchMode: boolean;
  }[];
};

export function getGatewaySnapshot(): GatewaySnapshot {
  const provider = providerName();
  const m = models();

  const baseUrl =
    provider === "openrouter"
      ? (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1")
      : provider === "glm"
        ? (process.env.GLM_BASE_URL ?? null)
        : null;

  return {
    provider,
    answeringModel: m.main,
    classifierModel: m.fast,
    baseUrl,
    keyConfigured:
      provider === "openrouter"
        ? configured("OPENROUTER_API_KEY")
        : provider === "glm"
          ? configured("GLM_API_KEY")
          : true,
    available: [
      {
        name: "openrouter",
        configured: configured("OPENROUTER_API_KEY"),
        selected: provider === "openrouter",
      },
      {
        name: "glm",
        configured: configured("GLM_API_KEY") && configured("GLM_MODEL"),
        selected: provider === "glm",
      },
      { name: "mock", configured: true, selected: provider === "mock" },
    ],
    answerThinking: ANSWER_THINKING,
    researchThinking: RESEARCH_THINKING,
    toolSearchLimit: TOOL_SEARCH_LIMIT,
    webSearchLimit: WEB_SEARCH_LIMIT,
    minCatalogueMatch: MIN_CATALOGUE_MATCH,
    researchQueries: RESEARCH_QUERIES,
    researchMaxResults: RESEARCH_MAX_RESULTS,
    prices: Object.entries(PRICE_PER_M).map(([name, p]) => ({
      provider: name,
      input: p.input,
      output: p.output,
    })),
    features: Object.entries(FEATURES).map(([key, f]) => ({
      key,
      label: f.label,
      shipped: f.shipped,
      toolSearch: f.canToolSearch,
      webSearch: f.canWebSearch,
    })),
    planLimits: Object.entries(PLAN_LIMITS).map(([plan, l]) => ({
      plan,
      messagesPerDay: l.messagesPerDay,
      dailyInputTokens: l.dailyInputTokens,
      dailyOutputTokens: l.dailyOutputTokens,
      monthlyInputTokens: l.monthlyInputTokens,
      monthlyOutputTokens: l.monthlyOutputTokens,
      maxOutputPerReply: l.maxOutputPerReply,
      webSearch: l.webSearch,
      researchMode: l.researchMode,
    })),
  };
}
