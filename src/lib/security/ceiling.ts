import "server-only";
import { bump } from "@/lib/ai/ratelimit";
import { ceilingFor, type CeilingName } from "./ceiling-config";

/*
  The global daily ceiling (see ceiling-config.ts for why). One counter per
  feature per UTC day, on the same Upstash counters as the other limits.

  Counts the attempt, then compares, so two requests racing at the line cannot
  both pass it.

  FAILS CLOSED, like the AI and voice limiters and unlike burst.ts: these guard
  spend. If Redis cannot be reached the paid call is refused.
*/
export async function withinCeiling(name: CeilingName): Promise<boolean> {
  try {
    const limit = ceilingFor(name, process.env);
    if (limit <= 0) return false;
    const day = new Date().toISOString().slice(0, 10);
    const count = await bump(`ceiling:${name}:${day}`, 1, 90_000);
    if (count > limit) {
      /* Logged only on the first refusal of the day, so a flood does not
         become a flood of log lines too. */
      if (count === limit + 1) console.error(`[ceiling] ${name} reached ${limit} today, refusing until UTC midnight`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[ceiling] ${name} check failed, refusing`, err instanceof Error ? err.name : "error");
    return false;
  }
}
