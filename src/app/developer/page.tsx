import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import { RecentList } from "@/components/profile/recent-list";
import { TimeSeries } from "@/components/ui/charts";
import {
  gate,
  getMyModels,
  getMyTools,
  getToolAnalytics,
  statsFrom,
} from "@/lib/developer/queries";
import type { RecentRow } from "@/lib/profile/queries";

export const metadata: Metadata = {
  title: "Developer dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DeveloperHome() {
  const { gate: g, db } = await gate();

  if (g.state === "signed-out") redirect("/get-started");
  if (g.state === "mode-off") return <ModeOff />;

  /* One terms surface, not two. The scroll gated one at /developer/terms is
     the only place the agreement is made. */
  if (g.state === "needs-onboarding") redirect("/developer/terms");

  /*
    Recent, founder instruction 2026-09-18: it belongs on the user side and the
    developer side both. Five rows here rather than twenty, because this page is
    about the tools you own and this is a way back to what you were looking at,
    not a section of its own. The full list is the Recent tab on your profile.

    It reads through the same SECURITY DEFINER function the profile uses, which
    answers for auth.uid(). There is no id to pass and so nothing to get wrong.
  */
  const [tools, models, recent, analytics] = await Promise.all([
    getMyTools(db!, g.userId),
    getMyModels(db!, g.userId),
    db!
      .rpc("my_recent_activity", { p_limit: 5 })
      .then(({ data, error }) => {
        if (error) {
          console.error("[developer] recent failed", error.code, error.message);
          return [] as RecentRow[];
        }
        return (data as RecentRow[]) ?? [];
      }),
    /* The last seven days, as a headline. The full board with its range control
       is /developer/analytics; this is the glance that tells you whether it is
       worth opening. */
    getToolAnalytics(db!, 7),
  ]);
  const stats = statsFrom(tools, models);

  const nothingYet = tools.length === 0 && models.length === 0;

  return (
    <DeveloperShell
      title="Developer dashboard"
      verified={g.profile.verified}
      action={<ButtonLink href="/developer/submit" size="sm">Submit a tool</ButtonLink>}
    >
      {nothingYet ? (
        <EmptyDashboard />
      ) : (
        <>
          {/* Every number here is a count of real rows. Nothing is estimated
              and a zero shows as a zero, per D13 and D30. */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Stat label="Tools" value={stats.tools} href="/developer/tools" />
            <Stat label="Models" value={stats.models} href="/developer/models" />
            <Stat label="Pending review" value={stats.pending} />
            <Stat label="Approved tools" value={stats.approvedTools} />
            <Stat label="Approved models" value={stats.approvedModels} />
            <Stat label="Rejected" value={stats.rejected} />
          </div>

          {/*
            Activity, founder instruction 2026-09-18. Shown only once something
            is live: an approved tool is the thing that can be viewed at all, so
            before that these would be four zeros pretending to be a dashboard.
          */}
          {stats.approvedTools > 0 ? (
            <section className="mt-8" aria-labelledby="activity-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="activity-heading" className="font-display text-[17px] font-semibold">
                  Activity
                </h2>
                <Link
                  href="/developer/analytics"
                  className="text-[14px] underline underline-offset-4 hover:text-muted"
                >
                  Open analytics
                </Link>
              </div>
              <p className="mt-1 text-[13px] text-muted">
                The last seven days. The full board has 24 hours, 7 days and 30 days.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Stat label="Views, 7 days" value={analytics.totals.views} href="/developer/analytics" />
                <Stat label="Saves, 7 days" value={analytics.totals.savers} href="/developer/analytics" />
                <Stat label="Reviews, 7 days" value={analytics.totals.reviews} href="/developer/analytics" />
              </div>

              <div className="mt-3">
                <TimeSeries
                  points={analytics.by_day}
                  label="Tool views"
                  unit="views"
                  windowDays={7}
                />
              </div>
            </section>
          ) : null}

          {stats.drafts > 0 ? (
            <Card className="mt-6">
              <p className="text-[15px]">
                <strong className="font-medium">
                  {stats.drafts} {stats.drafts === 1 ? "draft is" : "drafts are"}
                </strong>{" "}
                <span className="text-muted">
                  not submitted yet. A draft is private to you until you send it
                  for review.
                </span>
              </p>
            </Card>
          ) : null}
        </>
      )}

      {/* Absent rather than empty. A developer who has not searched or opened
          anything is not missing a feature, and an empty state here would be a
          box explaining a box. The profile tab carries the full explanation. */}
      {recent.length > 0 ? (
        <section className="mt-6" aria-labelledby="recent-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="recent-heading" className="font-display text-[17px] font-semibold">
              Recent
            </h2>
            <Link
              href="/profile?tab=recent"
              className="text-[14px] underline underline-offset-4 hover:text-muted"
            >
              See all
            </Link>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            What you searched for and opened. Only you can see this.
          </p>
          <div className="mt-3">
            <RecentList rows={recent} />
          </div>
        </section>
      ) : null}

      <Card className="mt-6">
        <h2 className="font-display text-[17px] font-semibold">Developer resources</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          What makes a submission pass review, and how the catalogue record is
          structured. Being honest: this is not written yet. Until it is, the
          terms you agreed to are the best statement of what is expected.
        </p>
      </Card>
    </DeveloperShell>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const body = (
    <>
      <span className="block text-[13px] text-muted">{label}</span>
      <span className="mt-1 block font-display text-[28px] font-semibold tabular-nums">
        {value}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-2xl border border-border p-5 transition-colors duration-200 ease-out hover:bg-surface"
      >
        {body}
      </Link>
    );
  }
  return <div className="rounded-2xl border border-border p-5">{body}</div>;
}

function EmptyDashboard() {
  return (
    <div className="rounded-2xl border border-border px-6 py-12 text-center">
      <p className="font-display text-[17px] font-semibold">
        Nothing submitted yet
      </p>
      <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-muted">
        Once you submit a tool or a model, this is where you track it: what is a
        draft, what is waiting on review, and what is live in the catalogue.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/developer/submit" size="sm">
          Submit your first tool
        </ButtonLink>
        <ButtonLink href="/developer/models/new" size="sm" variant="outline">
          Submit a model
        </ButtonLink>
      </div>
    </div>
  );
}
