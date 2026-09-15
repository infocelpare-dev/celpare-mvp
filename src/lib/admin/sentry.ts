import "server-only";

/*
  Sentry, read into the admin dashboard.

  THE ONE RULE HERE: the token never reaches the browser.

  SENTRY_API_TOKEN is an organisation auth token. It can read every issue, every
  event and every replay in the Celpare org, which is far more authority than
  the DSN carries. It has no NEXT_PUBLIC_ prefix, this module is marked
  server-only so importing it from a client component fails the build rather
  than at runtime, and nothing below ever returns it or puts it in a rendered
  value. Hard rule 4.

  This is also the one place in the dashboard that reads a third party rather
  than our own database, so it is the one place that has to assume the far end
  is slow, down, or has changed shape. Every call has a timeout, every failure
  is caught, and the page renders a stated reason instead of a stack trace.
*/

const ORG = "celpare";
const PROJECT = "javascript-nextjs";

/* The org is in Sentry's EU region. api.sentry.io would answer 404 for these
   paths, which reads as "no data" rather than "wrong host", so getting this
   wrong is expensive to diagnose. */
const API = "https://de.sentry.io/api/0";

const TIMEOUT_MS = 8000;

export function sentryConfigured(): boolean {
  return Boolean(process.env.SENTRY_API_TOKEN);
}

/* Where to send somebody who wants the full picture. Safe to render: it is the
   same URL as the dashboard, with no credential in it. */
export const SENTRY_URL = `https://${ORG}.sentry.io`;

export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  status: string;
  count: number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
};

export type SentryDay = { day: string; value: number };

export type SentrySnapshot = {
  ok: boolean;
  /* Why there is nothing to show. Rendered verbatim, so it says what actually
     happened rather than "something went wrong". */
  reason?: string;
  issues: SentryIssue[];
  unresolvedCount: number;
  eventsToday: number;
  eventsWindow: number;
  /* Events Sentry received and did NOT store: over quota, rate limited, or
     dropped by an inbound filter. Worth surfacing, because the failure mode it
     represents is a dashboard that looks quiet for the wrong reason. */
  droppedWindow: number;
  series: SentryDay[];
};

const EMPTY: SentrySnapshot = {
  ok: false,
  issues: [],
  unresolvedCount: 0,
  eventsToday: 0,
  eventsWindow: 0,
  droppedWindow: 0,
  series: [],
};

async function call<T>(path: string): Promise<T | null> {
  const token = process.env.SENTRY_API_TOKEN;
  if (!token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      /* Never cached. An error dashboard showing a cached picture of a healthy
         platform is worse than one that is briefly unavailable. */
      cache: "no-store",
    });

    if (!response.ok) {
      /* Deliberately does not log the body: a 401 response from Sentry can echo
         parts of the request. */
      console.warn(`[sentry] ${path} returned ${response.status}`);
      return null;
    }

    return (await response.json()) as T;
  } catch (err) {
    console.warn(`[sentry] ${path} failed:`, err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type RawIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit?: string | null;
  level?: string;
  status?: string;
  count?: string | number;
  userCount?: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
};

type StatsV2 = {
  intervals?: string[];
  groups?: {
    by?: { outcome?: string };
    totals?: Record<string, number>;
    series?: Record<string, number[]>;
  }[];
};

/* Sentry returns `count` as a string on the issues endpoint. Verified against
   the live API. Reading it as a number without this gives NaN, which formats as
   "NaN" in a stat tile. */
function toCount(value: string | number | undefined): number {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function getSentrySnapshot(days = 14): Promise<SentrySnapshot> {
  if (!sentryConfigured()) {
    return {
      ...EMPTY,
      reason:
        "SENTRY_API_TOKEN is not set, so this page cannot read the Sentry org. The SDK is still reporting: this affects what is shown here, not what is captured.",
    };
  }

  const [issues, stats] = await Promise.all([
    call<RawIssue[]>(
      `/projects/${ORG}/${PROJECT}/issues/?query=${encodeURIComponent("is:unresolved")}&statsPeriod=${days}d&limit=25`,
    ),
    /*
      stats_v2, not events-stats.

      events-stats is the obvious endpoint and it answered 200 with a correctly
      shaped series of zeroes, while the issues endpoint on the same token
      showed real errors. A chart reading zero next to a list of live issues is
      the worst kind of wrong, because it looks like good news. Verified against
      the live API: stats_v2 returns the real counts.

      It counts what Sentry ingested rather than what a search index matched,
      which is also the more honest measure for "how many errors happened", and
      it comes grouped by outcome so events that were dropped rather than stored
      are visible instead of silently missing.
    */
    call<StatsV2>(
      `/organizations/${ORG}/stats_v2/?field=${encodeURIComponent("sum(quantity)")}&category=error&interval=1d&statsPeriod=${days}d&groupBy=outcome`,
    ),
  ]);

  if (issues === null && stats === null) {
    return {
      ...EMPTY,
      reason:
        "Sentry did not answer. The token may be wrong or expired, or the API may be unreachable. Nothing is wrong with the app because of this.",
    };
  }

  const mapped: SentryIssue[] = (issues ?? []).map((i) => ({
    id: i.id,
    shortId: i.shortId,
    title: i.title,
    culprit: i.culprit ?? null,
    level: i.level ?? "error",
    status: i.status ?? "unresolved",
    count: toCount(i.count),
    userCount: i.userCount ?? 0,
    firstSeen: i.firstSeen,
    lastSeen: i.lastSeen,
    permalink: i.permalink,
  }));

  /*
    stats_v2 returns parallel arrays: `intervals` of ISO timestamps, and one
    group per outcome whose series lines up with them by index. Accepted is what
    was stored and is therefore what the chart plots; everything else is an
    event Sentry received and threw away.
  */
  const intervals = stats?.intervals ?? [];
  const seriesFor = (outcome: string): number[] =>
    stats?.groups?.find((g) => g.by?.outcome === outcome)?.series?.["sum(quantity)"] ?? [];

  const accepted = seriesFor("accepted");

  const series: SentryDay[] = intervals.map((iso, i) => ({
    day: iso.slice(0, 10),
    value: accepted[i] ?? 0,
  }));

  const droppedWindow = (stats?.groups ?? [])
    .filter((g) => g.by?.outcome && g.by.outcome !== "accepted")
    .reduce((sum, g) => sum + (g.totals?.["sum(quantity)"] ?? 0), 0);

  return {
    ok: true,
    issues: mapped,
    unresolvedCount: mapped.length,
    eventsWindow: series.reduce((sum, d) => sum + d.value, 0),
    /* The last interval, which is today. Daily buckets cannot express a rolling
       24 hours, and claiming they can would be a number that is quietly wrong
       every morning. */
    eventsToday: series.length > 0 ? (series[series.length - 1]?.value ?? 0) : 0,
    droppedWindow,
    series,
  };
}
