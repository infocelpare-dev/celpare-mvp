import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import { NoticeCard } from "@/components/developer/notice-card";
import { ToolSubmitForm } from "@/components/developer/tool-submit-form";
import { RenameRequest, type RenameRequestLatest } from "@/components/developer/rename-request";
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
    approved          yes, and the edit is public at once, except the name,
                      which is locked and changed by a rename request
                      (D274, founder 2026-11-25; it replaced the 2026-09-17
                      rule that sent every live edit back to review)
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
  const { id } = await params;

  if (g.state === "signed-out") redirect(`/get-started?next=${encodeURIComponent(`/developer/tools/${id}/edit`)}`);
  if (g.state === "mode-off") return <ModeOff />;
  if (g.state === "needs-onboarding") redirect("/developer");

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
  const [categories, renameRead] = await Promise.all([
    listCategories(),
    live
      ? db!
          .from("tool_rename_requests")
          .select("status, requested_name, decision_reason")
          .eq("tool_id", tool.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  /* A failed read still shows the form: the server refuses a second pending
     request with its own message. */
  if (renameRead.error) console.error("[developer] rename request read failed", renameRead.error.message);
  const latestRename = (renameRead.data ?? null) as RenameRequestLatest;

  return (
    <DeveloperShell
      title="Edit tool"
      lead={
        live
          ? "This tool is live. Saving updates its public page straight away. The name is locked; ask for a new one at the bottom of this page."
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
      {live ? (
        <RenameRequest toolId={tool.id} currentName={tool.values.name as string} latest={latestRename} />
      ) : null}
    </DeveloperShell>
  );
}
