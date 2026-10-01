import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import { KpiCard, KpiGrid } from "@/components/analytics/kpi";
import { TrendChart } from "@/components/analytics/trend-chart";
import { Breakdown, Funnel, InsightList, Panel } from "@/components/analytics/breakdown";
import { concentrationInsight, rank, rateInsight, trendInsights, type Insight } from "@/lib/analytics/insights";
import { delta, densifyDays, percent, splitPeriods } from "@/lib/analytics/series";
import {
  ANALYTICS_WINDOWS,
  gate,
  getToolAnalytics,
  getToolViewsByDay,
  isAnalyticsWindow,
  type AnalyticsWindow,
} from "@/lib/developer/queries";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/*
  The developer analytics board, rebuilt in the Google Analytics manner on
  2026-10-01 (founder: insight, not only characters and numbers): headline
  numbers with their change, a views chart with the previous period dashed
  behind it, written insights, a views to saves funnel, and breakdown tables
  for tools, surfaces and searches.

  EVERY NUMBER ON THIS PAGE IS A COUNT OF REAL ROWS. Nothing is estimated,
  nothing is projected, and a zero renders as a zero (D13, D30). The insights
  are fixed rules over those counts (lib/analytics/insights.ts), and a rule
  with too little to go on says nothing.

  The range lives in the URL rather than in state, so a range is a place: it
  survives a reload, it can be linked to somebody, and the back button works.

  The 24 hour range has one day in it, which is not a chart. Its chart shows
  the last 7 days instead and says so.
*/

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
  const chartDays = days === 1 ? 7 : days;

  const [data, doubled] = await Promise.all([
    getToolAnalytics(db!, days),
    getToolViewsByDay(db!, chartDays * 2),
  ]);
  const windowLabel = ANALYTICS_WINDOWS.find((w) => w.days === days)?.label ?? "Last 7 days";
  const periodLabel = days === 1 ? "24 hours" : `${days} days`;
  const against = `the previous ${periodLabel}`;

  const split = doubled ? splitPeriods(doubled, chartDays) : null;
  const current = split?.current ?? densifyDays(data.by_day, chartDays);
  const previous = split?.previous;

  const { views, savers, viewers, reviews } = data.totals;
  const saveRate = views > 0 ? savers / views : 0;
  const prevSaveRate = data.previous.views > 0 ? data.previous.savers / data.previous.views : 0;

  const sources = data.by_source.map((s) => ({ label: SOURCE_LABEL[s.label] ?? s.label, value: s.value }));

  const insights: Insight[] = rank([
    ...trendInsights({
      noun: "views",
      current,
      previous,
      periodLabel: `${chartDays} days`,
    }),
    ...concentrationInsight({ rows: sources, noun: "views", verb: "brought" }),
    ...concentrationInsight({ rows: data.by_tool.map((t) => ({ label: t.name, value: t.value })), noun: "views", verb: "drew" }),
    ...rateInsight({
      numerator: savers,
      denominator: views,
      sentence: (r) => `${r} of views ended in a save`,
      before: data.previous.views >= 5 ? prevSaveRate : null,
      beforeLabel: against,
    }),
    ...(savers === 0 && views >= 5
      ? [
          {
            kind: "quiet" as const,
            title: `None of the ${views.toLocaleString("en-GB")} views ended in a save yet`,
            detail: "A save is the clearest sign someone means to come back to a tool.",
            weight: 55,
          },
        ]
      : []),
    ...(data.by_query[0]
      ? [
          {
            kind: "source" as const,
            title: `Top search: "${data.by_query[0].label}"`,
            detail: `${data.by_query[0].value.toLocaleString("en-GB")} views came from it. These are the words people use for the job your tool does.`,
            weight: 60,
          },
        ]
      : []),
  ]);

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
          {/* Real links, not buttons, in one row above everything they filter. */}
          <div role="group" aria-label="Time range" className="flex flex-wrap gap-2">
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

          <KpiGrid className="mt-6">
            <KpiCard
              label="Tool views"
              value={views.toLocaleString("en-GB")}
              delta={delta(views, data.previous.views)}
              against={against}
              caption={windowLabel}
            />
            <KpiCard
              label="Signed in viewers"
              value={viewers.toLocaleString("en-GB")}
              caption="People, not visits. Signed out views count above only."
            />
            <KpiCard
              label="Saves"
              value={savers.toLocaleString("en-GB")}
              delta={delta(savers, data.previous.savers)}
              against={against}
              caption={views > 0 ? `${percent(saveRate)} of views` : windowLabel}
            />
            <KpiCard
              label="Reviews"
              value={reviews.toLocaleString("en-GB")}
              delta={delta(reviews, data.previous.reviews)}
              against={against}
              caption={data.lifetime.rating != null ? `${data.lifetime.rating} average, all time` : "Not rated yet"}
            />
          </KpiGrid>

          <Panel
            className="mt-5"
            title="Views over time"
            lead={
              days === 1
                ? "Daily views for the last 7 days, with the 7 days before dashed. A single day is not a trend."
                : "Every time somebody opened one of your tool pages, with the period before dashed behind it."
            }
          >
            <TrendChart
              current={current}
              previous={previous}
              noun="views"
              currentLabel={`Last ${chartDays} days`}
              previousLabel={`Previous ${chartDays} days`}
            />
          </Panel>

          <InsightList className="mt-5" insights={insights} />

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Panel title="Which tool" lead="Views in this range, with saves beside them.">
              <Breakdown
                dimension="Tool"
                measure="Views"
                extraLabel="Saves"
                rows={data.by_tool.map((t) => ({
                  label: t.name,
                  value: t.value,
                  extra: t.saves,
                  href: `/tools/${t.slug}`,
                }))}
                empty="No views of your tools in this range."
              />
            </Panel>

            <Panel title="How they arrived" lead="The surface each view came from.">
              <Breakdown dimension="Source" measure="Views" rows={sources} empty="No views in this range." />
            </Panel>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Panel
              title="What they searched for"
              lead="The search that led somebody to one of your tools, in their words rather than yours."
            >
              <Breakdown
                dimension="Search"
                measure="Views"
                rows={data.by_query.map((q) => ({ label: q.label, value: q.value }))}
                empty="Nobody reached your tools from a search in this range. Direct links and Explore carry no search term."
              />
            </Panel>

            <Panel title="From view to save" lead="How many of the views in this range turned into a save.">
              <Funnel
                steps={[
                  { label: "Tool views", value: views },
                  { label: "Saves", value: savers },
                ]}
              />
              {data.previous.views > 0 ? (
                <p className="mt-3 text-[12px] text-muted">
                  {percent(prevSaveRate)} in {against}.
                </p>
              ) : null}
            </Panel>
          </div>

          <Panel className="mt-5" title="All time" lead="Since your first tool went live. These do not move with the range.">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
              <Fact label="Views" value={data.lifetime.views.toLocaleString("en-GB")} />
              <Fact label="Saves" value={data.lifetime.savers.toLocaleString("en-GB")} />
              <Fact label="Reviews" value={data.lifetime.reviews.toLocaleString("en-GB")} />
              <Fact
                label="Average rating"
                value={data.lifetime.rating != null ? String(data.lifetime.rating) : "Not rated"}
              />
            </dl>
          </Panel>

          <p className="mt-6 text-[12px] leading-relaxed text-muted">
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-elevated p-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-1 text-[20px] font-medium tracking-[-0.02em]">{value}</dd>
    </div>
  );
}
