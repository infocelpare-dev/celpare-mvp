import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import { RankedBars, ShareBar, TimeSeries } from "@/components/ui/charts";
import {
  ANALYTICS_WINDOWS,
  gate,
  getToolAnalytics,
  isAnalyticsWindow,
  type AnalyticsWindow,
} from "@/lib/developer/queries";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/*
  The developer analytics board. Founder instruction 2026-09-18: the workspace
  should look professional and show tool activity over a day, a week and a
  month, with boards beside it.

  EVERY NUMBER ON THIS PAGE IS A COUNT OF REAL ROWS. Nothing is estimated,
  nothing is projected, and a zero renders as a zero (D13, D30). There is no
  "trending" badge that means nothing and no invented engagement score. Where
  there is no data yet the board says so in words rather than drawing a flat
  line that looks like measured silence.

  The range lives in the URL rather than in state, so a range is a place: it
  survives a reload, it can be linked to somebody, and the back button works.
  That is the same reasoning the profile tabs are built on.

  The charts are the set in components/ui/charts, shared with the admin
  dashboard. Every series here is a single measure, so no categorical palette
  arises and there is no dual axis anywhere: views and saves are two different
  measures, so they are two columns of text on one row rather than two bars.
*/

function pct(now: number, before: number): { text: string; dir: "up" | "down" | "flat" } {
  if (before === 0) {
    /* No baseline is not a 100% rise. Saying so is the honest render, and it is
       what most of these will show until the catalogue has traffic. */
    return { text: now === 0 ? "No change" : "No earlier data", dir: "flat" };
  }
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return { text: "Level", dir: "flat" };
  return {
    text: `${change > 0 ? "Up" : "Down"} ${Math.abs(change)}%`,
    dir: change > 0 ? "up" : "down",
  };
}

const SOURCE_LABEL: Record<string, string> = {
  direct: "Direct",
  search: "Search",
  explore: "Explore",
  ask: "Ask Celpare",
  recommendation: "Recommendations",
  community: "Community",
};

