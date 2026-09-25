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

export async function bump(key: string, by: number, ttlSeconds: number): Promise<number> {
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

  // One round trip, not two (2026-09-25): the first send of every window used
  // to wait on INCRBY and then on a separate EXPIRE, 1.5 to 3 seconds each from
  // a distant client. EXPIRE ... NX sets the TTL only when the counter has none,
  // which is the old rule: otherwise every request pushes the reset time further
  // away and the window never closes.
  const [next] = await r.pipeline().incrby(key, by).expire(key, ttlSeconds, "NX").exec<[number, 0 | 1]>();
  return next;
}

export type LimitVerdict =
  | { allowed: true }
  | { allowed: false; message: string; resetsAt: string };

/*
  Checked before the model is called. Whichever limit is hit first stops the
  request: messages today, tokens today, or tokens this month.
*/
export async function checkLimits(
  subject: string,
  plan: Plan,
  scale = 1,
): Promise<LimitVerdict> {
  const base = PLAN_LIMITS[plan];
  /* `scale` widens the ceilings for a key shared by several people, the per address
     anon key below. The message still quotes the per person number. */
  const limits = {
    messagesPerDay: base.messagesPerDay * scale,
    dailyInputTokens: base.dailyInputTokens * scale,
    dailyOutputTokens: base.dailyOutputTokens * scale,
    monthlyInputTokens: base.monthlyInputTokens * scale,
    monthlyOutputTokens: base.monthlyOutputTokens * scale,
  };
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
            ? `You have used your ${base.messagesPerDay} free questions for today. They reset at midnight. Create an account for ${PLAN_LIMITS.free.messagesPerDay} a day.`
            : `You have used your ${base.messagesPerDay} questions for today. They reset at midnight.`,
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

/*
  The anonymous allowance per address, as a multiple of the per visitor one. Several
  people can share an address (an office, a phone network), so it is wider than one
  visitor's; it exists so that a script which never keeps its cookie still hits a
  ceiling. Somebody who needs more has an account for it.
*/
export const ANON_IP_SCALE = 4;

type LimitSubjects = { subject: string; ipSubject: string | null; plan: Plan };

/* Every key that applies to this caller, checked in turn. The first refusal wins. */
export async function checkIdentityLimits(who: LimitSubjects): Promise<LimitVerdict> {
  const own = await checkLimits(who.subject, who.plan);
  if (!own.allowed || !who.ipSubject) return own;
  return checkLimits(who.ipSubject, who.plan, ANON_IP_SCALE);
}

export async function countIdentityMessage(who: LimitSubjects): Promise<void> {
  await Promise.all([
    countMessage(who.subject),
    who.ipSubject ? countMessage(who.ipSubject) : Promise.resolve(),
  ]);
}

export async function countIdentityTokens(
  who: LimitSubjects,
  input: number,
  output: number,
): Promise<void> {
  await Promise.all([
    countTokens(who.subject, input, output),
    who.ipSubject ? countTokens(who.ipSubject, input, output) : Promise.resolve(),
  ]);
}
