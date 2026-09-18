import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import {
  getSentryAgent,
  getSentryLogs,
  getSentryMetrics,
  getSentryPerformance,
  getSentryReplays,
  getSentrySnapshot,
  sentryConfigured,
  SENTRY_URL,
} from "@/lib/admin/sentry";
import { RankedBars, TimeSeries } from "@/components/ui/charts";
import { FilterTabs } from "@/components/admin/filters";
import { AdminSkeleton } from "@/components/admin/skeleton";
import {
  Count,
  EmptyState,
  PageHeader,
  Panel,
  Section,
  Stat,
  StatGrid,
  Status,
  When,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/*
  Sentry, inside the dashboard.

  The first version of this page showed errors and linked out to Replay, Traces,
  Logs and Metrics, on the argument that Sentry's own interfaces are better than
  anything rebuilt here. The founder's answer was that a dashboard you have to
  leave is not a dashboard. Fair, and this is the corrected version: five tabs,
  every one reading live.

  The links out stay, because they are still where you go to watch a replay or
  walk a flame graph. What changed is that you can see what is there without
  leaving first.

  One tab fetches at a time, so the page costs one request rather than six.

  Every endpoint here was found by probing the live API rather than taken from
  the docs, because guessing has already cost once on this page: `events-stats`
  answers 200 with a series of zeroes while real errors exist.
*/

const DAYS = 14;

const TABS = [
  { key: "issues", label: "Issues" },
  { key: "performance", label: "Performance" },
  { key: "replays", label: "Replays" },
  { key: "logs", label: "Logs" },
  { key: "metrics", label: "Metrics" },
];

type View = "issues" | "performance" | "replays" | "logs" | "metrics";

function ms(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}s`;
  return `${Math.round(value)}ms`;
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-2 hover:text-foreground"
    >
      {children}
    </a>
  );
}

/* ------------------------------------------------------------ unavailable */

function Unavailable({ reason }: { reason?: string }) {
  return (
    <div className="mt-5 space-y-4">
      <Panel className="px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Status value={sentryConfigured() ? "degraded" : "not_configured"} />
          <span className="text-[13px] font-medium">
            {sentryConfigured() ? "Sentry did not answer" : "Not connected yet"}
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{reason}</p>
      </Panel>

      {!sentryConfigured() ? (
        <Section title="Connecting it">
          <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
            <p>
              The SDK is already wired and reporting. This page needs a second, separate
              credential to read back what it sent: an organisation auth token.
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5">
              <li>
                Create one at{" "}
                <ExternalLink href={`${SENTRY_URL}/settings/auth-tokens/`}>
                  Settings, Auth Tokens
                </ExternalLink>{" "}
                with <span className="font-mono text-foreground">org:read</span>,{" "}
                <span className="font-mono text-foreground">project:read</span> and{" "}
                <span className="font-mono text-foreground">event:read</span>.
              </li>
              <li>
                Put it in <span className="font-mono text-foreground">.env.local</span> as{" "}
                <span className="font-mono text-foreground">SENTRY_API_TOKEN</span>. No{" "}
                <span className="font-mono text-foreground">NEXT_PUBLIC_</span> prefix: it reads
                every issue and event in the org, so it must never reach a browser.
              </li>
              <li>Restart the dev server.</li>
            </ol>
          </Panel>
        </Section>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- issues */

async function IssuesPanel() {
  const snapshot = await getSentrySnapshot(DAYS);
  if (!snapshot.ok) return <Unavailable reason={snapshot.reason} />;

  return (
    <>
      <Section title={`Last ${DAYS} days`}>
        <StatGrid>
          <Stat
            label="Unresolved issues"
            value={String(snapshot.unresolvedCount)}
            tone={snapshot.unresolvedCount > 0 ? "danger" : "ok"}
            hint={snapshot.unresolvedCount === 0 ? "Nothing open" : "Distinct problems"}
          />
          <Stat label="Events today" value={String(snapshot.eventsToday)} />
          <Stat label={`Events, ${DAYS} days`} value={String(snapshot.eventsWindow)} />
          <Stat
            label="Dropped"
            value={String(snapshot.droppedWindow)}
            tone={snapshot.droppedWindow > 0 ? "warn" : "neutral"}
            hint={
              snapshot.droppedWindow > 0
                ? "Received and not stored: quota, rate limit or filter"
                : "Nothing lost to quota or filters"
            }
          />
        </StatGrid>
      </Section>

      <Section
        title="Error events by day"
        lead="Every day in the window, including the quiet ones, so a gap reads as quiet rather than as missing."
      >
        <TimeSeries points={snapshot.series} label="Error events" windowDays={DAYS} />
      </Section>

      <Section title="Unresolved issues">
        {snapshot.issues.length === 0 ? (
          <EmptyState
            title="Nothing is broken"
            body="No unresolved issues in the window. A real zero read from Sentry, rather than an absence of monitoring."
          />
        ) : (
          <ul className="space-y-2">
            {snapshot.issues.map((issue) => (
              <li key={issue.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Status value={issue.level} />
                  <span className="font-mono text-[12px] text-muted">{issue.shortId}</span>
                  <span className="ml-auto text-[12px] text-muted">
                    Last seen <When iso={issue.lastSeen} time />
                  </span>
                </div>
                <p className="mt-2 text-[14px] font-medium leading-snug">{issue.title}</p>
                {issue.culprit ? (
                  <p className="mt-1 break-all font-mono text-[12px] text-muted">{issue.culprit}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-[12px] text-muted">
                  <span>
                    <span className="tnum text-foreground">{issue.count}</span>{" "}
                    {issue.count === 1 ? "event" : "events"}
                  </span>
                  <span>
                    <span className="tnum text-foreground">{issue.userCount}</span>{" "}
                    {issue.userCount === 1 ? "person" : "people"} affected
                  </span>
                  <span>
                    First seen <When iso={issue.firstSeen} />
                  </span>
                  <span className="ml-auto">
                    <ExternalLink href={issue.permalink}>Open in Sentry</ExternalLink>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------ performance */

async function PerformancePanel() {
  const [perf, agent] = await Promise.all([getSentryPerformance(DAYS), getSentryAgent(DAYS)]);

  if (perf.byOp.length === 0 && perf.byTransaction.length === 0) {
    return (
      <Section title="Performance">
        <EmptyState
          title="No traces in this window"
          body="Either nothing has been used, or tracing is sampling at a rate that has not caught anything yet."
        />
      </Section>
    );
  }

  return (
    <>
      <Section
        title="Slowest routes"
        lead="p95, so one fast request cannot hide a slow tail. Sentry's own ingest traffic is excluded: the tunnel makes it look like our server doing work, and it would otherwise be the busiest row here."
      >
        <RankedBars
          rows={perf.byTransaction.map((r) => ({
            label: r.label,
            value: Math.round(r.p95),
            secondary: `${r.count} calls, p50 ${ms(r.p50)}`,
            tone: r.p95 > 3000 ? ("danger" as const) : ("accent" as const),
          }))}
          valueLabel="p95 ms"
        />
      </Section>

      <Section title="By operation" lead="Where the time goes inside a request.">
        <RankedBars
          rows={perf.byOp.map((r) => ({
            label: r.label,
            value: Math.round(r.p95),
            secondary: `${r.count} spans, p50 ${ms(r.p50)}`,
          }))}
          valueLabel="p95 ms"
        />
      </Section>

      <Section
        title="Ask Celpare"
        lead="The agent spans this app writes itself. /admin/ai reports the same ground truth from our own records and is not sampled, so the two disagreeing is expected rather than alarming."
      >
        {agent.length === 0 ? (
          <EmptyState
            title="No AI spans in this window"
            body="Nobody has asked Celpare anything, or the traces were not sampled."
          />
        ) : (
          <RankedBars
            rows={agent.map((r) => ({
              label: r.model,
              value: r.calls,
              secondary: `${r.tokens.toLocaleString("en-GB")} tokens`,
            }))}
            valueLabel="calls"
          />
        )}
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- replays */

async function ReplaysPanel() {
  const replays = await getSentryReplays(DAYS);

  return (
    <Section
      title="Session replays"
      lead="Every session that hit an error, plus a sample of the rest. All text and inputs are masked at capture, so these show what happened without showing what anyone typed."
    >
      {replays.length === 0 ? (
        <EmptyState
          title="No replays in this window"
          body="Replay records a tenth of sessions in production and every session in development. Nothing has been recorded yet."
        />
      ) : (
        <ul className="space-y-2">
          {replays.map((replay) => (
            <li key={replay.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Status value={replay.errors > 0 ? "failed" : "ok"} />
                <span className="font-mono text-[12px] text-muted">{replay.id.slice(0, 8)}</span>
                <span className="ml-auto text-[12px] text-muted">
                  <When iso={replay.startedAt} time />
                </span>
              </div>

              {replay.url ? (
                <p className="mt-2 break-all font-mono text-[12px]">{replay.url}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-[12px] text-muted">
                <span>{ms(replay.durationMs)} long</span>
                <span>
                  <Count n={replay.errors} /> errors
                </span>
                {replay.deadClicks > 0 ? (
                  <span>
                    <Count n={replay.deadClicks} /> dead clicks
                  </span>
                ) : null}
                {replay.rageClicks > 0 ? (
                  <span className="text-danger-text">
                    <Count n={replay.rageClicks} /> rage clicks
                  </span>
                ) : null}
                <span className="ml-auto">
                  <ExternalLink href={replay.permalink}>Watch</ExternalLink>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------- logs */

async function LogsPanel() {
  const logs = await getSentryLogs(DAYS);

  return (
    <Section
      title="Logs"
      lead="Structured logs the app writes deliberately, newest first. Not console output: only what Sentry.logger was called with."
    >
      {logs.length === 0 ? (
        <EmptyState
          title="No logs in this window"
          body="Nothing has called Sentry.logger yet. The gateway writes one line per answer, so this fills in as Ask Celpare is used."
        />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {logs.map((log, i) => (
            <li
              key={`${log.timestamp}-${i}`}
              className="flex flex-wrap items-baseline gap-3 px-4 py-2.5"
            >
              <Status value={log.severity} />
              <span className="min-w-0 flex-1 text-[13px] leading-relaxed">{log.message}</span>
              <span className="text-[12px] text-muted">
                <When iso={log.timestamp} time />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ---------------------------------------------------------------- metrics */

async function MetricsPanel() {
  const metrics = await getSentryMetrics(DAYS);

  const ours = metrics.filter((m) => !m.name.startsWith("browser."));
  const vitals = metrics.filter((m) => m.name.startsWith("browser."));

  return (
    <>
      <Section
        title="Application metrics"
        lead="Written by the app. Unlike traces these are not sampled, so a count here is the real count."
      >
        {ours.length === 0 ? (
          <EmptyState
            title="No application metrics yet"
            body="The gateway records ai.requests, ai.tokens.total and ai.latency on every answer."
          />
        ) : (
          <RankedBars
            rows={ours.map((m) => ({
              label: m.name,
              value: m.count,
              secondary: `average ${m.avg >= 1000 ? ms(m.avg) : m.avg.toFixed(m.avg < 10 ? 2 : 0)}`,
            }))}
            valueLabel="recorded"
          />
        )}
      </Section>

      <Section
        title="Web vitals"
        lead="Collected by the browser SDK without being asked for. Development numbers are not worth reading: an unbundled dev build is slow by design."
      >
        {vitals.length === 0 ? (
          <EmptyState title="No web vitals yet" body="These arrive once a page is loaded." />
        ) : (
          <RankedBars
            rows={vitals.map((m) => ({
              label: m.name.replace("browser.web_vital.", "").toUpperCase(),
              value: Math.round(m.avg),
              secondary: `${m.count} samples`,
            }))}
            valueLabel="average"
          />
        )}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------- page */

export default async function AdminSentryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireAdmin("security.read");
  const sp = await searchParams;
  const view = (TABS.some((t) => t.key === sp.view) ? sp.view! : "issues") as View;

  const href = (key: string) => (key === "issues" ? "/admin/sentry" : `/admin/sentry?view=${key}`);

  const ActivePanel =
    view === "performance"
      ? PerformancePanel
      : view === "replays"
        ? ReplaysPanel
        : view === "logs"
          ? LogsPanel
          : view === "metrics"
            ? MetricsPanel
            : IssuesPanel;

  return (
    <>
      <PageHeader
        title="Errors and performance"
        lead="Read live from Sentry. Unlike every other page here, this one depends on a third party being reachable, so it says when it is not."
        action={
          <a
            href={`${SENTRY_URL}/issues/`}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            Open in Sentry
          </a>
        }
      />

      <div className="mt-5">
        <FilterTabs
          label="Sentry view"
          active={href(view)}
          items={TABS.map((t) => ({ href: href(t.key), label: t.label }))}
        />
      </div>

      {/* Keyed on the view so switching tabs shows the skeleton again rather
          than the previous tab's content while the next one loads. */}
      <Suspense key={view} fallback={<AdminSkeleton header={false} tiles={4} table={false} />}>
        <ActivePanel />
      </Suspense>

      <Section title="Not shown here">
        <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
          <p>
            <strong className="font-medium text-foreground">Profiling</strong> is configured and
            has produced no data yet. Sentry returns zero rows for this project, which is expected
            while the traffic is one developer: a profile is only captured for a sampled trace. It
            will appear in{" "}
            <ExternalLink href={`${SENTRY_URL}/explore/profiling/`}>Profiling</ExternalLink> once
            there is real traffic, and this page grows a tab when there is something in it.
          </p>
          <p className="mt-3">
            <strong className="font-medium text-foreground">Seer</strong>, the root cause analysis,
            runs from any issue page. Code level fixes need the GitHub repository connected under{" "}
            <ExternalLink href={`${SENTRY_URL}/settings/integrations/github/`}>
              Integrations
            </ExternalLink>
            , which is an OAuth flow rather than a setting.
          </p>
          <p className="mt-3">
            Nothing sent to Sentry carries a conversation, a request body, a cookie or a stack
            frame variable. See D82.
          </p>
        </Panel>
      </Section>

      {session.can("admin.access") ? (
        <div className="mt-5">
          <Link
            href="/admin/health"
            className="text-[13px] text-muted underline underline-offset-2 hover:text-foreground"
          >
            System health, measured from inside the app
          </Link>
        </div>
      ) : null}
    </>
  );
}
