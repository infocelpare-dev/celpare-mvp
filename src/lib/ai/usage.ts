import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { PRICE_PER_M } from "./config";
import type { AiFeature, Plan } from "./types";

/*
  The durable usage record.

  Redis holds the live counters and enforces the limits. This is the billing and
  audit trail, and Phase 7 charges from it. They are separate on purpose: Redis
  is a cache that can be lost or flushed, and losing a month of billing data
  because a cache evicted is not a recoverable mistake.

  If the service role key is not set this degrades to a log line rather than
  failing the request. Limits are still enforced, because that happens in Redis.
  What is lost is the audit trail, which is worth a warning and not worth
  refusing a person their answer over.
*/

export type UsageRecord = {
  userId: string | null;
  anonHash: string | null;
  plan: Plan;
  feature: AiFeature;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  status: "ok" | "refused_scope" | "rate_limited" | "filtered" | "error";
  /*
    What the answer cost besides tokens. A deep research turn pays for four
    search calls before the model writes a word, and without this the spend is
    invisible in the billing record.
  */
  toolSearch?: boolean;
  webSearch?: boolean;
  deepResearch?: boolean;
  searchCalls?: number;
};

function costUsd(provider: string, input: number, output: number): number {
  const price = PRICE_PER_M[provider];
  if (!price) return 0;
  return (input / 1_000_000) * price.input + (output / 1_000_000) * price.output;
}

export async function recordUsage(record: UsageRecord): Promise<void> {
  if (!hasServiceRole()) {
    console.warn(
      `[ai] usage not persisted (${record.status}, ${record.inputTokens} in, ${record.outputTokens} out). Set SUPABASE_SERVICE_ROLE_KEY to keep the billing record.`,
    );
    return;
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("ai_usage_records").insert({
      user_id: record.userId,
      anon_hash: record.anonHash,
      plan: record.plan,
      feature: record.feature,
      provider: record.provider,
      model: record.model,
      input_tokens: record.inputTokens,
      output_tokens: record.outputTokens,
      cost_usd: costUsd(record.provider, record.inputTokens, record.outputTokens),
      latency_ms: record.latencyMs,
      status: record.status,
      tool_search: record.toolSearch ?? false,
      web_search: record.webSearch ?? false,
      deep_research: record.deepResearch ?? false,
      search_calls: record.searchCalls ?? 0,
    });

    if (error) console.error("[ai] usage insert failed", error.code, error.message);
  } catch (err) {
    console.error("[ai] usage insert threw", err);
  }
}

/*
  Rough token estimate, used when a provider does not report usage on a streamed
  response. Four characters per token is the usual approximation for English and
  is wrong for code and for non Latin scripts, so it is deliberately only a
  fallback: any provider that reports real numbers is believed instead.
*/
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
