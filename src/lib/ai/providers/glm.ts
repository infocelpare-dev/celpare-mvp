import { createOpenAiCompatibleProvider } from "./openai-compatible";

/*
  GLM direct, kept as a second adapter.

  Not the default any more: the founder supplied an OpenRouter key instead, and
  OpenRouter reaches GLM too. This exists so the abstraction is demonstrably an
  abstraction rather than one provider with extra steps, and so a direct
  account can be swapped in with one env var if OpenRouter ever gets in the way.
*/
export const glmProvider = createOpenAiCompatibleProvider({
  name: "glm",
  baseUrl: process.env.GLM_BASE_URL ?? "https://api.z.ai/api/paas/v4",
  apiKey: () => process.env.GLM_API_KEY,
});

export function isGlmConfigured() {
  return Boolean(process.env.GLM_API_KEY && process.env.GLM_MODEL);
}
