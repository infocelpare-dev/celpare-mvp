import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import { SubmissionList } from "@/components/developer/submission-list";
import { gate, getMyModels } from "@/lib/developer/queries";

export const metadata: Metadata = {
  title: "My Models",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MyModelsPage() {
  const { gate: g, db } = await gate();

  if (g.state === "signed-out") redirect("/get-started");
  if (g.state === "mode-off") return <ModeOff />;
  if (g.state === "needs-onboarding") redirect("/developer");

  const models = await getMyModels(db!, g.userId);

  return (
    <DeveloperShell
      title="My Models"
      lead="AI models you own or represent. The public model directory itself is Phase 5, so these are recorded and reviewed now, and surface when it ships."
      verified={g.profile.verified}
      backHref="/developer"
      backLabel="Back to dashboard"
      action={<ButtonLink href="/developer/models/new" size="sm">Submit a model</ButtonLink>}
    >
      {models.length === 0 ? (
        <div className="rounded-2xl border border-border px-6 py-12 text-center">
          <p className="font-display text-[17px] font-semibold">
            You haven&apos;t added any models yet.
          </p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[14px] leading-relaxed text-muted">
            Submit a model you own or represent. It stays a private draft until
            you send it for review.
          </p>
          <div className="mt-5">
            <ButtonLink href="/developer/models/new" size="sm">
              Submit your first model
            </ButtonLink>
          </div>
        </div>
      ) : (
        <SubmissionList kind="model" models={models} />
      )}
    </DeveloperShell>
  );
}
