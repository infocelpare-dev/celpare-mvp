import type { AiProvider } from "../types";
import { glmProvider, isGlmConfigured } from "./glm";
import { isOpenRouterConfigured, openrouterProvider } from "./openrouter";
import { mockProvider } from "./mock";
import type { StreamUsage } from "./openai-compatible";

/*
  Provider selection. The only place in the codebase that decides which model
  answers, which is what keeps D4 and D34 true: the choice is an env var.

  Default is openrouter when a key is present, else mock. The fallback is
  deliberate and only applies when nothing is configured: an explicit
  AI_PROVIDER that cannot work fails loudly instead, because a production deploy
  quietly answering from the mock would be worse than an error.
*/

type Provider = AiProvider & { lastStreamUsage?: () => StreamUsage | null };

export function providerName(): string {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit) return explicit;
  if (isOpenRouterConfigured()) return "openrouter";
  return "mock";
}

export function getProvider(): Provider {
  const choice = providerName();

  if (choice === "openrouter") {
    if (!isOpenRouterConfigured()) {
      throw new Error("AI_PROVIDER=openrouter but OPENROUTER_API_KEY is missing.");
    }
    return openrouterProvider;
  }

  if (choice === "glm") {
    if (!isGlmConfigured()) {
      throw new Error("AI_PROVIDER=glm but GLM_API_KEY or GLM_MODEL is missing.");
    }
    return glmProvider;
  }

  return mockProvider;
}

/*
  Two models, not one.

  main: the answering model. Nemotron 3 Ultra, a 550B reasoning model, chosen by
  the founder. Slow and strong.

  fast: the scope classifier. It runs only on the ambiguous middle, because
  classify.ts settles the clear cases locally with no model call, so it is not
  on the hot path for most messages.
*/
export function models() {
  const choice = providerName();

  if (choice === "openrouter") {
    const main = process.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b:free";
    /*
      fast defaults to main, which looks wrong and is not.

      Every small free model on OpenRouter was tested against the classifier
      prompt on 2026-09-13: nemotron-3.5-lightning returned gibberish, gemma-4
      was rate limited upstream, lfm-2.5 returned no content. Nemotron 3 Ultra
      answered with clean JSON first time. A cheap model that is wrong is more
      expensive than an expensive model that is right.

      It only matters for the ambiguous middle anyway: classify.ts decides the
      clear cases locally with no model call at all. Point this at a small paid
      model whenever there is a budget for one.
    */
    return {
      main,
      fast: process.env.OPENROUTER_MODEL_FAST ?? main,
    };
  }

  if (choice === "glm") {
    return {
      main: process.env.GLM_MODEL!,
      fast: process.env.GLM_MODEL_FAST ?? process.env.GLM_MODEL!,
    };
  }

  return { main: "mock-main", fast: "mock-fast" };
}
