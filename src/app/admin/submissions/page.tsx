import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { getToolVerification, listSubmissions, profilesByIds } from "@/lib/admin/queries";
import { confirmToolDomain, reviewSubmission } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { FilterTabs } from "@/components/admin/filters";
import {
  EmptyState,
  PageHeader,
  PersonCell,
  Status,
  When,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/*
  The review queue.

  Tools and models in one list, oldest first. A reviewer works a queue rather
  than two tables, and sorting newest first starves the bottom of it: the oldest
  submission is the one somebody has been waiting on longest.

  Every action carries a confirmation step and every action that sends work back
  demands a reason, because the developer is the one who has to act on it and
  "rejected" with no explanation is not a decision they can do anything with.
*/

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "changes_required", label: "Changes required" },
  { key: "draft", label: "Drafts" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "Everything" },
];

export default async function AdminSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireAdmin("submissions.review");
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? sp.status! : "pending";

  const submissions = await listSubmissions(session.db, status);
  const owners = await profilesByIds(
    session.db,
    submissions.map((s) => s.developer_id),
  );

  /*
    The owner email for every row still waiting on a confirmation, so the
    reviewer can write to the address and confirm from this page rather than
    opening each record.

    One RPC per gated row, in parallel, and only for gated rows. Reading it any
    other way is not possible: owner_email is in no client SELECT grant, so
    tool_verification_state is the only door, and it checks the caller holds
    submissions.review. A row whose read fails is simply left without a confirm
    control here, which sends the reviewer to the full record where 4T.11
    already says plainly that the record could not be read. It must never
    render as "no owner email".
  */
  const gated = submissions.filter((s) => s.needs_domain_confirm);
  const ownership = new Map<string, string>(
    (
      await Promise.all(
        gated.map(async (s) => {
          const v = await getToolVerification(session.db, s.id);
          return v.state === "ok" && v.row.owner_email
            ? ([s.id, v.row.owner_email] as const)
            : null;
        }),
      )
    ).filter((e): e is readonly [string, string] => e !== null),
  );

  return (
    <>
      <PageHeader
        title="Submissions"
        lead="Tools and models waiting on a decision, oldest first. Approving publishes it to the public catalogue."
      />

      <div className="mt-5">
        <FilterTabs
          label="Submission status"
          active={`/admin/submissions?status=${status}`}
          items={TABS.map((t) => ({
            href: `/admin/submissions?status=${t.key}`,
            label: t.label,
            count: t.key === status ? submissions.length : undefined,
          }))}
        />
      </div>

      {submissions.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={
              status === "pending"
                ? "Nothing is waiting for review"
                : `No submissions with that status`
            }
            body={
              status === "pending"
                ? "When a developer submits a tool or a model it appears here. Until this queue exists nothing can ever be published, so an empty queue is the good state rather than a missing feature."
                : "Try another tab."
            }
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {submissions.map((item) => {
            const owner = item.developer_id ? owners.get(item.developer_id) : null;
            const detailHref =
              item.kind === "tool" ? `/admin/tools/${item.id}` : `/admin/models/${item.id}`;

            return (
              <li key={`${item.kind}-${item.id}`} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={detailHref} className="font-display text-[15px] font-semibold hover:underline">
                        {item.name}
                      </Link>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted">
                        {item.kind}
                      </span>
                      <Status value={item.status} />
                      {item.needs_domain_confirm ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted">
                          Owner unconfirmed
                        </span>
                      ) : null}
                    </div>

                    {item.tagline ? (
                      <p className="mt-1.5 max-w-[70ch] text-[13px] leading-relaxed text-muted">
                        {item.tagline}
                      </p>
                    ) : null}
                    {item.provider ? (
                      <p className="mt-1.5 text-[13px] text-muted">Provider: {item.provider}</p>
                    ) : null}

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
                      <span className="font-mono">{item.slug}</span>
                      <span>
                        Submitted <When iso={item.submitted_at} time />
                      </span>
                      {owner ? (
                        <PersonCell
                          id={owner.id}
                          username={owner.username}
                          fullName={owner.full_name}
                          avatarUrl={owner.avatar_url}
                          accountStatus={owner.account_status}
                        />
                      ) : (
                        <span>No developer attached</span>
                      )}
                    </div>
                  </div>

                  <Link
                    href={detailHref}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
                  >
                    Full record
                  </Link>
                </div>

                {/* The decisions, in the order a reviewer reaches for them.
                    Approve is primary because it is the common case; the two
                    that cost the developer work sit beside it and both demand a
                    reason before they will submit. */}
                {/*
                  Confirming the owner replied, without leaving the queue.

                  This is the step that was only ever on the full record, which
                  made the queue a dead end: Approve refused and there was
                  nothing here to act on. The reviewer writes to the address,
                  presses this, and then presses Approve.

                  The address comes from tool_verification_state, the only way
                  to read it: owner_email is in no client SELECT grant, so it
                  cannot leak through an ordinary select even for an admin.
                */}
                {ownership.get(item.id) ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-[13px] leading-relaxed text-muted">
                      Celpare sends no verification mail. Write to{" "}
                      <a
                        href={`mailto:${ownership.get(item.id)}?subject=${encodeURIComponent(
                          `Celpare: confirming ${item.name}`,
                        )}`}
                        className="font-mono text-[13px] text-foreground underline underline-offset-2"
                      >
                        {ownership.get(item.id)}
                      </a>{" "}
                      and confirm below once somebody there replies. Then
                      approve.
                    </p>
                    <div className="mt-3">
                      <ActionForm
                        action={confirmToolDomain}
                        fields={{ id: item.id, confirmed: "yes" }}
                        label="Owner replied, confirm"
                        tone="primary"
                        /* Required, and this is the only record that the reply
                           happened. There is no verification mail and no token
                           to point at afterwards, so without this note the
                           confirmation is one person's memory. */
                        requireReason
                        reasonLabel="Who replied, and what they said"
                        reasonHint="This is the only evidence the confirmation happened. It goes in the audit log and cannot be edited later."
                        confirm={{
                          title: `Confirm ${ownership.get(item.id)} replied?`,
                          body: "This records that somebody at the tool's own domain confirmed this submission, and unlocks approval.",
                          confirmLabel: "Confirm ownership",
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-border pt-4">
                  {item.status === "approved" ? (
                    <ActionForm
                      action={reviewSubmission}
                      fields={{ kind: item.kind, id: item.id, decision: "suspend" }}
                      label="Suspend the listing"
                      tone="danger"
                      requireReason
                      confirm={{
                        title: `Suspend ${item.name}?`,
                        body: "It stops being publicly visible and goes back into this queue. The developer keeps their work and can see why.",
                        confirmLabel: "Suspend listing",
                      }}
                    />
                  ) : (
                    <>
                      {/*
                        Approve is deliberately left alone. Founder instruction,
                        2026-09-17: confirm the owner first, then choose Approve.
                        An earlier version disabled this until the confirmation
                        existed; the founder wants the two as separate decisions
                        they make in order, so this stays enabled and
                        admin_review_submission is what refuses an unconfirmed
                        one, which it already did.
                      */}
                      <ActionForm
                        action={reviewSubmission}
                        fields={{ kind: item.kind, id: item.id, decision: "approve" }}
                        label="Approve"
                        tone="primary"
                        confirm={{
                          title: `Publish ${item.name}?`,
                          body: "It becomes visible to everyone, including signed out visitors, and can be recommended by Ask Celpare.",
                          confirmLabel: "Approve and publish",
                        }}
                      />
                      <ActionForm
                        action={reviewSubmission}
                        fields={{ kind: item.kind, id: item.id, decision: "request_changes" }}
                        label="Request changes"
                        requireReason
                        reasonLabel="What needs to change"
                        reasonHint="The developer reads this. Be specific enough to act on."
                        confirm={{
                          title: `Send ${item.name} back?`,
                          body: "It returns to the developer as editable, and they can resubmit once they have made the changes.",
                          confirmLabel: "Request changes",
                        }}
                      />
                      <ActionForm
                        action={reviewSubmission}
                        fields={{ kind: item.kind, id: item.id, decision: "reject" }}
                        label="Reject"
                        tone="danger"
                        requireReason
                        reasonLabel="Why this is rejected"
                        confirm={{
                          title: `Reject ${item.name}?`,
                          body: "Heavier than requesting changes: the submission is closed rather than sent back. Nothing is deleted and it can be reopened.",
                          confirmLabel: "Reject submission",
                        }}
                      />
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
