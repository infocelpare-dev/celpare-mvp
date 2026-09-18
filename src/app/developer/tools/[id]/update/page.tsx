import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import { NoticeCard } from "@/components/developer/notice-card";
import { FeatureUpdateForm } from "@/components/developer/feature-update-form";
import { gate, getToolForEdit } from "@/lib/developer/queries";

export const metadata: Metadata = {
  title: "Launch a new feature",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/*
  Posting news about a tool you already submitted.

  Separate from the edit form on purpose, and not reachable from it. Editing
  changes what the listing claims and sends a live tool back for review;
  announcing something does neither, which is why this exists as its own small
  page rather than as another fieldset on a form that already has fifteen.

  Only the developer who submitted the tool gets here. getToolForEdit filters
  on developer_id and RLS agrees, so somebody else's tool is a 404 rather than
  a refusal that confirms it exists. post_tool_update checks ownership again,
  and that is the check that counts.
*/

export default async function LaunchFeaturePage({
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
  if (!tool) notFound();

  const name = (tool.values.name as string) || "your tool";

  /* A closed submission has nothing to announce. Every other state is fine: a
     draft's updates simply are not public yet, which is true of the draft too. */
  if (tool.status === "rejected") {
    return (
      <DeveloperShell
        title="Launch a new feature"
        lead={name}
        verified={g.profile.verified}
        backHref="/developer/tools"
        backLabel="Back to My Tools"
      >
        <NoticeCard
          title="This submission is closed"
          detail="The review decision was final for this submission, so there is nothing to post an update against. Submitting the tool again as a new entry gives it somewhere to live."
          backHref="/developer/tools"
          backLabel="See My Tools"
        />
      </DeveloperShell>
    );
  }

  return (
    <DeveloperShell
      title="Launch a new feature"
      lead={`Tell people what you shipped on ${name}. It appears in the tool's media and goes live straight away.`}
      verified={g.profile.verified}
      backHref={tool.status === "approved" ? `/tools/${tool.slug}` : "/developer/tools"}
      backLabel={tool.status === "approved" ? "Back to the tool" : "Back to My Tools"}
    >
      <FeatureUpdateForm toolId={tool.id} slug={tool.slug} toolName={name} />
    </DeveloperShell>
  );
}
