import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { KpiCard, KpiGrid } from "@/components/analytics/kpi";
import { TrendChart } from "@/components/analytics/trend-chart";
import { Benchmark, Breakdown, Funnel, InsightList, Panel } from "@/components/analytics/breakdown";
import { concentrationInsight, rank, rateInsight, type Insight } from "@/lib/analytics/insights";
import { delta, percent, resampleCumulative } from "@/lib/analytics/series";
import { relativeTime } from "@/lib/format";
import { createClient, getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { RULE_WORDS, STAGE_WORDS, type Stage } from "@/lib/community/intelligence/lifecycle";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Post insights",
  robots: { index: false, follow: false },
};

/*
  How a post travelled, for its author only (D148). Rebuilt as an analytics
  board on 2026-10-01 (founder: insight like Google Analytics, not only
  characters and numbers): headline numbers, written insights, a reach chart,
  breakdowns, a benchmark against the author's usual and a watch funnel.

  my_post_insights() answers only for the post's author and returns null for
  anybody else, and this page turns that null into a 404 rather than a refusal,
  so it does not confirm there is anything to hide. Every number is read from
  the database: nothing is estimated, smoothed or projected (D13). Where there
  is too little to say, the page says that instead.
*/

type Totals = {
  viewers: number;
  likes: number;
  comments: number;
  reposts: number;
  saves: number;
  shares: number;
  follows: number;
  profile_visits: number;
  link_clicks: number;
  video_starts: number;
  completions: number;
  rewatches: number;
  watch_avg: number | null;
  dwell_avg: number | null;
  units: number;
};

type Baseline = {
  posts_used: number;
  engagement_rate: number | null;
  comment_rate: number | null;
  save_rate: number | null;
  share_rate: number | null;
};

type Insights = {
  post_id: string;
  created_at: string;
  kind: string;
  state: { stage: Stage; wave: number; stage_since: string; perf_score: number | null; computed_at: string } | null;
  totals: Totals | null;
  baseline: Baseline | null;
  history: { at: string; viewers: number }[];
  events: { from: string | null; to: Stage; wave: number; at: string; rule: string | null; viewers: number | null }[];
  sources: Record<string, number> | null;
};

/* Enough viewers for a rate to say something, and enough settled posts for
   "your usual" to be one. Below either, the comparison is not shown. */
const MIN_VIEWERS_FOR_RATES = 5;
const MIN_POSTS_FOR_USUAL = 3;

const SOURCE_LABELS: Record<string, string> = {
  for_you: "For you",
  following: "Following",
  video: "Video viewer",
  profile: "Your profile",
  explore: "Explore",
  search: "Search",
  other: "Topics and links",
};

/*
  Reach as it grew: the stored snapshots of the cumulative viewer count, read
  off hourly for a post under three days old and daily after that, so the x
  axis is even time. Cumulative never falls, so a dip in the snapshots (a
  viewer row removed) is held level rather than drawn as people un-seeing it.
*/
const HOUR = 3_600_000;
function reach(createdAt: string, history: Insights["history"]) {
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / HOUR;
  const hourly = ageHours < 72;
  const points = resampleCumulative(
    createdAt,
    history.map((h) => ({ at: h.at, value: h.viewers })),
    hourly ? HOUR : 24 * HOUR,
  );
  return { points, hourly };
}

