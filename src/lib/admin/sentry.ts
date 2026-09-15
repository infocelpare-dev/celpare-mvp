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
/* The numeric id, which the events and replays endpoints want. The slug works
   for /projects/ paths and is rejected by the org level ones. */
const PROJECT_ID = "4512056189714512";

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

/* ---------------------------------------------------------------- panels */

/*
  The rest of what Sentry holds, read into the dashboard rather than linked out
  to. The first version of this page linked to Replay, Traces, Logs and Metrics
  on the argument that Sentry's own interfaces are better. The founder's answer
  was that a dashboard you have to leave is not a dashboard, which is fair.

  Every endpoint below was found by probing the live API, because guessing at
  this one has already cost once: `events-stats` answers 200 with a series of
  zeroes while real errors exist.

  Each panel fetches only when its tab is open, so the page costs one request
  rather than six.
*/

const EVENTS = (query: string) => `/organizations/${ORG}/events/?${query}`;

function fields(...names: string[]): string {
  return names.map((n) => `field=${encodeURIComponent(n)}`).join("&");
}

/* Sentry's own ingest traffic, which the tunnel route makes visible as an
   outgoing HTTP call from our server. It is not Celpare doing work and it would
   otherwise be the busiest transaction on the page. */
const NOT_SENTRY_INGEST = '!transaction:"POST https://*/api/*/envelope/"';

function scope(days: number): string {
  return `&project=${PROJECT_ID}&statsPeriod=${days}d&per_page=10`;
}

export type SpanRow = { label: string; count: number; p50: number; p95: number };

export async function getSentryPerformance(days = 14): Promise<{
  byOp: SpanRow[];
  byTransaction: SpanRow[];
}> {
  const [ops, txs] = await Promise.all([
    call<{ data?: Record<string, unknown>[] }>(
      EVENTS(
        `dataset=spans&${fields("span.op", "count()", "p50(span.duration)", "p95(span.duration)")}` +
          `&query=${encodeURIComponent(NOT_SENTRY_INGEST)}&sort=${encodeURIComponent("-count()")}${scope(days)}`,
      ),
    ),
    call<{ data?: Record<string, unknown>[] }>(
      EVENTS(
        `dataset=spans&${fields("transaction", "count()", "p50(span.duration)", "p95(span.duration)")}` +
          `&query=${encodeURIComponent(`is_transaction:true ${NOT_SENTRY_INGEST}`)}` +
          `&sort=${encodeURIComponent("-count()")}${scope(days)}`,
      ),
    ),
  ]);

  const map = (rows: Record<string, unknown>[] | undefined, key: string): SpanRow[] =>
    (rows ?? []).map((r) => ({
      label: String(r[key] ?? "unknown"),
      count: Number(r["count()"] ?? 0),
      p50: Number(r["p50(span.duration)"] ?? 0),
      p95: Number(r["p95(span.duration)"] ?? 0),
    }));

  return { byOp: map(ops?.data, "span.op"), byTransaction: map(txs?.data, "transaction") };
}

export type AiSpanRow = { model: string; calls: number; tokens: number };

/* The agent spans this app writes itself, read back. /admin/ai reports the same
   ground truth from our own ai_usage_records and is not sampled; this is the
   sampled view, and the two disagreeing is expected rather than alarming. */
export async function getSentryAgent(days = 14): Promise<AiSpanRow[]> {
  const res = await call<{ data?: Record<string, unknown>[] }>(
    EVENTS(
      `dataset=spans&${fields("gen_ai.request.model", "count()", "sum(gen_ai.usage.total_tokens)")}` +
        `&query=${encodeURIComponent("span.op:gen_ai.chat")}&sort=${encodeURIComponent("-count()")}${scope(days)}`,
    ),
  );
  return (res?.data ?? []).map((r) => ({
    model: String(r["gen_ai.request.model"] ?? "unknown"),
    calls: Number(r["count()"] ?? 0),
    tokens: Number(r["sum(gen_ai.usage.total_tokens)"] ?? 0),
  }));
}

export type ReplayRow = {
  id: string;
  startedAt: string;
  durationMs: number;
  errors: number;
  deadClicks: number;
  rageClicks: number;
  url: string | null;
  permalink: string;
};

export async function getSentryReplays(days = 14): Promise<ReplayRow[]> {
  const res = await call<{ data?: Record<string, unknown>[] }>(
    `/organizations/${ORG}/replays/?${fields(
      "id",
      "started_at",
      "duration",
      "count_errors",
      "count_dead_clicks",
      "count_rage_clicks",
      "urls",
    )}&sort=-started_at${scope(days)}`,
  );

  return (res?.data ?? []).map((r) => {
    const urls = Array.isArray(r.urls) ? (r.urls as string[]) : [];
    const id = String(r.id ?? "");
    return {
      id,
      startedAt: String(r.started_at ?? ""),
      /* The API reports seconds. */
      durationMs: Number(r.duration ?? 0) * 1000,
      errors: Number(r.count_errors ?? 0),
      deadClicks: Number(r.count_dead_clicks ?? 0),
      rageClicks: Number(r.count_rage_clicks ?? 0),
      url: urls[0] ?? null,
      permalink: `${SENTRY_URL}/explore/replays/${id}/`,
    };
  });
}

export type LogRow = { timestamp: string; message: string; severity: string };

export async function getSentryLogs(days = 14): Promise<LogRow[]> {
  const res = await call<{ data?: Record<string, unknown>[] }>(
    EVENTS(
      `dataset=ourlogs&${fields("timestamp", "message", "severity")}&sort=-timestamp${scope(days)}`,
    ),
  );
  return (res?.data ?? []).map((r) => ({
    timestamp: String(r.timestamp ?? ""),
    message: String(r.message ?? ""),
    severity: String(r.severity ?? "info"),
  }));
}

export type MetricRow = { name: string; count: number; avg: number };

export async function getSentryMetrics(days = 14): Promise<MetricRow[]> {
  /* count(value), not count(). The bare form is rejected: "Invalid number of
     arguments for count, was expecting 1 arguments". */
  const res = await call<{ data?: Record<string, unknown>[] }>(
    EVENTS(
      `dataset=tracemetrics&${fields("metric.name", "count(value)", "avg(value)")}` +
        `&sort=${encodeURIComponent("-count(value)")}${scope(days)}`,
    ),
  );
  return (res?.data ?? []).map((r) => ({
    name: String(r["metric.name"] ?? "unknown"),
    count: Number(r["count(value)"] ?? 0),
    avg: Number(r["avg(value)"] ?? 0),
  }));
}
