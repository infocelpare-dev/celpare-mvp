import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import {
  getTool,
  getToolVerification,
  listModerationActions,
  profilesByIds,
} from "@/lib/admin/queries";
import { confirmToolDomain, reviewSubmission, setToolVerified } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import {
  EmptyState,
  Field,
  FieldList,
  PageHeader,
  Section,
  Stat,
  StatGrid,
  Status,
  When,
  labelFor,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

type ToolRecord = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  docs_url: string | null;
  pricing: string | null;
  pricing_model: string | null;
  tags: string[];
  features: string[];
  platforms: string[];
  status: string;
  verified: boolean;
  source: string;
  rating: number | null;
  rating_count: number;
  popularity_score: number;
  developer_id: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  tool_categories?: { categories?: { name: string; slug: string } | null }[] | null;
};

/*
  One tool, in full, with the review decisions.

  The moderation history sits under the record rather than beside it, because
  the decision a reviewer is about to make depends on what was decided before:
  a tool on its third round of requested changes is a different situation from a
  first submission, and that should be visible without opening anything.
*/
export default async function AdminToolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin("submissions.review");
  const { id } = await params;

  const tool = (await getTool(session.db, id)) as ToolRecord | null;
  if (!tool) notFound();

  const [owners, history, verification] = await Promise.all([
    profilesByIds(session.db, [tool.developer_id]),
    listModerationActions(session.db, { entityType: "tool", entityId: tool.id }),
    getToolVerification(session.db, tool.id),
  ]);

  /* Only a developer submission needs an owner confirmed. A seeded row has no
     developer claiming it, so there is nobody to write to and nothing to
     prove. */
  const needsOwner = tool.source === "developer_submission";
  /* Named for the record it is, not for the person. `owner` a line below is the
     developer's profile, which is a different thing entirely. */
  const ownership = verification.state === "ok" ? verification.row : null;
  const domainConfirmed = Boolean(ownership?.domain_verified_at);
  const canApprove = !needsOwner || domainConfirmed;
  const owner = tool.developer_id ? owners.get(tool.developer_id) : null;

  const categories = (tool.tool_categories ?? [])
    .map((tc) => tc.categories?.name)
    .filter((n): n is string => Boolean(n));

  return (
    <>
      <PageHeader
        title={tool.name}
        lead={tool.tagline ?? undefined}
        action={
          <>
            {tool.status === "approved" ? (
              <Link
                href={`/tools/${tool.slug}`}
                className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
              >
                Public page
              </Link>
            ) : null}
            <Link
              href="/admin/tools"
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            >
              All tools
            </Link>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Status value={tool.status} />
        {tool.verified ? (
          <span className="rounded-full bg-ok-surface px-2 py-0.5 text-[12px] font-medium text-ok-text">
            Verified
          </span>
        ) : null}
        <span className="rounded-full border border-border px-2 py-0.5 text-[12px] text-muted">
          {tool.source.replace(/_/g, " ")}
        </span>
        <span className="font-mono text-[12px] text-muted">{tool.slug}</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Section title="Engagement">
            <StatGrid>
              <Stat
                label="Rating"
                value={tool.rating != null ? Number(tool.rating).toFixed(1) : "Unrated"}
                hint={
                  tool.rating_count > 0
                    ? `${tool.rating_count} ${tool.rating_count === 1 ? "rating" : "ratings"}`
                    : "Nobody has rated this yet"
                }
              />
              <Stat
                label="Popularity"
                value={Math.round(tool.popularity_score)}
                hint="Computed score, not a view count"
              />
              <Stat
                label="Reviews"
                value="Not built"
                hint="There is no review system yet, so there is nothing to count."
              />
              <Stat
                label="Reports"
                value="Not raised"
                hint="Tool reports are supported by the schema and no surface files them yet."
              />
            </StatGrid>
          </Section>

          {tool.description ? (
            <Section title="Description">
              <div className="rounded-xl border border-border p-4">
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
                  {tool.description}
                </p>
              </div>
            </Section>
          ) : null}

          {tool.features.length > 0 || tool.platforms.length > 0 || tool.tags.length > 0 ? (
            <Section title="Classification">
              <FieldList>
                {categories.length > 0 ? (
                  <Field label="Categories">{categories.join(", ")}</Field>
                ) : null}
                {tool.tags.length > 0 ? <Field label="Tags">{tool.tags.join(", ")}</Field> : null}
                {tool.features.length > 0 ? (
                  <Field label="Features">{tool.features.join(", ")}</Field>
                ) : null}
                {tool.platforms.length > 0 ? (
                  <Field label="Platforms">{tool.platforms.join(", ")}</Field>
                ) : null}
              </FieldList>
            </Section>
          ) : null}

          <Section title="Review history">
            {history.length === 0 ? (
              <EmptyState
                title="No decisions recorded"
                body="Every approval, rejection and request for changes is recorded here with its reason and who made it."
              />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {history.map((entry) => (
                  <li key={entry.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="text-[13px] font-medium">{labelFor(entry.action)}</span>
                      <span className="ml-auto text-[12px] text-muted">
                        <When iso={entry.created_at} time />
                      </span>
                    </div>
                    {entry.reason ? (
                      <p className="mt-1 text-[13px] leading-relaxed text-muted">{entry.reason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="min-w-0">
          <Section title="Record">
            <FieldList>
              <Field label="Tool id" mono>
                {tool.id}
              </Field>
              <Field label="Developer">
                {owner ? (
                  <Link href={`/admin/users/${owner.id}`} className="hover:underline">
                    {owner.username ?? owner.full_name ?? owner.id}
                  </Link>
                ) : (
                  "Seeded, no owner"
                )}
              </Field>
              <Field label="Website">
                {tool.website_url ? (
                  <a
                    href={tool.website_url}
                    rel="nofollow noopener noreferrer"
                    target="_blank"
                    className="break-all hover:underline"
                  >
                    {tool.website_url}
                  </a>
                ) : (
                  "Not given"
                )}
              </Field>
              <Field label="Documentation">
                {tool.docs_url ? (
                  <a
                    href={tool.docs_url}
                    rel="nofollow noopener noreferrer"
                    target="_blank"
                    className="break-all hover:underline"
                  >
                    {tool.docs_url}
                  </a>
                ) : (
                  "Not given"
                )}
              </Field>
              <Field label="Pricing">
                {tool.pricing_model ?? "Not stated"}
                {tool.pricing ? <span className="block text-muted">{tool.pricing}</span> : null}
              </Field>
              <Field label="Submitted">
                <When iso={tool.submitted_at} time />
              </Field>
              <Field label="Published">
                {tool.published_at ? <When iso={tool.published_at} time /> : "Never published"}
              </Field>
              <Field label="Last edited">
                <When iso={tool.updated_at} time />
              </Field>
            </FieldList>
          </Section>

          {needsOwner ? (
            <Section title="Domain ownership">
              <div className="rounded-xl border border-border p-4">
                {ownership ? (
                  <>
                    <FieldList>
                      <Field label="Owner email">
                        {/* A mailto rather than a copy button, because the whole
                            point is that a person writes to this address. */}
                        <a
                          href={`mailto:${ownership.owner_email}?subject=${encodeURIComponent(
                            `Celpare: confirming ${tool.name}`,
                          )}`}
                          className="font-mono text-[13px] underline underline-offset-2"
                        >
                          {ownership.owner_email}
                        </a>
                      </Field>
                      <Field label="Tool domain">
                        <span className="font-mono text-[13px]">
                          {ownership.canonical_domain ?? "None given"}
                        </span>
                      </Field>
                      <Field label="Domains match">
                        {ownership.domain_matches ? "Yes" : "No"}
                      </Field>
                      <Field label="Confirmed">
                        {ownership.domain_verified_at ? (
                          <When iso={ownership.domain_verified_at} time />
                        ) : (
                          "Not yet"
                        )}
                      </Field>
                    </FieldList>

                    {ownership.domain_verified_note ? (
                      <p className="mt-3 text-[13px] leading-relaxed text-muted">
                        {ownership.domain_verified_note}
                      </p>
                    ) : null}

                    <p className="mt-3 text-[13px] leading-relaxed text-muted">
                      Celpare sends no verification mail. Write to the address
                      above, and press this once somebody there confirms they
                      are authorized. A developer submission cannot be approved
                      until you do.
                    </p>

                    <div className="mt-3">
                      <ActionForm
                        action={confirmToolDomain}
                        fields={{ id: tool.id, confirmed: domainConfirmed ? "no" : "yes" }}
                        label={domainConfirmed ? "Withdraw confirmation" : "Owner replied, confirm"}
                        tone={domainConfirmed ? "danger" : "primary"}
                        /* Required, and this is the only record that the reply
                           happened. There is no verification mail and no token
                           to point at afterwards, so if this note is not
                           written the confirmation is one person's memory. */
                        requireReason
                        reasonLabel="Who replied, and what they said"
                        reasonHint="This is the only evidence the confirmation happened. It goes in the audit log and cannot be edited later."
                        confirm={{
                          title: domainConfirmed
                            ? "Withdraw the confirmation?"
                            : `Confirm ${ownership.owner_email} replied?`,
                          body: domainConfirmed
                            ? "The tool can no longer be approved until it is confirmed again. An approved listing stays approved."
                            : "This records that somebody at the tool's own domain confirmed this submission, and unlocks approval.",
                          confirmLabel: domainConfirmed ? "Withdraw" : "Confirm ownership",
                        }}
                      />
                    </div>
                  </>
                ) : verification.state === "none" ? (
                  <p className="text-[13px] leading-relaxed text-muted">
                    No owner email on this submission. It predates the
                    requirement, so there is nobody to write to. Send it back
                    and ask for a work address on the tool&apos;s own domain.
                  </p>
                ) : (
                  /* The read failed. Saying "no owner email" here would be the
                     page inventing a fact about a record it could not open,
                     and a reviewer would reject a good submission over it. */
                  <p className="text-[13px] leading-relaxed text-muted">
                    Could not read the ownership record just now. This says
                    nothing about the submission: reload the page. Approval
                    stays locked until it can be read and confirmed.
                  </p>
                )}
              </div>
            </Section>
          ) : null}

          <Section title="Decision">
            <div className="flex flex-col gap-3">
              {tool.status === "approved" ? (
                <ActionForm
                  action={reviewSubmission}
                  fields={{ kind: "tool", id: tool.id, decision: "suspend" }}
                  label="Suspend the listing"
                  tone="danger"
                  requireReason
                  confirm={{
                    title: `Suspend ${tool.name}?`,
                    body: "It stops being publicly visible and returns to the review queue. Nothing is deleted.",
                    confirmLabel: "Suspend listing",
                  }}
                />
              ) : (
                <>
                  <ActionForm
                    action={reviewSubmission}
                    fields={{ kind: "tool", id: tool.id, decision: "approve" }}
                    label="Approve and publish"
                    tone="primary"
                    /* The database refuses this too, at admin_review_submission.
                       Disabling it here only saves the reviewer a round trip to
                       be told something the page already knows. */
                    disabled={!canApprove}
                    disabledReason="Confirm the owner email replied first. Domain ownership is above."
                    confirm={{
                      title: `Publish ${tool.name}?`,
                      body: "It becomes visible to everyone, including signed out visitors, and can be recommended by Ask Celpare.",
                      confirmLabel: "Approve and publish",
                    }}
                  />
                  <ActionForm
                    action={reviewSubmission}
                    fields={{ kind: "tool", id: tool.id, decision: "request_changes" }}
                    label="Request changes"
                    requireReason
                    reasonLabel="What needs to change"
                    reasonHint="The developer reads this. Be specific enough to act on."
                    confirm={{
                      title: "Send this back?",
                      body: "It returns to the developer as editable and can be resubmitted.",
                      confirmLabel: "Request changes",
                    }}
                  />
                  <ActionForm
                    action={reviewSubmission}
                    fields={{ kind: "tool", id: tool.id, decision: "reject" }}
                    label="Reject"
                    tone="danger"
                    requireReason
                    confirm={{
                      title: `Reject ${tool.name}?`,
                      body: "The submission is closed rather than sent back. Nothing is deleted and it can be reopened.",
                      confirmLabel: "Reject submission",
                    }}
                  />
                </>
              )}
            </div>
          </Section>

          <Section title="Verification">
            <div className="rounded-xl border border-border p-4">
              <p className="text-[13px] leading-relaxed text-muted">
                A verified tool is one Celpare has confirmed is operated by the developer who
                submitted it. It is granted here and can never be self set: the column is absent
                from every client grant.
              </p>
              <div className="mt-3">
                <ActionForm
                  action={setToolVerified}
                  fields={{ id: tool.id, verified: tool.verified ? "no" : "yes" }}
                  label={tool.verified ? "Remove verification" : "Mark as verified"}
                  tone={tool.verified ? "danger" : "primary"}
                  confirm={{
                    title: tool.verified ? "Remove the verified mark?" : "Verify this tool?",
                    body: tool.verified
                      ? "The badge disappears from the public page."
                      : "A verified badge appears on the public page. Only do this once ownership has actually been confirmed.",
                    confirmLabel: tool.verified ? "Remove verification" : "Verify",
                  }}
                />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
