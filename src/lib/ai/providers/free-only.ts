/*
  Free models only (AI.2, D229). Celpare has no revenue yet, so OpenRouter is
  allowed to call free models and nothing else (founder 2026-11-04). A paid
  slug in OPENROUTER_MODEL or OPENROUTER_MODEL_FAST is refused before any
  request leaves the server, so a wrong setting shows as an error, never as a
  bill. OPENROUTER_ALLOW_PAID=on is the one way to lift it.

  Pure, so it is tested without a network. The message carries no retry words
  (see RETRY_TEXT in openai-compatible.ts), so a refusal fails at once.
*/

/* OpenRouter marks free variants with a ":free" suffix; openrouter/free is its free router. */
export function isFreeModel(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const s = slug.trim().toLowerCase();
  return s.endsWith(":free") || s === "openrouter/free";
}

export function paidAllowed(env: Record<string, string | undefined>): boolean {
  return env.OPENROUTER_ALLOW_PAID?.trim().toLowerCase() === "on";
}

/* Null when the model may be called; otherwise why it may not. */
export function paidModelRefusal(
  slug: string | null | undefined,
  env: Record<string, string | undefined>,
): string | null {
  if (isFreeModel(slug) || paidAllowed(env)) return null;
  return `Refused model "${slug ?? ""}": only free OpenRouter models are allowed (set OPENROUTER_ALLOW_PAID=on to change that).`;
}