export default async function PostInsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSupabaseConfigured()) notFound();

  const user = await getCurrentUser();
  if (!user) notFound();

  const db = await createClient();
  const { data, error } = await db.rpc("my_post_insights", { p_post_id: id });
  /* A failed read is an error, never an empty page (RESUME rule 13). */
  if (error) throw new Error(`Post insights could not be read: ${error.message}`);
  const insights = data as Insights | null;
  if (!insights) notFound();

  const t = insights.totals;
  const viewers = t?.viewers ?? 0;
  const isVideo = insights.kind === "video";
  const usual = insights.baseline && insights.baseline.posts_used >= MIN_POSTS_FOR_USUAL ? insights.baseline : null;
  const canRate = viewers >= MIN_VIEWERS_FOR_RATES;

  const interactions = t ? t.likes + t.comments + t.reposts + t.saves + t.shares : 0;
  const engagementPerView = t && viewers > 0 ? t.units / viewers : 0;

  const { points, hourly } = reach(insights.created_at, insights.history);

  const sources = Object.entries(insights.sources ?? {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: SOURCE_LABELS[k] ?? k, value: v }));

  const interactionRows = t
    ? [
        { label: "Likes", value: t.likes },
        { label: "Comments", value: t.comments },
        { label: "Reposts", value: t.reposts },
        { label: "Saves", value: t.saves },
        { label: "Shares", value: t.shares },
        { label: "Profile visits", value: t.profile_visits },
        { label: "Link clicks", value: t.link_clicks },
        { label: "Follows", value: t.follows },
      ]
    : [];

  const benchmark =
    t && usual && canRate
      ? [
          { label: "Engagement per view", mine: engagementPerView, usual: usual.engagement_rate, format: (n: number) => n.toFixed(2) },
          { label: "Comments per view", mine: t.comments / viewers, usual: usual.comment_rate },
          { label: "Saves per view", mine: t.saves / viewers, usual: usual.save_rate },
          { label: "Shares per view", mine: t.shares / viewers, usual: usual.share_rate },
        ].flatMap((r) => (r.usual !== null ? [{ ...r, usual: r.usual }] : []))
      : [];

  const found: Insight[] = [];
  if (t && usual?.engagement_rate && canRate) {
    const ratio = engagementPerView / usual.engagement_rate;
    if (ratio >= 1.25 || ratio <= 0.8) {
      found.push({
        kind: ratio >= 1 ? "up" : "down",
        title: ratio >= 1 ? `Engagement is ${ratio.toFixed(1)} times your usual` : "Engagement is below your usual",
        detail: `Per view, against the average of your last ${usual.posts_used} settled posts.`,
        weight: 95,
      });
    }
  }
  if (t) {
    found.push(
      ...rateInsight({
        numerator: t.saves,
        denominator: viewers,
        sentence: (r) => `${r} of viewers saved it`,
        before: usual?.save_rate,
        beforeLabel: "your usual",
      }).filter(() => t.saves > 0),
      ...rateInsight({
        numerator: t.follows,
        denominator: viewers,
        sentence: (r) => `${r} of viewers followed you from it`,
        beforeLabel: "",
      }).filter(() => t.follows > 0),
    );
    if (isVideo && t.video_starts >= MIN_VIEWERS_FOR_RATES) {
      found.push({
        kind: "rate",
        title: `${percent(t.completions / t.video_starts)} of plays were watched to the end`,
        detail: t.watch_avg !== null ? `On average people watched ${Math.round(t.watch_avg)}% of it.` : undefined,
        weight: 85,
      });
    }
  }
  found.push(...concentrationInsight({ rows: sources, noun: "views", verb: "brought" }));
  if (insights.state && insights.state.wave > 1) {
    found.push({
      kind: "first",
      title: `Shown to wave ${insights.state.wave} of readers`,
      detail: "It did well enough with earlier audiences to be shown to a wider one.",
      weight: 65,
    });
  }
  const ranked = rank(found);

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />} signedIn>
      <Container className="max-w-[960px] py-5 sm:py-8">
        <BackLink href={`/community/${id}`} label="Back to the post" className="mb-5" />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-medium tracking-tight">Post insights</h1>
            <p className="mt-1 text-[14px] text-muted">
              Posted {relativeTime(insights.created_at)}. Only you can see this page.
            </p>
          </div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-elevated px-3 py-1.5 text-[13px]">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />
            <span className="font-medium">{insights.state ? STAGE_WORDS[insights.state.stage] : "Getting ready"}</span>
            {insights.state ? <span className="text-muted">since {relativeTime(insights.state.stage_since)}</span> : null}
          </p>
        </div>

        <KpiGrid className="mt-6">
          <KpiCard label="Views" value={viewers.toLocaleString("en-GB")} caption="People who saw it" />
          <KpiCard
            label="Engagement rate"
            value={viewers > 0 ? percent(interactions / viewers) : "None yet"}
            delta={usual?.engagement_rate && canRate ? delta(engagementPerView, usual.engagement_rate) : undefined}
            against="your usual"
            caption={usual && canRate ? "Interactions per view, change against your usual" : "Interactions per view"}
          />
          <KpiCard label="Interactions" value={interactions.toLocaleString("en-GB")} caption="Likes, comments, reposts, saves, shares" />
          <KpiCard
            label="Follows from it"
            value={(t?.follows ?? 0).toLocaleString("en-GB")}
            caption={`${(t?.profile_visits ?? 0).toLocaleString("en-GB")} profile visits`}
          />
        </KpiGrid>

        <InsightList className="mt-5" insights={ranked} />

        <Panel className="mt-5" title="Reach over time" lead="Everyone who has seen it, counted as it grew.">
          {points.length > 1 ? (
            <TrendChart current={points} noun="viewers" xFormat={hourly ? "time" : "day"} height={220} />
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
              The first numbers appear within a few minutes of posting.
            </p>
          )}
        </Panel>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel title="What people did" lead="Every interaction with this post.">
            <Breakdown dimension="Interaction" measure="Count" rows={interactionRows} empty="No interactions yet." />
          </Panel>
          <Panel title="Where views came from" lead="The surface each viewer found it on.">
            <Breakdown dimension="Source" measure="Views" rows={sources} empty="No views recorded yet." />
          </Panel>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel title="Compared with your usual" lead="This post per view. The tick is your usual.">
            {benchmark.length > 0 ? (
              <Benchmark rows={benchmark} />
            ) : (
              <p className="text-[13px] text-muted">
                {!canRate
                  ? "Too few people have seen this post to compare it yet."
                  : "Your usual appears once you have a few posts that are a day old or more."}
              </p>
            )}
          </Panel>

          {isVideo ? (
            <Panel title="Watching" lead="From seeing it to finishing it.">
              {t && t.video_starts > 0 ? (
                <>
                  <Funnel
                    steps={[
                      { label: "Saw it", value: viewers },
                      { label: "Played it", value: t.video_starts },
                      { label: "Finished it", value: t.completions },
                    ]}
                  />
                  <p className="mt-3 text-[12px] text-muted">
                    {t.watch_avg !== null ? `Average watched: ${Math.round(t.watch_avg)}%. ` : ""}
                    {t.rewatches > 0 ? `${t.rewatches} watched it again.` : ""}
                  </p>
                </>
              ) : (
                <p className="text-[13px] text-muted">Nobody has played it yet.</p>
              )}
            </Panel>
          ) : (
            <Panel title="What happened" lead="Each step it took through distribution.">
              <Journey events={insights.events} />
            </Panel>
          )}
        </div>

        {isVideo ? (
          <Panel className="mt-5" title="What happened" lead="Each step it took through distribution.">
            <Journey events={insights.events} />
          </Panel>
        ) : null}
      </Container>
    </AppShell>
  );
}

function Journey({ events }: { events: Insights["events"] }) {
  if (events.length === 0) return <p className="text-[13px] text-muted">Nothing yet.</p>;
  return (
    <ol className="relative space-y-4 ps-5 before:absolute before:inset-y-1 before:start-[5px] before:w-px before:bg-border">
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative text-[14px]">
          <span
            aria-hidden
            className="absolute -start-5 top-1.5 size-[11px] rounded-full border-2 border-elevated bg-[var(--chart-line)]"
          />
          <p className="font-medium">{STAGE_WORDS[e.to] ?? e.to}</p>
          <p className="text-[13px] text-muted">
            {e.rule && RULE_WORDS[e.rule] ? `${RULE_WORDS[e.rule]}. ` : ""}
            {relativeTime(e.at)}
            {e.viewers != null ? `, at ${e.viewers.toLocaleString("en-GB")} viewers` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
