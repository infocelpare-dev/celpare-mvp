import "server-only";
import { headers } from "next/headers";
import { after } from "next/server";
import { TRUSTED_HEADER, clientIpFrom } from "@/lib/edge/origin";
import {
  STATSIG_EVENTS_URL,
  buildUser,
  cleanCountry,
  cleanMetadata,
  tierFor,
  utcDay,
  visitorId,
  type EventName,
  type StatsigEvent,
} from "./core";

/*
  Sending to Statsig (D264). Off unless STATSIG_SERVER_SECRET is set, so local
  development and previews send nothing unless someone means them to.

  Telemetry never fails or slows the request it describes: every send runs in
  after(), has a timeout, and swallows its own errors after logging them, the
  same rule src/lib/telemetry.ts keeps.
*/

export function statsigOn(): boolean {
  return Boolean(process.env.STATSIG_SERVER_SECRET);
}

function idSecret(): string {
  return process.env.CELPARE_SECRET || process.env.STATSIG_SERVER_SECRET || "";
}

export async function sendEvents(events: StatsigEvent[]): Promise<void> {
  const key = process.env.STATSIG_SERVER_SECRET;
  if (!key || events.length === 0) return;
  try {
    const res = await fetch(STATSIG_EVENTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "statsig-api-key": key },
      body: JSON.stringify({
        events,
        statsigMetadata: { sdkType: "celpare-http", sdkVersion: "1" },
      }),
      signal: AbortSignal.timeout(4_000),
      cache: "no-store",
    });
    if (!res.ok) console.error("[statsig] log_event refused", res.status);
  } catch (err) {
    console.error("[statsig] log_event failed", err instanceof Error ? err.message : err);
  }
}

/*
  Who and where, from the request. Behind Cloudflare (the trusted mark set in
  proxy.ts) cf-ipcountry is the visitor's country; Vercel's own header would be
  the Cloudflare edge's. The address is used for the daily id and then dropped.
*/
export function visitorFrom(h: Headers, now = new Date()) {
  const trusted = h.get(TRUSTED_HEADER) === "1";
  const userAgent = h.get("user-agent");
  const country = cleanCountry((trusted ? h.get("cf-ipcountry") : null) ?? h.get("x-vercel-ip-country"));
  const visitor = visitorId(idSecret(), utcDay(now), clientIpFrom(h), userAgent);
  return { userAgent, country, visitor };
}

export function buildEvent(
  h: Headers,
  name: EventName,
  opts: { userId: string | null; value?: number | string; metadata?: Record<string, string | number | boolean | null | undefined> },
): StatsigEvent {
  const now = new Date();
  const v = visitorFrom(h, now);
  const metadata = cleanMetadata(opts.metadata);
  return {
    eventName: name,
    user: buildUser({
      userId: opts.userId,
      visitor: v.visitor,
      country: v.country,
      userAgent: v.userAgent,
      tier: tierFor(process.env.VERCEL_ENV),
    }),
    time: now.getTime(),
    ...(opts.value !== undefined ? { value: opts.value } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

/*
  One product event from a server action or route handler. Never throws and
  never waits: the send is scheduled after the response.
*/
export async function track(
  name: EventName,
  opts: { userId: string | null; value?: number | string; metadata?: Record<string, string | number | boolean | null | undefined> },
): Promise<void> {
  if (!statsigOn()) return;
  try {
    const event = buildEvent(await headers(), name, opts);
    after(() => sendEvents([event]));
  } catch (err) {
    console.error("[statsig] track failed", name, err instanceof Error ? err.message : err);
  }
}

/*
  An event about a person that did not come from their browser: a payment
  webhook is sent by NOWPayments, so the request's address and country are
  theirs, not the customer's. The account id is the only identity, and the
  country is the one the customer gave at checkout. Call it inside after().
*/
export async function trackAccount(
  name: EventName,
  opts: { userId: string; country?: string | null; value?: number | string; metadata?: Record<string, string | number | boolean | null | undefined> },
): Promise<void> {
  if (!statsigOn()) return;
  const metadata = cleanMetadata(opts.metadata);
  await sendEvents([
    {
      eventName: name,
      user: buildUser({
        userId: opts.userId,
        visitor: opts.userId,
        country: cleanCountry(opts.country),
        tier: tierFor(process.env.VERCEL_ENV),
      }),
      time: Date.now(),
      ...(opts.value !== undefined ? { value: opts.value } : {}),
      ...(metadata ? { metadata } : {}),
    },
  ]);
}
