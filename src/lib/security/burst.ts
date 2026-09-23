import "server-only";
import { bump } from "@/lib/ai/ratelimit";
import { clientIp, hashIp } from "@/lib/ai/identity";

/*
  A short window limit for public endpoints that write or query on every call and
  hold no allowance of their own: the analytics beacons, autocomplete, the Compare
  picker and the demo form.

  Keyed on the hashed address (never the raw one, the same rule identity.ts keeps),
  in a fixed one minute window on the Redis counters Ask Celpare already uses.

  IT FAILS OPEN, unlike the AI limiter, which fails closed (D37). That limiter
  guards spend; this one guards against a flood. If Redis cannot be reached, a
  beacon being dropped or an autocomplete being refused would break the page for
  everybody to stop a flood that is not happening, which is the D80 trade: an
  operational switch fails open, and RLS still decides who may write what.
*/

export type BurstName =
  | "beacon"
  | "suggest"
  | "compare_options"
  | "demo"
  | "dm_send";

const PER_MINUTE: Record<BurstName, number> = {
  /* A beacon carries up to 60 events; a busy tab sends a few a minute. */
  beacon: 60,
  /* Debounced keystrokes. A fast typist is about one a second. */
  suggest: 90,
  compare_options: 60,
  /* A person asks for a demo once. */
  demo: 5,
  /* Faster than anybody types, slower than a script flooding a friend (4BA). */
  dm_send: 30,
};

export async function withinBurst(name: BurstName): Promise<boolean> {
  try {
    const who = hashIp(await clientIp());
    const window = Math.floor(Date.now() / 60_000);
    const count = await bump(`burst:${name}:${who}:${window}`, 1, 90);
    return count <= PER_MINUTE[name];
  } catch (err) {
    console.error("[burst] check failed, allowing", err);
    return true;
  }
}
