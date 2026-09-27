import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { ShareBar, TimeSeries, type SeriesPoint } from "@/components/ui/charts";
import { relativeTime } from "@/lib/format";
import { createClient, getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { RULE_WORDS, STAGE_WORDS, type Stage } from "@/lib/community/intelligence/lifecycle";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Post insights",
  robots: { index: false, follow: false },
};

/*
  How a post travelled, for its author only (D148).

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

function dailyNewViewers(history: Insights["history"]): SeriesPoint[] {
  const byDay = new Map<string, number>();
  for (const h of history) {
    const day = h.at.slice(0, 10);
    byDay.set(day, Math.max(byDay.get(day) ?? 0, h.viewers));
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  let before = 0;
  return days.map(([day, cumulative]) => {
    const value = Math.max(0, cumulative - before);
    before = Math.max(before, cumulative);
    return { day, value };
  });
}

function pct(n: number): string {
  return `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
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
  const series = dailyNewViewers(insights.history);
  const sources = Object.entries(insights.sources ?? {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ label: SOURCE_LABELS[k] ?? k, value: v }));

  const compare =
    t && usual && viewers >= MIN_VIEWERS_FOR_RATES
      ? [
          { label: "Engagement per view", mine: t.units / viewers, theirs: usual.engagement_rate, unit: "units" },
          { label: "Comments per view", mine: t.comments / viewers, theirs: usual.comment_rate, unit: "rate" },
          { label: "Saves per view", mine: t.saves / viewers, theirs: usual.save_rate, unit: "rate" },
          { label: "Shares per view", mine: t.shares / viewers, theirs: usual.share_rate, unit: "rate" },
        ].filter((r) => r.theirs !== null)
      : [];

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />} signedIn>
      <Container className="max-w-[640px] py-5 sm:py-8">
        <BackLink href={`/community/${id}`} label="Back to the post" className="mb-5" />

        <h1 className="text-[24px] font-medium tracking-tight">Post insights</h1>
        <p className="mt-1 text-[14px] text-muted">
          Posted {relativeTime(insights.created_at)}. Only you can see this page.
        </p>

        <section aria-labelledby="stage" className="mt-6 rounded-2xl border border-border p-4">
          <h2 id="stage" className="text-[13px] text-muted">
            Where it is now
          </h2>
          <p className="mt-1 flex items-center gap-2 text-[16px] font-medium">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />
            {insights.state ? STAGE_WORDS[insights.state.stage] : "Getting ready"}
          </p>
          {insights.state ? (
            <p className="mt-1 text-[13px] text-muted">
              Since {relativeTime(insights.state.stage_since)}. Updated {relativeTime(insights.state.computed_at)}.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="numbers" className="mt-6">
          <h2 id="numbers" className="text-[15px] font-medium">
            So far
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ["Views", viewers],
              ["Likes", t?.likes ?? 0],
              ["Comments", t?.comments ?? 0],
              ["Reposts", t?.reposts ?? 0],
              ["Saves", t?.saves ?? 0],
              ["Shares", t?.shares ?? 0],
              ["Follows from this post", t?.follows ?? 0],
              ["Profile visits", t?.profile_visits ?? 0],
              ["Link clicks", t?.link_clicks ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border px-3 py-2.5">
                <dt className="text-[12px] text-muted">{label}</dt>
                <dd className="tnum mt-0.5 text-[18px] font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {isVideo ? (
          <section aria-labelledby="watching" className="mt-6">
            <h2 id="watching" className="text-[15px] font-medium">
              Watching
            </h2>
            {t && t.video_starts > 0 ? (
              <p className="mt-2 text-[14px]">
                {t.video_starts} {t.video_starts === 1 ? "person" : "people"} started it,{" "}
                {pct(t.completions / t.video_starts)} finished it
                {t.watch_avg !== null ? `, and on average people watched ${Math.round(t.watch_avg)}%` : ""}.
                {t.rewatches > 0 ? ` ${t.rewatches} watched it again.` : ""}
              </p>
            ) : (
              <p className="mt-2 text-[14px] text-muted">Nobody has played it yet.</p>
            )}
          </section>
        ) : null}

        <section aria-labelledby="over-time" className="mt-6">
          <h2 id="over-time" className="sr-only">
            New viewers by day
          </h2>
          {series.length > 0 ? (
            <TimeSeries points={series} label="New viewers by day" windowDays={7} />
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted">
              The first numbers appear within a few minutes of posting.
            </p>
          )}
        </section>

        <section aria-labelledby="usual" className="mt-6">
          <h2 id="usual" className="text-[15px] font-medium">
            Compared with your usual
          </h2>
          {compare.length > 0 ? (
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
              {compare.map((r) => {
                const better = r.theirs !== null && r.mine > r.theirs * 1.1;
                const worse = r.theirs !== null && r.mine < r.theirs * 0.9;
                return (
                  <li key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-4 px-3 py-2.5 text-[14px]">
                    <span>{r.label}</span>
                    <span className="tnum text-muted">
                      {r.unit === "rate" ? pct(r.mine) : r.mine.toFixed(2)} this post, {r.unit === "rate" ? pct(r.theirs ?? 0) : (r.theirs ?? 0).toFixed(2)} usually
                      <span className="ms-2 text-foreground">{better ? "higher" : worse ? "lower" : "about the same"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-muted">
              {viewers < MIN_VIEWERS_FOR_RATES
                ? "Too few people have seen this post to compare it yet."
                : "Your usual appears once you have a few posts that are a day old or more."}
            </p>
          )}
        </section>

        <section aria-labelledby="journey" className="mt-6">
          <h2 id="journey" className="text-[15px] font-medium">
            What happened
          </h2>
          {insights.events.length > 0 ? (
            <ol className="mt-3 space-y-3 border-s border-border ps-4">
              {insights.events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="text-[14px]">
                  <p className="font-medium">{STAGE_WORDS[e.to] ?? e.to}</p>
                  <p className="text-[13px] text-muted">
                    {e.rule && RULE_WORDS[e.rule] ? `${RULE_WORDS[e.rule]}. ` : ""}
                    {relativeTime(e.at)}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-[14px] text-muted">Nothing yet.</p>
          )}
        </section>

        <section aria-labelledby="sources" className="mt-6 mb-4">
          <h2 id="sources" className="text-[15px] font-medium">
            Where views came from
          </h2>
          {sources.length > 0 ? (
            <ShareBar parts={sources} className="mt-3" />
          ) : (
            <p className="mt-2 text-[14px] text-muted">No views recorded yet.</p>
          )}
        </section>
      </Container>
    </AppShell>
  );
}
