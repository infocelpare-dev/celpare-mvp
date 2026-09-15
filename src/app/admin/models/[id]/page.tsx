import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { getModel, listModerationActions, profilesByIds } from "@/lib/admin/queries";
import { reviewSubmission } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { ModelForm } from "@/components/admin/model-form";
import {
  EmptyState,
  Field,
  FieldList,
  PageHeader,
  Section,
  Status,
  Usd,
  When,
  labelFor,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

type ModelRecord = {
  id: string;
  slug: string;
  name: string;
  provider: string;
  description: string | null;
  context_window: number | null;
  input_price_per_m: number | null;
  output_price_per_m: number | null;
  modalities: string[];
  tags: string[];
  website_url: string | null;
  status: string;
  source: string;
  developer_id: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
};

export default async function AdminModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin("models.manage");
  const { id } = await params;

  const model = (await getModel(session.db, id)) as ModelRecord | null;
  if (!model) notFound();

  const [owners, history] = await Promise.all([
    profilesByIds(session.db, [model.developer_id]),
    listModerationActions(session.db, { entityType: "model", entityId: model.id }),
  ]);
  const owner = model.developer_id ? owners.get(model.developer_id) : null;

  return (
    <>
      <PageHeader
        title={model.name}
        lead={`${model.provider} model, directory entry.`}
        action={
          <Link
            href="/admin/models"
            className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            All models
          </Link>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Status value={model.status} />
        <span className="rounded-full border border-border px-2 py-0.5 text-[12px] text-muted">
          {model.source.replace(/_/g, " ")}
        </span>
        <span className="font-mono text-[12px] text-muted">{model.slug}</span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {model.description ? (
            <Section title="Description">
              <div className="rounded-xl border border-border p-4">
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
                  {model.description}
                </p>
              </div>
            </Section>
          ) : null}

          <Section
            title="Capabilities and pricing"
            lead="Metadata the developer supplied. Celpare does not verify these numbers against the provider."
          >
            <FieldList>
              <Field label="Provider">{model.provider}</Field>
              <Field label="Context window">
                {model.context_window
                  ? `${model.context_window.toLocaleString("en-GB")} tokens`
                  : "Not stated"}
              </Field>
              <Field label="Input price">
                {model.input_price_per_m != null ? (
                  <>
                    <Usd value={Number(model.input_price_per_m)} /> per million tokens
                  </>
                ) : (
                  "Not stated"
                )}
              </Field>
              <Field label="Output price">
                {model.output_price_per_m != null ? (
                  <>
                    <Usd value={Number(model.output_price_per_m)} /> per million tokens
                  </>
                ) : (
                  "Not stated"
                )}
              </Field>
              <Field label="Modalities">
                {model.modalities.length > 0 ? model.modalities.join(", ") : "Not stated"}
              </Field>
              <Field label="Tags">
                {model.tags.length > 0 ? model.tags.join(", ") : "None"}
              </Field>
              <Field label="Website">
                {model.website_url ? (
                  <a
                    href={model.website_url}
                    rel="nofollow noopener noreferrer"
                    target="_blank"
                    className="break-all hover:underline"
                  >
                    {model.website_url}
                  </a>
                ) : (
                  "Not given"
                )}
              </Field>
            </FieldList>
          </Section>

          <Section title="Review history">
            {history.length === 0 ? (
              <EmptyState
                title="No decisions recorded"
                body="Approvals, rejections and requests for changes appear here with their reasons."
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
              <Field label="Model id" mono>
                {model.id}
              </Field>
              <Field label="Submitted by">
                {owner ? (
                  <Link href={`/admin/users/${owner.id}`} className="hover:underline">
                    {owner.username ?? owner.id}
                  </Link>
                ) : (
                  "No owner"
                )}
              </Field>
              <Field label="Submitted">
                <When iso={model.submitted_at} time />
              </Field>
              <Field label="Last edited">
                <When iso={model.updated_at} time />
              </Field>
            </FieldList>
          </Section>

          <Section title="Decision">
            <div className="flex flex-col gap-3">
              {model.status === "approved" ? (
                <ActionForm
                  action={reviewSubmission}
                  fields={{ kind: "model", id: model.id, decision: "suspend" }}
                  label="Suspend the listing"
                  tone="danger"
                  requireReason
                  confirm={{
                    title: `Suspend ${model.name}?`,
                    body: "It stops being publicly visible and returns to the review queue.",
                    confirmLabel: "Suspend listing",
                  }}
                />
              ) : (
                <>
                  <ActionForm
                    action={reviewSubmission}
                    fields={{ kind: "model", id: model.id, decision: "approve" }}
                    label="Approve and publish"
                    tone="primary"
                    confirm={{
                      title: `Publish ${model.name}?`,
                      body: "It becomes visible in the public model directory. This does not make Celpare run it: what the gateway runs is an environment variable.",
                      confirmLabel: "Approve and publish",
                    }}
                  />
                  <ActionForm
                    action={reviewSubmission}
                    fields={{ kind: "model", id: model.id, decision: "request_changes" }}
                    label="Request changes"
                    requireReason
                    reasonLabel="What needs to change"
                    confirm={{
                      title: "Send this back?",
                      body: "It returns to the developer as editable and can be resubmitted.",
                      confirmLabel: "Request changes",
                    }}
                  />
                  <ActionForm
                    action={reviewSubmission}
                    fields={{ kind: "model", id: model.id, decision: "reject" }}
                    label="Reject"
                    tone="danger"
                    requireReason
                    confirm={{
                      title: `Reject ${model.name}?`,
                      body: "The submission is closed rather than sent back. Nothing is deleted.",
                      confirmLabel: "Reject submission",
                    }}
                  />
                </>
              )}
            </div>
          </Section>

          {/* Brief section 6: metadata and platform availability. Availability
              is the status decision above; this is the metadata half, which
              until now could only be corrected in the SQL editor. Prices go
              stale on their own and the AI cost estimate reads them. */}
          {session.can("models.manage") ? (
            <Section title="Metadata">
              <ModelForm model={model} />
            </Section>
          ) : null}
        </div>
      </div>
    </>
  );
}
