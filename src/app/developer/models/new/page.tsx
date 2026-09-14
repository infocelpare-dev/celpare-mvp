import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import { ComingSoon } from "@/components/developer/coming-soon";
import { gate } from "@/lib/developer/queries";

export const metadata: Metadata = {
  title: "Submit a model",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SubmitModelPage() {
  const { gate: g } = await gate();

  if (g.state === "signed-out") redirect("/get-started");
  if (g.state === "mode-off") return <ModeOff />;
  if (g.state === "needs-onboarding") redirect("/developer");

  return (
    <DeveloperShell
      title="Submit a model"
      verified={g.profile.verified}
      backHref="/developer"
      backLabel="Back to dashboard"
    >
      <ComingSoon
        what="Model submission is being built"
        detail="The form lands next, alongside tool submission. The public model directory arrives in Phase 5, so models submitted now are recorded and reviewed ready for it."
        backHref="/developer/models"
        backLabel="See My Models"
      />
    </DeveloperShell>
  );
}
