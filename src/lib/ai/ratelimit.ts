import { Redis } from "@upstash/redis";
import { PLAN_LIMITS } from "./config";
import type { Plan } from "./types";

/*
  Limits live in Upstash Redis (D37), which is what Notion specified all along.

  Windows are keyed by date rather than by a sliding counter, because the
  product promise is "you hit the limit, it resets at midnight". A date keyed
  counter with a TTL to midnight gives exactly that, needs no reset job, and is
  something a person can predict. A rolling 24 hour window would technically be
  fairer and would be impossible to explain.

  Reset is at UTC midnight. G27 asks whether it should follow the founder's
  local time instead, which matters because "resets at midnight" reads as your
  midnight to whoever is waiting.
*/

let client: Redis | null = null;
let warned = false;

/* Per process fallback for local development before the Upstash keys are in
   .env.local. It is still a limit, just one that does not survive a restart and
   is not shared between instances. It is never a way of allowing the request
   through: that distinction is the whole point. */
const memory = new Map<string, { value: number; expires: number }>();

function redis(): Redis | null {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warned) {
      console.warn(
        "[ai] Upstash is not configured. Falling back to a per process limiter, which does not survive a restart. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      );
      warned = true;
    }
    return null;
  }
  client = new Redis({ url, token });
  return client;
}

function secondsUntilUtcMidnight(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
}

function secondsUntilMonthEnd(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
}

export function nextResetIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();
}

function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
function monthKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

async function readCounter(key: string): Promise<number> {
  const r = redis();
  if (!r) {
    const hit = memory.get(key);
    if (!hit || hit.expires < Date.now()) return 0;
    return hit.value;
  }
  const value = await r.get<number>(key);
  return value ?? 0;
}

async function bump(key: string, by: number, ttlSeconds: number): Promise<number> {
  const r = redis();
  if (!r) {
    const hit = memory.get(key);
    const expired = !hit || hit.expires < Date.now();
    const next = (expired ? 0 : hit!.value) + by;
    memory.set(key, {
      value: next,
      expires: expired ? Date.now() + ttlSeconds * 1000 : hit!.expires,
    });
    return next;
  }

  const next = await r.incrby(key, by);
  // Only set the TTL when the counter is newly created, otherwise every request
  // pushes the reset time further away and the window never closes.
  if (next === by) await r.expire(key, ttlSeconds);
  return next;
}

export type LimitVerdict =
  | { allowed: true }
  | { allowed: false; message: string; resetsAt: string };

/*
  Checked before the model is called. Whichever limit is hit first stops the
  request: messages today, tokens today, or tokens this month.
*/
export async function checkLimits(subject: string, plan: Plan): Promise<LimitVerdict> {
  const limits = PLAN_LIMITS[plan];
  const day = dayKey();
  const month = monthKey();
  const resetsAt = nextResetIso();

  try {
    const [messages, inToday, outToday, inMonth, outMonth] = await Promise.all([
      readCounter(`ai:msg:${subject}:${day}`),
      readCounter(`ai:tin:${subject}:${day}`),
      readCounter(`ai:tout:${subject}:${day}`),
      readCounter(`ai:tin:${subject}:${month}`),
      readCounter(`ai:tout:${subject}:${month}`),
    ]);

    if (messages >= limits.messagesPerDay) {
      return {
        allowed: false,
        resetsAt,
        message:
          plan === "anon"
            ? `You have used your ${limits.messagesPerDay} free questions for today. They reset at midnight. Create an account for ${PLAN_LIMITS.free.messagesPerDay} a day.`
            : `You have used your ${limits.messagesPerDay} questions for today. They reset at midnight.`,
      };
    }

    if (inToday >= limits.dailyInputTokens || outToday >= limits.dailyOutputTokens) {
      return {
        allowed: false,
        resetsAt,
        message: "You have used your AI allowance for today. It resets at midnight.",
      };
    }

    if (inMonth >= limits.monthlyInputTokens || outMonth >= limits.monthlyOutputTokens) {
      return {
        allowed: false,
        resetsAt,
        message: "You have used your AI allowance for this month.",
      };
    }

    return { allowed: true };
  } catch (err) {
    /*
      Fail closed. A limiter that lets requests through when it cannot check
      them is not a limiter, it is a bill. If Redis is down, this is the one
      place where refusing a real person is the correct trade.
    */
    console.error("[ai] limit check failed, refusing", err);
    return {
      allowed: false,
      resetsAt,
      message: "Ask Celpare is briefly unavailable. Try again in a minute.",
    };
  }
}

/* Counted when a request is accepted, before the answer is produced, so a
   person cannot dodge the message cap by abandoning streams. */
export async function countMessage(subject: string): Promise<void> {
  try {
    await bump(`ai:msg:${subject}:${dayKey()}`, 1, secondsUntilUtcMidnight());
  } catch (err) {
    console.error("[ai] failed to count message", err);
  }
}

/* Counted after the answer, when the real numbers are known. */
export async function countTokens(subject: string, input: number, output: number): Promise<void> {
  const day = dayKey();
  const month = monthKey();
  const dayTtl = secondsUntilUtcMidnight();
  const monthTtl = secondsUntilMonthEnd();

  try {
    await Promise.all([
      bump(`ai:tin:${subject}:${day}`, input, dayTtl),
      bump(`ai:tout:${subject}:${day}`, output, dayTtl),
      bump(`ai:tin:${subject}:${month}`, input, monthTtl),
      bump(`ai:tout:${subject}:${month}`, output, monthTtl),
    ]);
  } catch (err) {
    console.error("[ai] failed to count tokens", err);
  }
}
