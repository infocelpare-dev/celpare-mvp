import "server-only";
import { bump } from "@/lib/ai/ratelimit";
import { clientIp, hashIp } from "@/lib/ai/identity";
import type { VoiceConfig } from "./config";
import type { LimitVerdict } from "./handler";

/*
  Voice search limits on the Redis counters Ask Celpare already uses (D37).

  FAILS CLOSED, like the AI limiter and unlike the burst limiter: every call
  here costs money, so a limiter that cannot count refuses rather than waving
  requests through. Per user per minute and per day, and per address per
  minute so one network cannot spread a flood across many accounts.
*/

export async function voiceLimit(userId: string, config: VoiceConfig): Promise<LimitVerdict> {
  try {
    const minute = Math.floor(Date.now() / 60_000);
    const day = Math.floor(Date.now() / 86_400_000);
    const ip = hashIp(await clientIp());
    const [m, d, a] = await Promise.all([
      bump(`voice:u:${userId}:m${minute}`, 1, 90),
      bump(`voice:u:${userId}:d${day}`, 1, 90_000),
      bump(`voice:ip:${ip}:m${minute}`, 1, 90),
    ]);
    if (m > config.perMinute) return { ok: false, scope: "minute" };
    if (d > config.perDay) return { ok: false, scope: "day" };
    if (a > config.perMinute * 3) return { ok: false, scope: "ip" };
    return { ok: true };
  } catch (err) {
    console.error("[voice] limit check failed, refusing", err instanceof Error ? err.name : "error");
    return { ok: false, scope: "minute" };
  }
}
