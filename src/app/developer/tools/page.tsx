import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { DeveloperShell } from "@/components/developer/developer-shell";
import { ModeOff } from "@/components/developer/mode-off";
import { SubmissionList } from "@/components/developer/submission-list";
import { gate, getMyTools } from "@/lib/developer/queries";

export const metadata: Metadata = {
  title: "My Tools",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MyToolsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; sent?: string }>;
}) {
  const { gate: g, db } = await gate();

  if (g.state === "signed-out") redirect("/get-started");
  if (g.state === "mode-off") return <ModeOff />;
  if (g.state === "needs-onboarding") redirect("/developer");

  const tools = await getMyTools(db!, g.userId);

  /*
    Set by submitTool on success. A redirect alone leaves a person guessing
    which of these rows is the one they just made, and the ux guidance rates a
    submit with no confirmation as High severity. Read as text and never
    rendered as markup, so a crafted link can only produce a sentence.
  */
  const params = await searchParams;
  const saved = params.saved?.slice(0, 120);
  /* Save draft and Submit tool both land here, and they are not the same
     event. Saying "Saved" after somebody pressed Submit would misreport what
     happened to their submission. */
  const sent = params.sent === "1";

  return (
    <DeveloperShell
      title="My Tools"
      lead="Everything you have submitted, and where each one is."
      verified={g.profile.verified}
      backHref="/developer"
      backLabel="Back to dashboard"
      action={<ButtonLink href="/developer/submit" size="sm">Submit a tool</ButtonLink>}
    >
      {saved ? (
        <FormAlert tone="success">
          {sent ? (
            <>
              Sent. {saved} is with Celpare for review. A reviewer writes to
              your owner email to confirm you represent it. It does not go live
              until that is done and the review passes.
            </>
          ) : (
            <>
              Saved. {saved} is a private draft. Send it for review when it is
              ready.
            </>
          )}
        </FormAlert>
      ) : null}

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
