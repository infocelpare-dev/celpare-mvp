import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import { NoticeCard } from "@/components/developer/notice-card";
import { ToolSubmitForm } from "@/components/developer/tool-submit-form";
import { gate, listCategories } from "@/lib/developer/queries";
import { isEnabled } from "@/lib/platform/settings";

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

  /*
    The flag is read here as well as in the action, and the two answers are not
    redundant. The action's check is the one that decides. This one decides
    whether a person is shown a form they cannot submit, which is the failure
    4O.2 was written to avoid: filling in twelve fields before being told no.

    It fails open by design, like every other flag. RLS is what fails closed.
  */
  const open = await isEnabled("features.tool_submission");

  /* Read here rather than in the form, because the form is a client component
     and these are eight rows that never change between renders. */
  const categories = open ? await listCategories() : [];

  return (
    <DeveloperShell
      title="Submit a tool"
      lead="Three steps. Save it as a private draft, or send it to Celpare for review at the end."
      verified={g.profile.verified}
      backHref="/developer"
      backLabel="Back to dashboard"
    >
      {open ? (
        <ToolSubmitForm categories={categories} />
      ) : (
        <NoticeCard
          title="Tool submissions are paused"
          detail="Celpare has turned new submissions off for now. Nothing you have already submitted is affected, and your drafts are untouched. Try again later."
          backHref="/developer/tools"
          backLabel="See My Tools"
        />
      )}
    </DeveloperShell>
  );
}
