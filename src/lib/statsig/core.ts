import { createHmac } from "node:crypto";

/*
  Statsig, server side only (phase STAT, D264). Pure: no network, no Next, no
  env reads, so the tests can pin every rule.

  WHY SERVER SIDE. The Cookie Policy says there are no analytics cookies and so
  no banner. Statsig's browser SDK stores a stable id in localStorage, which is
  exactly the kind of storage that needs consent. So the browser stores nothing:
  it posts the path it is on to our own origin, and the server sends the event.

  WHO A VISITOR IS. A signed in person is their account id. A signed out visitor
  is an HMAC of the day, the address and the browser string under a server
  secret, the same shape Plausible uses: the same visitor counts once per day,
  tomorrow is a new id, and the address itself never leaves this server. So
  daily visitors are exact and weekly or monthly signed out visitors overcount
  (one id per day each); signed in people are counted exactly at every range.
*/

export const STATSIG_EVENTS_URL = "https://events.statsigapi.net/v1/log_event";

/* Every event Celpare sends. A closed list, so a typo cannot start a new metric. */
export const EVENT_NAMES = [
  "page_view",
  "sign_up",
  "ask_question",
  "checkout_started",
  "purchase",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export type StatsigUser = {
  userID: string;
  customIDs: { stableID: string };
  country?: string;
  userAgent?: string;
  custom: { signed_in: boolean };
  statsigEnvironment: { tier: "production" | "staging" | "development" };
};

export type StatsigEvent = {
  eventName: EventName;
  user: StatsigUser;
  time: number;
  value?: string | number;
  metadata?: Record<string, string>;
};

/* YYYY-MM-DD in UTC, the day the anonymous id belongs to. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/* A signed out visitor for one day. 24 hex characters is 96 bits: no collisions
   at any traffic Celpare will see, and too short to be mistaken for a raw hash. */
export function visitorId(secret: string, day: string, ip: string | null, userAgent: string | null): string {
  const mac = createHmac("sha256", secret).update(`${day}|${ip ?? "-"}|${userAgent ?? "-"}`).digest("hex");
  return `v_${mac.slice(0, 24)}`;
}

/*
  Crawlers, previews and headless browsers. Most crawlers never run the page's
  JavaScript, so they never send the beacon at all; this catches the ones that
  do, plus link unfurlers that fetch with a script engine. An empty browser
  string is a script, not a person.
*/
const BOT =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|skype|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptime|statuscake|curl|wget|python-requests|httpclient|axios|node-fetch|go-http-client|okhttp|java\//i;

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length < 10) return true;
  return BOT.test(userAgent);
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/*
  The path as a report row. Query and hash are dropped (a reset link carries a
  token there), ids become :id so one thread or request is not one row each,
  and anything that is not a plain site path is refused.
*/
export function cleanPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.split(/[?#]/)[0] ?? "";
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 300) return null;
  if (!/^[A-Za-z0-9/_\-.~%@:]*$/.test(path)) return null;
  if (path.startsWith("/api/") || path.startsWith("/_next/")) return null;
  /* Staff working in the dashboard are not visitors. */
  if (path === "/admin" || path.startsWith("/admin/")) return null;
  const out = path.replace(UUID, ":id").replace(/\/+$/, "");
  return out === "" ? "/" : out.slice(0, 200);
}

/* The referring site's host, and only when it is another site. */
export function referrerHost(raw: unknown, ownHost: string | null): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2000) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const own = ownHost?.toLowerCase().replace(/^www\./, "") ?? null;
    if (own && host === own) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

/* Two letters or nothing. Vercel sends XX for an address it cannot place. */
export function cleanCountry(raw: string | null | undefined): string | undefined {
  const c = raw?.trim().toUpperCase();
  return c && /^[A-Z]{2}$/.test(c) && c !== "XX" ? c : undefined;
}

export function tierFor(vercelEnv: string | undefined): StatsigUser["statsigEnvironment"]["tier"] {
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "staging";
  return "development";
}

export function buildUser(input: {
  userId: string | null;
  visitor: string;
  country?: string;
  userAgent?: string | null;
  tier: StatsigUser["statsigEnvironment"]["tier"];
}): StatsigUser {
  return {
    userID: input.userId ?? input.visitor,
    customIDs: { stableID: input.visitor },
    ...(input.country ? { country: input.country } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent.slice(0, 400) } : {}),
    custom: { signed_in: Boolean(input.userId) },
    statsigEnvironment: { tier: input.tier },
  };
}

/* Metadata values are strings in Statsig; empty and missing values are dropped. */
export function cleanMetadata(meta: Record<string, string | number | boolean | null | undefined> | undefined) {
  if (!meta) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === undefined || v === "") continue;
    out[k.slice(0, 40)] = String(v).slice(0, 200);
  }
  return Object.keys(out).length ? out : undefined;
}
