import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import {
  getContent,
  getRelatedReports,
  getReport,
  listModerationActions,
  profilesByIds,
} from "@/lib/admin/queries";
import { resolveReport, triageReport } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import {
  EmptyState,
  Field,
  FieldList,
  PageHeader,
  Panel,
  Section,
  Status,
  When,
  labelFor,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/*
  One report, everything filed against the same item, and the decision.

  The reported content is fetched and shown, because a moderator cannot decide
  anything without reading it. It is public content either way: a post that was
  reported is a post somebody published. Nothing private is loaded here.

  Resolving covers every open report against the same item rather than just this
  one, which is what admin_resolve_report does in SQL. Five people reporting one
  post is one decision, and closing them one at a time would mean five audit
  entries for a single judgement.
*/

type ReportedContent = {
  id: string;
  body: string;
  status: string;
  author_id: string;
  created_at: string;
  link_url?: string | null;
  post_id?: string | null;
  report_count?: number;
  qualified_report_count?: number;
};

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin("reports.read");
  const { id } = await params;

  const report = await getReport(session.db, id);
  if (!report) notFound();

  const [related, history] = await Promise.all([
    getRelatedReports(session.db, report.entity_type, report.entity_id),
    listModerationActions(session.db, {
      entityType: report.entity_type,
      entityId: report.entity_id,
    }),
  ]);

  /*
    The reported item itself, where it is something with text.

    Through admin_get_content rather than a direct select, because the counters
    beside it, report_count and qualified_report_count, are not in the client
    grant on posts or comments and must not be: they are moderation signal. The
    RPC checks content.moderate, which a support account does not hold, so this
    comes back null for them and the page says so.
  */
  let content: ReportedContent | null = null;
  if (
    (report.entity_type === "post" || report.entity_type === "comment") &&
    session.can("content.moderate")
  ) {
    content = (await getContent(
      session.db,
      report.entity_type,
      report.entity_id,
    )) as ReportedContent | null;
  }

  const people = await profilesByIds(session.db, [
    ...related.map((r) => r.reporter_id),
    report.assigned_to,
    report.resolved_by,
    content?.author_id,
    report.entity_type === "user" ? report.entity_id : null,
  ]);

  const author = content ? people.get(content.author_id) : null;
  const reportedUser =
    report.entity_type === "user" ? people.get(report.entity_id) : (author ?? null);

  const open = report.status === "open" || report.status === "investigating";
  const canAct = session.can("content.moderate");

  return (
    <>
      <PageHeader
        title={`${labelFor(report.entity_type)} report`}
        lead={`${labelFor(report.reason)}. Filed ${new Date(report.created_at).toLocaleString("en-GB")}.`}
        action={
          <Link
            href="/admin/reports"
            className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            All reports
          </Link>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Status value={report.status} />
        <Status value={report.priority} />
        {related.length > 1 ? (
          <span className="rounded-full bg-warn-surface px-2 py-0.5 text-[12px] font-medium text-warn-text">
            {related.length} reports against this item
          </span>
        ) : null}
        <span className="rounded-full border border-border px-2 py-0.5 text-[12px] text-muted">
          {report.source === "user" ? "Filed by a person" : report.source}
        </span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Section title="What was reported">
            {content ? (
              <div className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Status value={content.status} />
                  {author ? (
                    <Link
                      href={`/admin/users/${author.id}`}
                      className="text-[13px] font-medium hover:underline"
                    >
                      {author.username ?? author.full_name ?? author.id}
                    </Link>
                  ) : null}
                  {/* The raw total and the qualified total are different
                      numbers on purpose (D73): only qualified reports count
                      toward auto hide, and showing both stops a brigade
                      looking like consensus. */}
                  {content.report_count ? (
                    <span className="text-[12px] text-muted">
                      {content.report_count} reported, {content.qualified_report_count ?? 0}{" "}
                      counted toward auto hide
                    </span>
                  ) : null}
                  <span className="ml-auto text-[12px] text-muted">
                    <When iso={content.created_at} time />
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed">
                  {content.body}
                </p>
                {content.link_url ? (
                  <p className="mt-2 break-all text-[13px] text-muted">{content.link_url}</p>
                ) : null}
              </div>
            ) : reportedUser ? (
              <Panel className="p-4">
                <p className="text-[13px] text-muted">This report is about an account.</p>
                <Link
                  href={`/admin/users/${reportedUser.id}`}
                  className="mt-2 inline-block text-[14px] font-medium hover:underline"
                >
                  {reportedUser.username ?? reportedUser.id}
                </Link>
              </Panel>
            ) : (
              <Panel className="p-4 text-[13px] leading-relaxed text-muted">
                The reported {report.entity_type} could not be loaded. It may have been hard
                deleted, or it is a type with no detail view in the dashboard yet. Its id is{" "}
                <span className="font-mono">{report.entity_id}</span>.
              </Panel>
            )}
          </Section>

          <Section
            title={related.length > 1 ? `All ${related.length} reports` : "The report"}
            lead={
              related.length > 1
                ? "Resolving any one of these resolves all of them, because they are one decision."
                : undefined
            }
          >
            <ul className="divide-y divide-border rounded-xl border border-border">
              {related.map((r) => {
                const reporter = people.get(r.reporter_id);
                return (
                  <li key={r.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[13px] font-medium">{labelFor(r.reason)}</span>
                      <Status value={r.status} />
                      {r.qualified ? (
                        <span className="text-[12px] text-muted">Counted toward auto hide</span>
                      ) : (
                        <span className="text-[12px] text-muted">Did not count</span>
                      )}
                      <span className="ml-auto text-[12px] text-muted">
                        <When iso={r.created_at} time />
                      </span>
                    </div>
                    {r.note ? (
                      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{r.note}</p>
                    ) : null}
                    <p className="mt-1.5 text-[12px] text-muted">
                      {reporter ? (
                        <Link href={`/admin/users/${reporter.id}`} className="hover:underline">
                          {reporter.username ?? reporter.id}
                        </Link>
                      ) : (
                        "Unknown reporter"
                      )}
                      {r.resolution_note ? ` · resolved: ${r.resolution_note}` : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title="Moderation history for this item">
            {history.length === 0 ? (
              <EmptyState
                title="Nothing has been done yet"
                body="Decisions on this item appear here with their reason and who made them."
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
              <Field label="Report id" mono>
                {report.id}
              </Field>
              <Field label="Target" mono>
                {report.entity_type} / {report.entity_id}
              </Field>
              <Field label="Priority">
                <Status value={report.priority} />
              </Field>
              <Field label="Assigned to">
                {report.assigned_to
                  ? (people.get(report.assigned_to)?.username ?? report.assigned_to)
                  : "Nobody"}
              </Field>
              <Field label="Filed">
                <When iso={report.created_at} time />
              </Field>
              {report.resolved_at ? (
                <Field label="Resolved">
                  <When iso={report.resolved_at} time />
                  {report.resolved_by ? (
                    <span className="ml-2 text-muted">
                      by {people.get(report.resolved_by)?.username ?? "an administrator"}
                    </span>
                  ) : null}
                </Field>
              ) : null}
              {report.resolution_note ? (
                <Field label="Resolution note">{report.resolution_note}</Field>
              ) : null}
            </FieldList>
          </Section>

          {!canAct ? (
            <Section title="Decision">
              <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
                Your role can read the reports queue and not act on it.
              </Panel>
            </Section>
          ) : (
            <>
              <Section title="Triage">
                <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
                  <p className="text-[13px] leading-relaxed text-muted">
                    Picking a report up marks it as being investigated, so two people do not work
                    the same one.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <ActionForm
                      action={triageReport}
                      fields={{ reportId: report.id, assign: report.assigned_to ? "no" : "yes" }}
                      label={report.assigned_to ? "Unassign" : "Assign to me"}
                      size="xs"
                    />
                    {(["low", "normal", "high", "critical"] as const)
                      .filter((p) => p !== report.priority)
                      .map((p) => (
                        <ActionForm
                          key={p}
                          action={triageReport}
                          fields={{ reportId: report.id, priority: p }}
                          label={`Set ${p}`}
                          size="xs"
                          tone={p === "critical" ? "danger" : "default"}
                        />
                      ))}
                  </div>
                </div>
              </Section>

              <Section title="Resolve">
                {!open ? (
                  <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
                    This report is already {report.status}. Reopening is not an action: file a
                    fresh report if the situation has changed, so the history stays honest.
                  </Panel>
                ) : (
                  <div className="flex flex-col gap-3">
                    {report.entity_type === "post" || report.entity_type === "comment" ? (
                      <ActionForm
                        action={resolveReport}
                        fields={{
                          reportId: report.id,
                          resolution: "upheld",
                          contentAction: "removed",
                        }}
                        label="Uphold and remove the content"
                        tone="danger"
                        requireReason
                        reasonLabel="Resolution note"
                        confirm={{
                          title: "Uphold this report?",
                          body: `Every open report against this item is closed as upheld and the ${report.entity_type} is removed from public view. Nothing is deleted.`,
                          confirmLabel: "Uphold and remove",
                        }}
                      />
                    ) : null}

                    <ActionForm
                      action={resolveReport}
                      fields={{ reportId: report.id, resolution: "upheld" }}
                      label="Uphold, leave the content alone"
                      requireReason
                      reasonLabel="Resolution note"
                      confirm={{
                        title: "Uphold without removing?",
                        body: "The report was valid but the content stays up. Use this when the right consequence is a warning to the author rather than a removal.",
                        confirmLabel: "Uphold",
                      }}
                    />

                    <ActionForm
                      action={resolveReport}
                      fields={{ reportId: report.id, resolution: "dismissed" }}
                      label="Dismiss"
                      requireReason
                      reasonLabel="Why this is dismissed"
                      confirm={{
                        title: "Dismiss this report?",
                        body: "Every open report against this item is closed as dismissed. If the item was auto hidden, dismissing does not restore it on its own: restore it from the community page.",
                        confirmLabel: "Dismiss",
                      }}
                    />

                    {report.entity_type === "post" || report.entity_type === "comment" ? (
                      <ActionForm
                        action={resolveReport}
                        fields={{
                          reportId: report.id,
                          resolution: "dismissed",
                          contentAction: "visible",
                        }}
                        label="Dismiss and restore the content"
                        tone="primary"
                        requireReason
                        reasonLabel="Why this is dismissed"
                        confirm={{
                          title: "Dismiss and put it back?",
                          body: "For something auto hidden that should not have been. The qualified report counter resets, so the same reporters cannot immediately re-trip the threshold.",
                          confirmLabel: "Dismiss and restore",
                        }}
                      />
                    ) : null}
                  </div>
                )}
              </Section>

              {reportedUser && session.can("users.moderate") ? (
                <Section title="The person">
                  <Panel className="px-4 py-4">
                    <p className="text-[13px] leading-relaxed text-muted">
                      Warning or suspending an account is a separate decision from what happens to
                      this one piece of content, so it lives on their account page.
                    </p>
                    <Link
                      href={`/admin/users/${reportedUser.id}`}
                      className="mt-2 inline-block text-[13px] font-medium hover:underline"
                    >
                      {reportedUser.username ?? reportedUser.id}
                    </Link>
                  </Panel>
                </Section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
