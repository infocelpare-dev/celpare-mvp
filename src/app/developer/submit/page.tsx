import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import { ComingSoon } from "@/components/developer/coming-soon";
import { gate } from "@/lib/developer/queries";

export const metadata: Metadata = {
  title: "Submit a tool",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SubmitToolPage() {
  const { gate: g } = await gate();

  if (g.state === "signed-out") redirect("/get-started");
  if (g.state === "mode-off") return <ModeOff />;
  if (g.state === "needs-onboarding") redirect("/developer");

  return (
    <DeveloperShell
      title="Submit a tool"
      verified={g.profile.verified}
      backHref="/developer"
      backLabel="Back to dashboard"
    >
      <ComingSoon
        what="Tool submission is being built"
        detail="The form lands next. Everything behind it is already in place: a submission is created as a private draft owned by you, and it is only published after Celpare reviews it."
        backHref="/developer/tools"
        backLabel="See My Tools"
      />
    </DeveloperShell>
  );
}
