import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { getCommunityAnalytics, getOverview } from "@/lib/admin/queries";
import { getHealth } from "@/lib/admin/health";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Section,
  Stat,
  StatGrid,
  Status,
  When,
} from "@/components/admin/ui";
import { ShareBar, TimeSeries } from "@/components/ui/charts";

export const dynamic = "force-dynamic";

/*
  The overview.

  Structured by what a person is coming here to find out, in the order they are
  likely to want it: is anything on fire, is anything waiting for me, and then
  the numbers. A dashboard that leads with a grid of totals buries the two rows
  that actually need a decision.

  Sections a role cannot read are absent rather than empty. admin_overview
  returns only the blocks the capability allows, so an AI operations account
  gets the AI card and no user counts, and the page does not render a row of
  zeros that look like real numbers.
*/
export default async function AdminOverviewPage() {
  const session = await requireAdmin();

  const [overview, health, community] = await Promise.all([
    getOverview(session.db),
    getHealth(session.db),
    session.can("analytics.read") ? getCommunityAnalytics(session.db, 30) : null,
  ]);

  if (!overview) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="mt-6">
          <ErrorState what="the platform overview" />
        </div>
      </>
    );
  }

  const unhealthy = health.filter((c) => c.state === "down" || c.state === "degraded");

  const users = overview.users ?? {};
  const devs = overview.developers ?? {};
  const tools = overview.tools ?? {};
  const com = overview.community ?? {};
  const ai = overview.ai ?? {};
  const platform = overview.platform ?? {};

  const hasUsers = session.can("users.read");
  const hasAi = session.can("ai.read");

  /* The queue: things a person has to act on, counted once and shown at the top
     so they cannot be missed under a fold. Zero is rendered honestly rather
     than hidden, because "nothing is waiting" is itself worth seeing. */
  const queue = [
    session.can("submissions.review")
      ? { label: "Tools awaiting review", value: tools.pending ?? 0, href: "/admin/submissions" }
      : null,
    session.can("models.manage")
      ? { label: "Models awaiting review", value: tools.models_pending ?? 0, href: "/admin/submissions" }
      : null,
    session.can("reports.read")
      ? { label: "Open reports", value: com.reports_open ?? 0, href: "/admin/reports" }
      : null,
    session.can("developers.manage")
      ? { label: "Developers without terms", value: devs.pending_terms ?? 0, href: "/admin/developers" }
      : null,
  ].filter((x): x is { label: string; value: number; href: string } => x !== null);

  return (
    <>
      <PageHeader
        title="Dashboard"
        lead={`Platform state as of ${new Date(overview.generated_at).toLocaleString("en-GB")}.`}
      />

      {/* Health first, and only when something is wrong. A green banner on every
          page load is furniture people stop reading, which is exactly when the
          red one appears and gets skimmed past with it. */}
      {unhealthy.length > 0 ? (
        <Section title="Needs attention">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {unhealthy.map((check) => (
              <li key={check.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Status value={check.state} />
                <span className="text-[14px] font-medium">{check.label}</span>
                <span className="min-w-0 flex-1 text-[13px] text-muted">{check.detail}</span>
                <Link href="/admin/health" className="text-[13px] text-muted hover:underline">
                  System health
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {queue.length > 0 ? (
        <Section title="Waiting for you">
          <StatGrid>
            {queue.map((item) => (
              <Stat
                key={item.label}
                label={item.label}
                value={item.value}
                href={item.href}
                tone={item.value > 0 ? "warn" : "neutral"}
                hint={item.value === 0 ? "Nothing in the queue" : "Open the queue"}
              />
            ))}
          </StatGrid>
        </Section>
      ) : null}

      {hasUsers ? (
        <Section title="Users" action={<SectionLink href="/admin/users" />}>
          <StatGrid>
            <Stat label="Total" value={users.total ?? 0} hint={`${users.staff ?? 0} staff accounts`} />
            <Stat label="New, 7 days" value={users.new_7d ?? 0} hint={`${users.new_24h ?? 0} in the last day`} />
            <Stat label="Active, 30 days" value={users.active_30d ?? 0} hint="Signed in at least once" />
            <Stat
              label="Verified"
              value={users.verified ?? 0}
              hint={`${users.unverified ?? 0} have not confirmed their email`}
            />
            <Stat
              label="Suspended"
              value={users.suspended ?? 0}
              tone={(users.suspended ?? 0) > 0 ? "danger" : "neutral"}
              hint={`${users.disabled ?? 0} disabled, ${users.deleted ?? 0} deleted`}
            />
          </StatGrid>

          <div className="mt-3">
            <ShareBar
              parts={[
                { label: "Free", value: users.free ?? 0 },
                { label: "Pro", value: users.pro ?? 0 },
                { label: "Premium", value: users.premium ?? 0 },
              ]}
            />
          </div>
        </Section>
      ) : null}

      {session.can("submissions.review") || session.can("models.manage") ? (
        <Section title="Catalogue" action={<SectionLink href="/admin/tools" />}>
          <StatGrid>
            <Stat label="Tools" value={tools.total ?? 0} hint={`${tools.approved ?? 0} published`} />
            <Stat
              label="Pending"
              value={tools.pending ?? 0}
              tone={(tools.pending ?? 0) > 0 ? "warn" : "neutral"}
              hint="Submitted and awaiting a decision"
            />
            <Stat label="Drafts" value={tools.draft ?? 0} hint="Not yet submitted by their developer" />
            <Stat
              label="Rejected"
              value={tools.rejected ?? 0}
              hint={`${tools.changes ?? 0} sent back for changes`}
            />
            <Stat label="Verified" value={tools.verified ?? 0} hint="Granted by an admin" />
            <Stat
              label="Models"
              value={tools.models_total ?? 0}
              hint={`${tools.models_approved ?? 0} published`}
              href="/admin/models"
            />
          </StatGrid>
        </Section>
      ) : null}

      {session.can("content.moderate") || session.can("analytics.read") ? (
        <Section title="Community" action={<SectionLink href="/admin/analytics" />}>
          <StatGrid>
            <Stat label="Posts" value={com.posts ?? 0} hint={`${com.posts_today ?? 0} today`} />
            <Stat label="Comments" value={com.comments ?? 0} />
            <Stat label="Likes" value={com.likes ?? 0} hint={`${com.saves ?? 0} saves`} />
            <Stat label="Reposts" value={com.reposts ?? 0} hint={`${com.follows ?? 0} follows`} />
            <Stat
              label="Hidden"
              value={com.hidden ?? 0}
              tone={(com.hidden ?? 0) > 0 ? "warn" : "neutral"}
              hint="Posts and comments not publicly visible"
            />
            <Stat
              label="Reports"
              value={com.reports_total ?? 0}
              hint={`${com.reports_open ?? 0} still open`}
              href={session.can("reports.read") ? "/admin/reports" : undefined}
            />
          </StatGrid>

          {/*
            The feed has no composer yet, so this is genuinely empty and says so
            rather than drawing a flat line and letting it read as a dead
            platform. Nothing here is seeded or estimated, per D13 and D30.
          */}
          {community && (com.posts ?? 0) === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No community activity yet"
                body="The tables, counters and moderation are live and verified. There is no composer, so nobody can post yet. This chart fills in once tasks 4.12 onward ship."
              />
            </div>
          ) : community ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <TimeSeries
                label="Posts per day"
                unit="posts"
                points={community.by_day.map((d) => ({ day: d.day, value: d.posts }))}
              />
              <TimeSeries
                label="Active users per day"
                unit="people"
                points={community.by_day.map((d) => ({ day: d.day, value: d.active_users }))}
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      {hasAi ? (
        <Section title="AI" action={<SectionLink href="/admin/ai" />}>
          <StatGrid>
            <Stat
              label="Requests"
              value={ai.requests ?? 0}
              hint={`${ai.requests_today ?? 0} today, ${ai.requests_month ?? 0} this month`}
            />
            <Stat
              label="Total tokens"
              value={(ai.total_tokens ?? 0).toLocaleString("en-GB")}
              hint={`${(ai.input_tokens ?? 0).toLocaleString("en-GB")} in, ${(ai.output_tokens ?? 0).toLocaleString("en-GB")} out`}
            />
            <Stat
              label="Estimated cost"
              value={`$${Number(ai.cost_usd ?? 0).toFixed(4)}`}
              hint={`$${Number(ai.cost_month ?? 0).toFixed(4)} this month, at the configured prices`}
            />
            <Stat
              label="Failed"
              value={ai.failed ?? 0}
              tone={(ai.failed ?? 0) > 0 ? "danger" : "neutral"}
              hint={`${ai.rate_limited ?? 0} rate limited, ${ai.refused ?? 0} out of scope`}
            />
            <Stat
              label="Average latency"
              value={`${ai.avg_latency_ms ?? 0} ms`}
              hint="Successful requests only"
            />
            <Stat
              label="Conversations"
              value={ai.conversations ?? 0}
              hint={`${ai.messages ?? 0} messages saved`}
            />
          </StatGrid>
        </Section>
      ) : null}

      {session.can("security.read") ? (
        <Section title="Platform" action={<SectionLink href="/admin/security" />}>
          <StatGrid>
            <Stat
              label="Security events, 24h"
              value={platform.security_24h ?? 0}
              tone={(platform.security_24h ?? 0) > 0 ? "warn" : "neutral"}
            />
            <Stat
              label="High or critical, 7d"
              value={platform.security_high ?? 0}
              tone={(platform.security_high ?? 0) > 0 ? "danger" : "neutral"}
            />
            <Stat label="Auth failures, 24h" value={platform.auth_failures ?? 0} />
            <Stat
              label="Admin actions, 7d"
              value={platform.admin_actions ?? 0}
              href="/admin/audit"
              hint="Every one is in the audit log"
            />
            <Stat
              label="Failed jobs"
              value={platform.jobs_failed ?? 0}
              tone={(platform.jobs_failed ?? 0) > 0 ? "danger" : "neutral"}
              href="/admin/jobs"
            />
          </StatGrid>
        </Section>
      ) : null}

      <p className="mt-10 text-[12px] text-muted">
        Every number on this page is counted from live rows. Nothing is sampled, estimated or
        seeded. Generated <When iso={overview.generated_at} time />.
      </p>
    </>
  );
}

function SectionLink({ href }: { href: string }) {
  return (
    <Link href={href} className="text-[13px] text-muted hover:text-foreground hover:underline">
      View all
    </Link>
  );
}
