import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { getPostThread } from "@/lib/admin/queries";
import { setContentStatus, warnUser } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import {
  Count,
  EmptyState,
  Field,
  FieldList,
  PageHeader,
  Panel,
  PersonCell,
  Section,
  Status,
  When,
  labelFor,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/*
  One post, its comments, and every report filed against any of them.

  This route existed in admin_global_search before it existed here: searching
  for a post returned a link to /admin/community/post/<id> and that was a 404.
  It is also the answer to a real moderation problem, that judging a comment
  without the post it answers is guesswork.

  Published content only, the same line the moderation queue draws. Nothing
  private is reachable from here.
*/

function StatusActions({
  entityType,
  id,
  status,
  label,
}: {
  entityType: "post" | "comment";
  id: string;
  status: string;
  label: string;
}) {
  if (status === "visible") {
    return (
      <>
        <ActionForm
          action={setContentStatus}
          fields={{ entityType, entityId: id, status: "hidden" }}
          label="Hide"
          size="xs"
          requireReason
          confirm={{
            title: `Hide this ${label} from public view?`,
            body: "The author keeps it and can still see it. Nothing is deleted.",
            confirmLabel: "Hide",
          }}
        />
        <ActionForm
          action={setContentStatus}
          fields={{ entityType, entityId: id, status: "removed" }}
          label="Remove"
          tone="danger"
          size="xs"
          requireReason
          confirm={{
            title: `Remove this ${label}?`,
            body: "Heavier than hiding, and still not a delete: the row stays and this can be reversed.",
            confirmLabel: "Remove",
          }}
        />
      </>
    );
  }

  return (
    <ActionForm
      action={setContentStatus}
      fields={{ entityType, entityId: id, status: "visible" }}
      label="Restore"
      tone="primary"
      size="xs"
      confirm={{
        title: "Put this back?",
        body: "It becomes publicly visible again, and its qualified report counter resets so the same reporters cannot immediately re-trip the auto hide.",
        confirmLabel: "Restore",
      }}
    />
  );
}

export default async function AdminPostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin("content.moderate");
  const { id } = await params;

  const thread = await getPostThread(session.db, id);
  if (!thread) notFound();

  const { post, comments, reports } = thread;
  const openReports = reports.filter((r) => r.status === "open" || r.status === "investigating");

  return (
    <>
      <PageHeader
        title="Post"
        lead={`${comments.length} comment${comments.length === 1 ? "" : "s"}, ${reports.length} report${reports.length === 1 ? "" : "s"}.`}
        action={
          <Link
            href="/admin/community"
            className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            Back to moderation
          </Link>
        }
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Section title="The post">
            <Panel className="px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Status value={post.status} />
                {post.report_count > 0 ? (
                  <span className="rounded-full bg-warn-surface px-2 py-0.5 text-[12px] font-medium text-warn-text">
                    {post.report_count} {post.report_count === 1 ? "report" : "reports"}
                    {post.qualified_report_count !== post.report_count
                      ? `, ${post.qualified_report_count} qualified`
                      : null}
                  </span>
                ) : null}
                {post.deleted_at ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[12px] text-muted">
                    Deleted by the author
                  </span>
                ) : null}
                <span className="ml-auto text-[12px] text-muted">
                  <When iso={post.created_at} time />
                </span>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed">{post.body}</p>

              {post.link_url ? (
                <p className="mt-2 break-all text-[13px] text-muted">{post.link_url}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-[12px] text-muted">
                <PersonCell
                  id={post.author.id}
                  username={post.author.username}
                  fullName={post.author.full_name}
                  avatarUrl={post.author.avatar_url}
                  accountStatus={post.author.account_status}
                />
                <span>
                  <Count n={post.like_count} /> likes
                </span>
                <span>
                  <Count n={post.comment_count} /> comments
                </span>
                {post.topic ? <span>Topic: {post.topic}</span> : null}
                <span className="font-mono">{post.id.slice(0, 8)}</span>
              </div>

              <div className="mt-3 flex flex-wrap items-start gap-2">
                <StatusActions entityType="post" id={post.id} status={post.status} label="post" />
                {session.can("users.moderate") ? (
                  <ActionForm
                    action={warnUser}
                    fields={{ userId: post.author.id }}
                    label="Warn author"
                    size="xs"
                    requireReason
                    reasonLabel="What the warning says"
                    confirm={{
                      title: `Record a warning against ${post.author.username ?? "this account"}?`,
                      body: "It joins their moderation history and the audit log. There is no notification system yet, so it is a record rather than a message: nothing tells them.",
                      confirmLabel: "Record warning",
                    }}
                  />
                ) : null}
              </div>
            </Panel>
          </Section>

          <Section
            title="Comments"
            action={
              <span className="text-[12px] text-muted">
                <Count n={comments.length} /> in the thread
              </span>
            }
          >
            {comments.length === 0 ? (
              <EmptyState title="No comments" body="Nothing has been said in reply to this post." />
            ) : (
              <ul className="space-y-3">
                {comments.map((comment) => (
                  <li key={comment.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Status value={comment.status} />
                      {comment.report_count > 0 ? (
                        <span className="rounded-full bg-warn-surface px-2 py-0.5 text-[12px] font-medium text-warn-text">
                          {comment.report_count}{" "}
                          {comment.report_count === 1 ? "report" : "reports"}
                        </span>
                      ) : null}
                      {comment.deleted_at ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[12px] text-muted">
                          Deleted by the author
                        </span>
                      ) : null}
                      <span className="ml-auto text-[12px] text-muted">
                        <When iso={comment.created_at} time />
                      </span>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed">
                      {comment.body}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-[12px] text-muted">
                      <PersonCell
                        id={comment.author.id}
                        username={comment.author.username}
                        fullName={comment.author.full_name}
                        avatarUrl={comment.author.avatar_url}
                        accountStatus={comment.author.account_status}
                      />
                      <span>
                        <Count n={comment.like_count} /> likes
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-start gap-2">
                      <StatusActions
                        entityType="comment"
                        id={comment.id}
                        status={comment.status}
                        label="comment"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="min-w-0 space-y-5">
          <Section title="Reports">
            {reports.length === 0 ? (
              <Panel className="px-4 py-4 text-[13px] text-muted">
                Nothing here has been reported.
              </Panel>
            ) : (
              <ul className="space-y-2">
                {reports.map((report) => (
                  <li key={report.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Status value={report.status} />
                      <span className="text-[12px] font-medium">{labelFor(report.reason)}</span>
                      <span className="ml-auto text-[11px] text-muted">
                        <When iso={report.created_at} />
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      Against the {report.entity_type}
                      {report.qualified ? ", qualified" : ", does not count toward auto hide"}
                    </p>
                    {report.note ? (
                      <p className="mt-2 text-[12px] leading-relaxed text-muted">{report.note}</p>
                    ) : null}
                    {session.can("reports.read") ? (
                      <Link
                        href={`/admin/reports/${report.id}`}
                        className="mt-2 inline-block text-[12px] text-muted underline underline-offset-2 hover:text-foreground"
                      >
                        Open the report
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="At a glance">
            <FieldList>
              <Field label="Status">{labelFor(post.status)}</Field>
              <Field label="Open reports">{String(openReports.length)}</Field>
              <Field label="Likes">{String(post.like_count)}</Field>
              <Field label="Saves">{String(post.save_count ?? 0)}</Field>
              <Field label="Reposts">{String(post.repost_count ?? 0)}</Field>
              <Field label="Topic">{post.topic ?? "None"}</Field>
            </FieldList>
          </Section>
        </div>
      </div>
    </>
  );
}
