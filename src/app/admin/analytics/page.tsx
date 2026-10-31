import { requireAdmin } from "@/lib/admin/guard";
import { getCommunityAnalytics, getOverview } from "@/lib/admin/queries";
import { FilterTabs } from "@/components/admin/filters";
import { ErrorState, PageHeader } from "@/components/admin/ui";
import { MetricExplorer, type ExplorerMetric } from "@/components/analytics/metric-explorer";
import { KpiCard, KpiGrid } from "@/components/analytics/kpi";
import { Breakdown, InsightList, Panel } from "@/components/analytics/breakdown";
import { concentrationInsight, rank, rateInsight, trendInsights } from "@/lib/analytics/insights";
import { delta, splitPeriods, total, type DayPoint } from "@/lib/analytics/series";
import { getOnboardingSummary, type Count, type OnboardingSummary } from "@/lib/onboarding/server";
import { GOALS, HEARD_FROM, labelOf, ROLES, type Choice } from "@/lib/onboarding/options";

/*
  How people found Celpare and what they came for (phase ONB): the answers
  given after sign up, as counts. Accounts from before ONB were never asked,
  so these cover new accounts only. Campaign tags come from ?ref= links.
*/
function OnboardingBoard({ summary, periodLabel }: { summary: OnboardingSummary | null; periodLabel: string }) {
  if (!summary) {
    return (
      <div className="mt-5">
        <ErrorState what="sign up answers" />
      </div>
    );
  }
  const t = summary.totals;
  const rows = (list: Count[], labels?: readonly Choice[]) =>
    list.map((c) => ({ label: labels ? labelOf(labels, c.key) : c.key, value: c.count }));
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "None yet");

  return (
    <>
      <h2 className="mt-10 font-display text-[20px] font-medium tracking-[-0.02em]">How people found Celpare</h2>
      <p className="mt-1 text-[14px] text-muted">
        Answers to the questions after sign up, in the last {periodLabel}. New accounts only.
      </p>

      <KpiGrid className="mt-5">
        <KpiCard label="Asked" value={t.started.toLocaleString("en-GB")} caption={`of ${t.signups.toLocaleString("en-GB")} new accounts`} />
        <KpiCard label="Finished" value={pct(t.completed, t.started)} caption={`${t.completed} answered to the end`} />
        <KpiCard label="Said where they heard" value={pct(t.answered_heard, t.started)} caption={`${t.answered_heard} accounts`} />
      </KpiGrid>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Where they heard about Celpare" lead="The channel each new account named.">
          <Breakdown dimension="Channel" measure="Accounts" rows={rows(summary.heard_from, HEARD_FROM)} limit={13} empty="Nobody has answered yet." />
        </Panel>
        <Panel title="Campaign links" lead="Sign ups that arrived through a link with ?ref= or ?utm_source=.">
          <Breakdown dimension="Tag" measure="Accounts" rows={rows(summary.refs)} empty="No tagged links yet. Add ?ref=name to a link you post." />
        </Panel>
        <Panel title="Who they are" lead="What best describes them.">
          <Breakdown dimension="Role" measure="Accounts" rows={rows(summary.roles, ROLES)} limit={12} empty="Nobody has answered yet." />
        </Panel>
        <Panel title="What they came to do" lead="Every goal picked; one account can pick several.">
          <Breakdown dimension="Goal" measure="Accounts" rows={rows(summary.goals, GOALS)} empty="Nobody has answered yet." />
        </Panel>
        <Panel title="Interests" lead="Categories and topics picked.">
          <Breakdown dimension="Interest" measure="Accounts" rows={[...rows(summary.categories), ...rows(summary.topics)]} limit={12} empty="Nobody has answered yet." />
        </Panel>
        <Panel title="Tools they already use" lead="The catalogue tools new accounts said they use.">
          <Breakdown dimension="Tool" measure="Accounts" rows={rows(summary.tools)} empty="Nobody has answered yet." />
        </Panel>
        {summary.heard_other.length > 0 ? (
          <Panel title="Somewhere else" lead="What people typed when no channel fitted.">
            <Breakdown dimension="Answer" measure="Accounts" rows={rows(summary.heard_other)} />
          </Panel>
        ) : null}
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";

const WINDOWS = [7, 30, 90];

/*
  Community analytics, as an overview board in the Google Analytics manner
  (founder, 2026-10-01): metric tabs with their change on the previous period,
  one chart for the selected metric with the previous period dashed behind it,
  written insights, and breakdown tables.

  THE PREVIOUS PERIOD IS A SECOND READ over twice the window, split in two, so
  the comparison is day for day over the same length. admin_community_analytics
  clamps at 365 days, so 90 doubled is inside it. Topics and creators come from
  the plain window read, so they never mix two periods.

  Daily active is counted as "signed in and did something that leaves a row",
  not as "loaded a page". There is no page view tracking, and inventing one
  from session refreshes would measure cookie lifetime. D13 and D30: nothing
  here is sampled, estimated or seeded.
*/
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await requireAdmin("analytics.read");
  const sp = await searchParams;
  const days = WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 30;

  const [community, doubled, overview, onboarding] = await Promise.all([
    getCommunityAnalytics(session.db, days),
    getCommunityAnalytics(session.db, days * 2),
    getOverview(session.db),
    getOnboardingSummary(session.db, days),
  ]);

  if (!community) {
    return (
      <>
        <PageHeader title="Community analytics" />
        <div className="mt-6">
          <ErrorState what="community analytics" />
        </div>
      </>
    );
  }

  /* The doubled read failing costs the comparison, not the page. */
  const source = doubled ?? community;
  type Key = Exclude<keyof (typeof community.by_day)[number], "day">;
  const periods = (key: Key) => {
    const pts: DayPoint[] = source.by_day.map((d) => ({ day: d.day, value: Number(d[key] ?? 0) }));
    const split = splitPeriods(pts, days);
    return { current: split.current, previous: doubled ? split.previous : undefined };
  };

  const series = {
    posts: periods("posts"),
    comments: periods("comments"),
    likes: periods("likes"),
    reposts: periods("reposts"),
    saves: periods("saves"),
    signups: periods("signups"),
    active: periods("active_users"),
  };

  const metrics: ExplorerMetric[] = [
    { key: "active", label: "Avg daily active", noun: "active people", aggregate: "avg", ...series.active },
    { key: "posts", label: "Posts", noun: "posts", ...series.posts },
    { key: "comments", label: "Comments", noun: "comments", ...series.comments },
    { key: "likes", label: "Likes", noun: "likes", ...series.likes },
    { key: "reposts", label: "Reposts", noun: "reposts", ...series.reposts },
    { key: "saves", label: "Saves", noun: "saves", ...series.saves },
    { key: "signups", label: "New accounts", noun: "new accounts", ...series.signups },
  ];

  const sum = (k: keyof typeof series) => total(series[k].current);
  const sumPrev = (k: keyof typeof series) => total(series[k].previous ?? []);
  const posts = sum("posts");
  const interactions = sum("likes") + sum("comments") + sum("reposts") + sum("saves");
  const prevPosts = sumPrev("posts");
  const prevInteractions = sumPrev("likes") + sumPrev("comments") + sumPrev("reposts") + sumPrev("saves");
  const perPost = posts === 0 ? 0 : interactions / posts;
  const prevPerPost = prevPosts === 0 ? 0 : prevInteractions / prevPosts;
  const peakActive = Math.max(0, ...series.active.current.map((d) => d.value));
  const totalUsers = overview?.users?.total ?? 0;
  const periodLabel = `${days} days`;

  const topics = community.by_topic.filter((t) => t.posts > 0);

  const insights = rank([
    ...trendInsights({ noun: "posts", current: series.posts.current, previous: series.posts.previous, periodLabel }),
    ...trendInsights({ noun: "new accounts", current: series.signups.current, previous: series.signups.previous, periodLabel }).filter(
      (i) => i.kind !== "quiet",
    ),
    ...trendInsights({ noun: "likes", current: series.likes.current, previous: series.likes.previous, periodLabel }).filter(
      (i) => i.kind === "up" || i.kind === "down",
    ),
    ...concentrationInsight({
      rows: topics.map((t) => ({ label: t.name, value: t.posts })),
      noun: "posts",
      verb: "had",
    }),
    ...rateInsight({
      numerator: peakActive,
      denominator: totalUsers,
      sentence: (r) => `${r} of accounts were active on the busiest day`,
      beforeLabel: "",
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Community analytics"
        lead="Counted from live rows, day by day. Nothing sampled, nothing estimated."
      />

      <div className="mt-5">
        <FilterTabs
          label="Time window"
          active={`/admin/analytics?days=${days}`}
          items={WINDOWS.map((d) => ({
            href: `/admin/analytics?days=${d}`,
            label: `${d} days`,
          }))}
        />
      </div>

      <MetricExplorer
        className="mt-5"
        metrics={metrics}
        currentLabel={`Last ${days} days`}
        previousLabel={`Previous ${days} days`}
      />

      <InsightList className="mt-5" insights={insights} />

      <KpiGrid className="mt-5">
        <KpiCard
          label="Interactions per post"
          value={posts === 0 ? "None yet" : perPost.toFixed(1)}
          delta={posts > 0 && prevPosts > 0 ? delta(perPost, prevPerPost) : undefined}
          against={`the previous ${periodLabel}`}
          caption="Likes, comments, reposts and saves, divided by posts"
        />
        <KpiCard
          label="Peak daily active"
          value={peakActive.toLocaleString("en-GB")}
          caption={totalUsers > 0 ? `of ${totalUsers.toLocaleString("en-GB")} accounts` : undefined}
        />
        <KpiCard
          label="Interactions"
          value={interactions.toLocaleString("en-GB")}
          delta={doubled ? delta(interactions, prevInteractions) : undefined}
          against={`the previous ${periodLabel}`}
          caption={`Last ${periodLabel}`}
        />
        <KpiCard
          label="Accounts"
          value={totalUsers.toLocaleString("en-GB")}
          caption="All time"
        />
      </KpiGrid>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Topics" lead={`Posts in the last ${periodLabel}, with comments beside them.`}>
          <Breakdown
            dimension="Topic"
            measure="Posts"
            extraLabel="Comments"
            rows={topics.map((t) => ({ label: t.name, value: t.posts, extra: t.comments }))}
            empty="No posts with a topic in this period."
          />
        </Panel>

        <Panel title="Top creators" lead={`Posts in the last ${periodLabel}, with likes beside them.`}>
          <Breakdown
            dimension="Creator"
            measure="Posts"
            extraLabel="Likes"
            rows={community.top_creators.map((c) => ({
              label: c.username ?? "Unnamed account",
              value: c.posts,
              extra: c.likes,
              href: session.can("users.read") ? `/admin/users/${c.user_id}` : undefined,
            }))}
            empty="Nobody has posted in this period."
          />
        </Panel>
      </div>

      <OnboardingBoard summary={onboarding} periodLabel={periodLabel} />

      <p className="mt-6 text-[12px] leading-relaxed text-muted">
        Active means signed in and did something that leaves a row: posted, commented, liked,
        reposted or started a conversation. A session refresh is not activity.
      </p>
    </>
  );
}