export default async function DeveloperAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { gate: g, db } = await gate();

  if (g.state === "signed-out") redirect("/get-started");
  if (g.state === "mode-off") return <ModeOff />;
  if (g.state === "needs-onboarding") redirect("/developer/terms");

  const params = await searchParams;
  /* Validated against the three we offer. The function clamps its own input as
     well, so a crafted ?range= cannot ask for a decade of rows either way. */
  const days = (isAnalyticsWindow(params.range) ? Number(params.range) : 7) as AnalyticsWindow;

  const data = await getToolAnalytics(db!, days);
  const windowLabel =
    ANALYTICS_WINDOWS.find((w) => w.days === days)?.label ?? "Last 7 days";

  const viewTrend = pct(data.totals.views, data.previous.views);
  const saveTrend = pct(data.totals.savers, data.previous.savers);

  return (
    <DeveloperShell
      title="Analytics"
      lead="How people are finding and using the tools you submitted."
      verified={g.profile.verified}
      backHref="/developer"
      backLabel="Back to dashboard"
    >
      {/*
        No approved tool means no traffic, and that is a different situation
        from a quiet week. Saying which one it is saves somebody staring at
        empty charts wondering whether the board is broken.
      */}
      {data.tool_count === 0 ? (
        <Card>
          <h2 className="font-display text-[17px] font-semibold">Nothing to measure yet</h2>
          <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-muted">
            Analytics start the moment your first tool is live in the catalogue.
            Submit one and this board fills in on its own, with no setup and no
            tracking code.
          </p>
          <div className="mt-4">
            <ButtonLink href="/developer/submit" size="sm">
              Submit a tool
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <>
          {/* ------------------------------------------------- the range control */}
          {/*
            Real links, not buttons. Above the charts, in one row, which is
            where the ux guidance puts a filter.
          */}
          <div
            role="group"
            aria-label="Time range"
            className="flex flex-wrap gap-2"
          >
            {ANALYTICS_WINDOWS.map((w) => {
              const active = w.days === days;
              return (
                <Link
                  key={w.days}
                  href={`/developer/analytics?range=${w.days}`}
                  aria-current={active ? "true" : undefined}
                  className={
                    active
                      ? "rounded-full border border-foreground bg-surface px-4 py-2 text-[14px] font-medium"
                      : "rounded-full border border-border px-4 py-2 text-[14px] text-muted transition-colors duration-200 ease-out hover:text-foreground"
                  }
                >
                  {w.label}
                </Link>
              );
            })}
          </div>

          {/* --------------------------------------------------------- stat tiles */}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Tool views"
              value={data.totals.views}
              note={viewTrend.text}
              sub={`${windowLabel.toLowerCase()}`}
            />
            <Stat
              label="Signed in viewers"
              value={data.totals.viewers}
              note="People, not visits"
              sub="Signed out views are counted above but cannot be counted as people"
            />
            <Stat label="Saves" value={data.totals.savers} note={saveTrend.text} sub={windowLabel.toLowerCase()} />
            <Stat
              label="Reviews"
              value={data.totals.reviews}
              note={
                data.lifetime.rating != null
                  ? `${data.lifetime.rating} average, all time`
                  : "Not rated yet"
              }
              sub={windowLabel.toLowerCase()}
            />
          </div>

          {/* ------------------------------------------------------ views per day */}

          <section className="mt-8" aria-labelledby="views-board">
            <h2 id="views-board" className="font-display text-[17px] font-semibold">
              Views over time
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Every time somebody opened one of your tool pages. A day with
              nothing is drawn as a day with nothing, not skipped.
            </p>
            <div className="mt-3">
              <TimeSeries
                points={data.by_day}
                label="Tool views"
                unit="views"
                windowDays={days}
              />
            </div>
          </section>

          {/* ------------------------------------------------------------ by tool */}

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="tools-board">
              <h2 id="tools-board" className="font-display text-[17px] font-semibold">
                Which tool
              </h2>
              <p className="mt-1 text-[13px] text-muted">
                Views in this range, with saves beside them.
              </p>
              <div className="mt-3">
                <RankedBars
                  rows={data.by_tool.map((t) => ({
                    label: t.name,
                    value: t.value,
                    /* Saves are a different measure, so they are text beside the
                       bar rather than a second bar. Two measures in one row is a
                       dual axis wearing a disguise. */
                    secondary: t.saves > 0 ? `${t.saves} saved` : undefined,
                    href: `/tools/${t.slug}`,
                  }))}
                  valueLabel="views"
                  emptyMessage="No views of your tools in this range."
                />
              </div>
            </section>

            <section aria-labelledby="source-board">
              <h2 id="source-board" className="font-display text-[17px] font-semibold">
                How they arrived
              </h2>
              <p className="mt-1 text-[13px] text-muted">
                The surface each view came from.
              </p>
              <div className="mt-3">
                <ShareBar
                  parts={data.by_source.map((s) => ({
                    label: SOURCE_LABEL[s.label] ?? s.label,
                    value: s.value,
                  }))}
                />
              </div>
            </section>
          </div>

          {/* ---------------------------------------------------------- by query */}

          <section className="mt-8" aria-labelledby="query-board">
            <h2 id="query-board" className="font-display text-[17px] font-semibold">
              What they searched for
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              The search that led somebody to one of your tools. This is the most
              useful thing on the page: it is the language people actually use
              for the job your tool does, in their words rather than yours.
            </p>
            <div className="mt-3">
              <RankedBars
                rows={data.by_query.map((q) => ({ label: q.label, value: q.value }))}
                valueLabel="views from this search"
                emptyMessage="Nobody has reached your tools from a search in this range. Views from a direct link or from Explore do not carry a search term."
              />
            </div>
          </section>

          {/* --------------------------------------------------------- all time */}

          <section className="mt-8" aria-labelledby="lifetime-board">
            <h2 id="lifetime-board" className="font-display text-[17px] font-semibold">
              All time
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Since your first tool went live. These do not move with the range
              above.
            </p>
            <dl className="mt-3 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Views" value={data.lifetime.views.toLocaleString("en-GB")} />
              <Fact label="Saves" value={data.lifetime.savers.toLocaleString("en-GB")} />
              <Fact label="Reviews" value={data.lifetime.reviews.toLocaleString("en-GB")} />
              <Fact
                label="Average rating"
                value={data.lifetime.rating != null ? String(data.lifetime.rating) : "Not rated"}
              />
            </dl>
          </section>

          <p className="mt-8 text-[13px] leading-relaxed text-muted">
            Celpare counts a view when a tool page is opened. It does not track
            people across the web, and nothing here is shared with anybody else:
            another developer cannot see these numbers, and this page refuses to
            answer at all without a session.
          </p>
        </>
      )}
    </DeveloperShell>
  );
}

function Stat({
  label,
  value,
  note,
  sub,
}: {
  label: string;
  value: number;
  note: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border p-5">
      <span className="block text-[13px] text-muted">{label}</span>
      <span className="mt-1 block font-display text-[28px] font-semibold tabular-nums">
        {value.toLocaleString("en-GB")}
      </span>
      {/* The change is stated in words, never as a coloured arrow alone: a
          direction that exists only as a colour is invisible in greyscale, in
          forced colours and to a screen reader. */}
      <span className="mt-1 block text-[13px] text-muted">{note}</span>
      {sub ? <span className="mt-0.5 block text-[12px] text-muted">{sub}</span> : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background p-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-1 font-display text-[20px] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
