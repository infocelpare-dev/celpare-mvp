import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import { NoticeCard } from "@/components/developer/notice-card";
import { ToolSubmitForm } from "@/components/developer/tool-submit-form";
import { gate, getToolForEdit, listCategories } from "@/lib/developer/queries";

export const metadata: Metadata = {
  title: "Edit tool",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/*
  Editing a tool you own.

  This route did not exist until 2026-09-17, which is the whole of the bug the
  founder hit: "Edit tool" on a public profile linked to the My Tools LIST, and
  My Tools told anybody whose submission had been sent back to "edit it, then
  send it again" with nothing on the page to press.

  Which states may be edited, and why the other two may not:

    draft             yes, it is yours and nobody else has seen it
    changes_required  yes, that is the entire point of sending it back
    approved          yes, and saving takes it off the catalogue and back into
                      the review queue. Founder decision, 2026-09-17
    pending           no. It is in the queue and a reviewer is deciding on it;
                      editing underneath them changes what they are deciding
    rejected          no. That decision is final for the submission

  public.update_tool enforces all of that again, and it is the one that counts.
  This page decides what to RENDER, the same split D75 draws for Developer Mode
  and 4P draws for the admin dashboard.
*/

const BLOCKED: Record<string, { title: string; detail: string }> = {
  pending: {
    title: "This one is being reviewed",
    detail:
      "It is in the queue waiting on a decision, so it cannot be edited right now. Editing it underneath the reviewer would change what they are deciding on. If a review asks for changes, it comes back to you and you can edit it then.",
  },
  rejected: {
    title: "This submission is closed",
    detail:
      "The review decision is final for this submission, so it cannot be edited. You can submit the tool again as a new entry.",
  },
};

export default async function EditToolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { gate: g, db } = await gate();

  if (g.state === "signed-out") redirect("/get-started");
  if (g.state === "mode-off") return <ModeOff />;
  if (g.state === "needs-onboarding") redirect("/developer");

  const { id } = await params;
  const tool = await getToolForEdit(db!, g.userId, id);

  /* Not yours, or not there. The same answer for both, so this page cannot be
     used to find out whether a given id exists. */
  if (!tool) notFound();

  const blocked = BLOCKED[tool.status];
  if (blocked) {
    return (
      <DeveloperShell
        title="Edit tool"
        lead={tool.values.name as string}
        verified={g.profile.verified}
        backHref="/developer/tools"
        backLabel="Back to My Tools"
      >
        <NoticeCard
          title={blocked.title}
          detail={blocked.detail}
          backHref="/developer/tools"
          backLabel="See My Tools"
        />
      </DeveloperShell>
    );
  }

  const live = tool.status === "approved";
  const categories = await listCategories();

  return (
    <DeveloperShell
      title="Edit tool"
      lead={
        live
          ? "This tool is live. Saving takes it off the catalogue and back into the review queue until Celpare approves it again."
          : "Change anything you need to, then save."
      }
      verified={g.profile.verified}
      backHref="/developer/tools"
      backLabel="Back to My Tools"
    >
      <ToolSubmitForm
        categories={categories}
        initial={tool.values}
        toolId={tool.id}
        liveEdit={live}
      />
    </DeveloperShell>
  );
}
