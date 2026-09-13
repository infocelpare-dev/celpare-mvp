import { createOpenAiCompatibleProvider } from "./openai-compatible";

/*
  OpenRouter, the provider for Celpare v1 (D34, revised 2026-09-13).

  One key reaches every model, which is what makes the routing policy in
  06-ai-gateway.md practical: a cheap model for the scope classifier and a
  strong one for the answer, without a second account.
*/
export const openrouterProvider = createOpenAiCompatibleProvider({
  name: "openrouter",
  baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  apiKey: () => process.env.OPENROUTER_API_KEY,
  extraHeaders: {
    // OpenRouter uses these for attribution. Harmless, and it makes the usage
    // dashboard readable when several projects share one key.
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    "X-Title": "Celpare",
  },
  requestUsageInStream: true,
});

export function isOpenRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
