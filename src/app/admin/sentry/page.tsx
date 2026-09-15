import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { getSentrySnapshot, sentryConfigured, SENTRY_URL } from "@/lib/admin/sentry";
import { TimeSeries } from "@/components/admin/charts";
import {
  EmptyState,
  PageHeader,
  Panel,
  Section,
  Stat,
  StatGrid,
  Status,
  When,
} from "@/components/admin/ui";
import { AdminSkeleton } from "@/components/admin/skeleton";

export const dynamic = "force-dynamic";

/*
  Sentry, inside the dashboard.

  The only page here that reads something other than our own database, which is
  why it is the only one that can be unavailable while everything else works.
  It says which of those two is happening rather than rendering an empty state
  that looks like good news.

  What it deliberately does NOT try to be is a copy of Sentry. Replays, profiles
  and the full trace explorer are interfaces Sentry has already built better
  than this page could, so those are links. What is here is the question an
  administrator actually opens a dashboard to answer: is anything broken right
  now, and how badly.

  The token is read in src/lib/admin/sentry.ts, which is marked server-only.
  Nothing on this page renders it or anything derived from it.
*/

/*
  Everything that needs Sentry to answer.

  Split out so the page shell does not wait on it. This is the only page in the
  dashboard that makes a third party call before it can render, and an 8 second
  timeout on that call is 8 seconds of blank screen if the whole page awaits it.
  With the boundary, the heading and the reference links paint immediately and
  only this region streams in.

  It also removed a class of noise: an aborted navigation during that wait threw
  "The destination stream closed early" from Next's runtime, which is not a
  defect but did reach the issue stream.
*/
async function SentryData() {
  const snapshot = await getSentrySnapshot(14);

  return (
    <>
      {!snapshot.ok ? (
        <div className="mt-5 space-y-4">
          <Panel className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Status value={sentryConfigured() ? "degraded" : "not_configured"} />
              <span className="text-[13px] font-medium">
                {sentryConfigured() ? "Sentry did not answer" : "Not connected yet"}
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{snapshot.reason}</p>
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
                    <a
                      href={`${SENTRY_URL}/settings/auth-tokens/`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Settings, Auth Tokens
                    </a>{" "}
                    with the <span className="font-mono text-foreground">org:read</span>,{" "}
                    <span className="font-mono text-foreground">project:read</span> and{" "}
                    <span className="font-mono text-foreground">event:read</span> scopes.
                  </li>
                  <li>
                    Put it in <span className="font-mono text-foreground">.env.local</span> as{" "}
                    <span className="font-mono text-foreground">SENTRY_API_TOKEN</span>. No{" "}
                    <span className="font-mono text-foreground">NEXT_PUBLIC_</span> prefix: this
                    token can read every issue and event in the org, so it must never reach a
                    browser.
                  </li>
                  <li>Restart the dev server.</li>
                </ol>
                <p className="mt-3">
                  Until then, errors are still being captured. This page is the only thing
                  affected.
                </p>
              </Panel>
            </Section>
          ) : null}
        </div>
      ) : (
        <>
          <Section title="Last 14 days">
            <StatGrid>
              <Stat
                label="Unresolved issues"
                value={String(snapshot.unresolvedCount)}
                tone={snapshot.unresolvedCount > 0 ? "danger" : "ok"}
                hint={snapshot.unresolvedCount === 0 ? "Nothing open" : "Distinct problems"}
              />
              <Stat label="Events today" value={String(snapshot.eventsToday)} />
              <Stat label="Events, 14 days" value={String(snapshot.eventsWindow)} />
              <Stat
                label="Dropped"
                value={String(snapshot.droppedWindow)}
                tone={snapshot.droppedWindow > 0 ? "warn" : "neutral"}
                hint={
                  snapshot.droppedWindow > 0
                    ? "Received and not stored: over quota, rate limited or filtered"
                    : "Nothing lost to quota or filters"
                }
              />
            </StatGrid>
          </Section>

          <Section
            title="Error events by day"
            lead="Every day in the window, including the quiet ones, so a gap reads as quiet rather than as missing."
          >
            <TimeSeries
              points={snapshot.series}
              label="Error events"
              windowDays={14}
            />
          </Section>

          <Section
            title="Unresolved issues"
            lead="Most recent first. Opening one goes to Sentry, where the stack trace, the replay and Seer live."
          >
            {snapshot.issues.length === 0 ? (
              <EmptyState
                title="Nothing is broken"
                body="No unresolved issues in the last 14 days. This is the good outcome, and it is a real zero read from Sentry rather than an absence of monitoring."
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
                      <p className="mt-1 break-all font-mono text-[12px] text-muted">
                        {issue.culprit}
                      </p>
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
                      <a
                        href={issue.permalink}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="ml-auto underline underline-offset-2 hover:text-foreground"
                      >
                        Open in Sentry
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </>
  );
}

export default async function AdminSentryPage() {
  const session = await requireAdmin("security.read");

  const openInSentry = (
    <a
      href={`${SENTRY_URL}/issues/`}
      target="_blank"
      rel="noreferrer noopener"
      className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
    >
      Open in Sentry
    </a>
  );

  return (
    <>
      <PageHeader
        title="Errors and performance"
        lead="Read live from Sentry. Unlike every other page here, this one depends on a third party being reachable, so it says when it is not."
        action={openInSentry}
      />

      {/* Streams in. The fallback carries no heading, because the real one is
          already above it. */}
      <Suspense fallback={<AdminSkeleton header={false} tiles={4} table={false} />}>
        <SentryData />
      </Suspense>

      <Section title="What lives in Sentry rather than here">
        <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
          <p>
            Session replays, profiles, the trace explorer and Seer are Sentry interfaces, and
            rebuilding them here would produce worse versions of tools that already exist. This
            page answers whether something is broken; Sentry answers why.
          </p>
          <ul className="mt-3 space-y-1.5">
            <li>
              <a
                href={`${SENTRY_URL}/explore/replays/`}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Session Replay
              </a>{" "}
              every session that hit an error, with all text and inputs masked.
            </li>
            <li>
              <a
                href={`${SENTRY_URL}/explore/traces/`}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Traces
              </a>{" "}
              including the Ask Celpare agent spans.
            </li>
            <li>
              <a
                href={`${SENTRY_URL}/explore/logs/`}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Logs
              </a>{" "}
              and{" "}
              <a
                href={`${SENTRY_URL}/explore/metrics/`}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Metrics
              </a>
              .
            </li>
          </ul>
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
