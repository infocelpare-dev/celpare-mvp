import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import {
  gate,
  getMyModels,
  getMyTools,
  statsFrom,
} from "@/lib/developer/queries";

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

  const [tools, models] = await Promise.all([
    getMyTools(db!, g.userId),
    getMyModels(db!, g.userId),
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
