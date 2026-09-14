import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import { SubmissionList } from "@/components/developer/submission-list";
import { gate, getMyTools } from "@/lib/developer/queries";

export const metadata: Metadata = {
  title: "My Tools",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MyToolsPage() {
  const { gate: g, db } = await gate();

  if (g.state === "signed-out") redirect("/get-started");
  if (g.state === "mode-off") return <ModeOff />;
  if (g.state === "needs-onboarding") redirect("/developer");

  const tools = await getMyTools(db!, g.userId);

  return (
    <DeveloperShell
      title="My Tools"
      lead="Everything you have submitted, and where each one is."
      verified={g.profile.verified}
      backHref="/developer"
      backLabel="Back to dashboard"
      action={<ButtonLink href="/developer/submit" size="sm">Submit a tool</ButtonLink>}
    >
      {tools.length === 0 ? (
        <div className="rounded-2xl border border-border px-6 py-12 text-center">
          <p className="font-display text-[17px] font-semibold">
            You haven&apos;t added any tools yet.
          </p>
          <p className="mx-auto mt-2 max-w-[44ch] text-[14px] leading-relaxed text-muted">
            Submit a tool you build or represent. It stays a private draft until
            you send it for review.
          </p>
          <div className="mt-5">
            <ButtonLink href="/developer/submit" size="sm">
              Submit your first tool
            </ButtonLink>
          </div>
        </div>
      ) : (
        <SubmissionList kind="tool" tools={tools} />
      )}
    </DeveloperShell>
  );
}
