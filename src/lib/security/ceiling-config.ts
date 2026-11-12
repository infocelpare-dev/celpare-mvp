/*
  Daily ceilings across EVERYBODY, for the calls that cost money or a shared
  quota (founder, 2026-11-12, after Statsig showed 27 visitors become 100 in a
  minute).

  The per person limits (ratelimit.ts, voice/limit.ts) stop one visitor. They
  do not stop a thousand: every new address or new account gets its own
  allowance, so the total is unbounded. These ceilings bound the total. When
  one is reached the feature stops for everybody until UTC midnight, which is
  the trade: a few real people refused on a bad night, never a bill.

  Pure and import free so it is tested without Redis. Each number can be moved
  with an environment variable (CEILING_<NAME>_PER_DAY) without a deploy of
  new code; a missing, empty or non numeric value keeps the default, and 0 is
  a valid value that turns the feature off.
*/

export type CeilingName = "ai_message" | "web_search" | "voice";

export const CEILING_DEFAULTS: Record<CeilingName, number> = {
  /* Ask Celpare answers. The models are free (D229), but OpenRouter's free
     tier has its own daily quota, and every answer is a long Vercel function. */
  ai_message: 2_000,
  /* Serper queries, paid per call. One question can make a few (deep research). */
  web_search: 600,
  /* Google Speech-to-Text clips, paid per second. */
  voice: 400,
};

export function ceilingEnvName(name: CeilingName): string {
  return `CEILING_${name.toUpperCase()}_PER_DAY`;
}

export function ceilingFor(
  name: CeilingName,
  env: Record<string, string | undefined>,
): number {
  const raw = env[ceilingEnvName(name)]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return CEILING_DEFAULTS[name];
  return Number(raw);
}
