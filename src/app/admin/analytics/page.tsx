import { requireAdmin } from "@/lib/admin/guard";
import { getCommunityAnalytics, getOverview } from "@/lib/admin/queries";
import { RankedBars, TimeSeries } from "@/components/ui/charts";
import { FilterTabs } from "@/components/admin/filters";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Section,
  Stat,
  StatGrid,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 30, 90];

/*
  Community analytics.

  Daily active is counted as "signed in and did something that leaves a row",
  not as "loaded a page". That is a narrower definition than most products use
  and it is the honest one available here: there is no page view tracking, and
  inventing one from session refreshes would produce a number that looks like
  engagement and measures cookie lifetime.

  The feed has no composer yet, so almost all of this is genuinely zero. It says
  so rather than drawing flat lines that read as a dead platform. D13 and D30.
*/
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await requireAdmin("analytics.read");
  const sp = await searchParams;
  const days = WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 30;

  const [community, overview] = await Promise.all([
    getCommunityAnalytics(session.db, days),
    getOverview(session.db),
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

  const sum = (key: keyof (typeof community.by_day)[number]) =>
    community.by_day.reduce((total, d) => total + Number(d[key] ?? 0), 0);

  const posts = sum("posts");
  const comments = sum("comments");
  const likes = sum("likes");
  const reposts = sum("reposts");
  const saves = sum("saves");
  const signups = sum("signups");

  const peakActive = Math.max(0, ...community.by_day.map((d) => d.active_users));
  const totalUsers = overview?.users?.total ?? 0;

  /* Engagement per post rather than a percentage of an audience nobody has
     measured. A rate needs a denominator that means something, and "how much
     did each post get" is one this data can actually support. */
  const perPost = posts === 0 ? 0 : (likes + comments + reposts + saves) / posts;

  const empty = posts === 0 && comments === 0 && likes === 0;

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

      <Section title={`Last ${days} days`}>
        <StatGrid>
          <Stat label="Posts" value={posts} />
          <Stat label="Comments" value={comments} />
          <Stat label="Likes" value={likes} />
          <Stat label="Reposts" value={reposts} />
          <Stat label="Saves" value={saves} />
          <Stat label="New accounts" value={signups} />
          <Stat
            label="Peak daily active"
            value={peakActive}
            hint={totalUsers > 0 ? `of ${totalUsers.toLocaleString("en-GB")} accounts` : undefined}
          />
          <Stat
            label="Engagement per post"
            value={posts === 0 ? "−" : perPost.toFixed(1)}
            hint={
              posts === 0
                ? "Needs at least one post"
                : "Likes, comments, reposts and saves, divided by posts"
            }
          />
        </StatGrid>
      </Section>

      {empty ? (
        <div className="mt-6">
          <EmptyState
            title="The feed has not opened yet"
            body="Posts, comments, likes, saves, reposts, follows, reporting and auto hide are all live in the database and verified. There is no composer, so nobody can write a post. These charts fill in on their own once that ships, and nothing here is ever seeded to look busier."
          />
        </div>
      ) : (
        <>
          <Section title="Activity">
            <div className="grid gap-3 lg:grid-cols-2">
              <TimeSeries
                label="Posts per day"
                unit="posts"
                points={community.by_day.map((d) => ({ day: d.day, value: d.posts }))}
              />
              <TimeSeries
                label="Comments per day"
                unit="comments"
                points={community.by_day.map((d) => ({ day: d.day, value: d.comments }))}
              />
              <TimeSeries
                label="Likes per day"
                unit="likes"
                points={community.by_day.map((d) => ({ day: d.day, value: d.likes }))}
              />
              <TimeSeries
                label="Reposts per day"
                unit="reposts"
                points={community.by_day.map((d) => ({ day: d.day, value: d.reposts }))}
              />
            </div>
          </Section>
        </>
      )}

      <Section
        title="Daily active people"
        lead="Signed in and did something that leaves a row: posted, commented, liked, reposted or started a conversation. A session refresh is not activity."
      >
        <TimeSeries
          label="Active people per day"
          unit="people"
          points={community.by_day.map((d) => ({ day: d.day, value: d.active_users }))}
        />
      </Section>

      <Section
        title="New accounts"
        lead="Signups per day, which is the one series here that is not waiting on the composer."
      >
        <TimeSeries
          label="Signups per day"
          unit="accounts"
          points={community.by_day.map((d) => ({ day: d.day, value: d.signups }))}
        />
      </Section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Section title="Topics" className="mt-0">
          <RankedBars
            valueLabel="posts"
            rows={community.by_topic
              .filter((t) => t.posts > 0)
              .map((t) => ({
                label: t.name,
                value: t.posts,
                secondary: `${t.comments} comments, ${t.likes} likes`,
              }))}
            emptyMessage="The eleven topics are seeded and ready. A topic is structure rather than content, so seeding those was never the same thing as seeding posts."
          />
        </Section>

        <Section title="Top creators" className="mt-0">
          <RankedBars
            valueLabel="posts"
            rows={community.top_creators.map((c) => ({
              label: c.username ?? "Unnamed account",
              value: c.posts,
              secondary: `${c.likes} likes, ${c.comments} comments`,
              href: session.can("users.read") ? `/admin/users/${c.user_id}` : undefined,
            }))}
            emptyMessage="Nobody has posted yet. There will be no seeded authors here: a fake post is attributed to a person who does not exist."
          />
        </Section>
      </div>
    </>
  );
}
