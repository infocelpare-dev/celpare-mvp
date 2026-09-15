import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { listComments, listPosts, profilesByIds } from "@/lib/admin/queries";
import { setContentStatus, warnUser } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { FilterTabs } from "@/components/admin/filters";
import {
  Count,
  EmptyState,
  PageHeader,
  Pagination,
  PersonCell,
  Section,
  Status,
  When,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

/*
  Community moderation.

  Posts and comments are published content: they were written in public and are
  read here in public. That is the line this dashboard draws. Nothing private
  appears on this page, and there is no surface anywhere in the admin area that
  reads a conversation, a saved tool or a collection.

  The tabs lead with reported rather than with everything, because a moderator
  opening this page is almost always coming to deal with something specific.
*/

const TABS = [
  { key: "reported", label: "Reported" },
  { key: "hidden", label: "Hidden" },
  { key: "removed", label: "Removed" },
  { key: "all", label: "Everything" },
];

type Search = { view?: string; kind?: string; page?: string };

export default async function AdminCommunityPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await requireAdmin("content.moderate");
  const sp = await searchParams;

  const view = TABS.some((t) => t.key === sp.view) ? sp.view! : "reported";
  const kind = sp.kind === "comments" ? "comments" : "posts";
  const page = Math.max(1, Number(sp.page) || 1);

  const opts = {
    page,
    perPage: PER_PAGE,
    status: view === "hidden" ? "hidden" : view === "removed" ? "removed" : undefined,
    reported: view === "reported",
  };

  const [posts, comments] = await Promise.all([
    kind === "posts" ? listPosts(session.db, opts) : Promise.resolve({ rows: [], total: 0 }),
    kind === "comments" ? listComments(session.db, opts) : Promise.resolve({ rows: [], total: 0 }),
  ]);

  const rows = kind === "posts" ? posts.rows : comments.rows;
  const total = kind === "posts" ? posts.total : comments.total;
  const authors = await profilesByIds(session.db, rows.map((r) => r.author_id));

  const href = (next: Partial<Search>) => {
    const params = new URLSearchParams();
    const merged = { view, kind, page: String(page), ...next };
    if (merged.view !== "reported") params.set("view", merged.view!);
    if (merged.kind !== "posts") params.set("kind", merged.kind!);
    if (Number(merged.page) > 1) params.set("page", String(merged.page));
    const s = params.toString();
    return s ? `/admin/community?${s}` : "/admin/community";
  };

  return (
    <>
      <PageHeader
        title="Community moderation"
        lead="Posts and comments, as published. Hiding removes something from public view without deleting it, which is the only kind of delete this platform has."
        action={
          session.can("reports.read") ? (
            <Link
              href="/admin/reports"
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            >
              Reports centre
            </Link>
          ) : null
        }
      />

      <div className="mt-5">
        <FilterTabs
          label="Moderation view"
          active={href({ view, page: "1" })}
          items={TABS.map((t) => ({
            href: href({ view: t.key, page: "1" }),
            label: t.label,
          }))}
        />
      </div>

      <div className="mt-4 flex gap-2">
        {(["posts", "comments"] as const).map((k) => (
          <Link
            key={k}
            href={href({ kind: k, page: "1" })}
            aria-current={kind === k ? "true" : undefined}
            className={
              kind === k
                ? "rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-medium"
                : "rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            }
          >
            {k === "posts" ? "Posts" : "Comments"}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title={
              view === "reported"
                ? "Nothing has been reported"
                : view === "hidden"
                  ? "Nothing is hidden"
                  : view === "removed"
                    ? "Nothing has been removed"
                    : `No ${kind} yet`
            }
            body={
              view === "all"
                ? "The community tables, counters, auto hide and reporting are all live and verified. There is no composer yet, so nobody can post. This fills in once tasks 4.12 onward ship."
                : "Content appears here as soon as it reaches this state. An empty queue is the good outcome."
            }
          />
        </div>
      ) : (
        <>
          <Section>
            <ul className="space-y-3">
              {rows.map((row) => {
                const author = authors.get(row.author_id);
                const reportCount = row.report_count ?? 0;
                const isPost = kind === "posts";
                const qualified =
                  "qualified_report_count" in row ? row.qualified_report_count : 0;

                return (
                  <li key={row.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Status value={row.status} />
                      {reportCount > 0 ? (
                        <span className="rounded-full bg-warn-surface px-2 py-0.5 text-[12px] font-medium text-warn-text">
                          {reportCount} {reportCount === 1 ? "report" : "reports"}
                          {/* The raw total and the qualified total are different
                              numbers on purpose (D73): only qualified reports
                              count toward auto hide, and showing both stops a
                              brigade looking like consensus. */}
                          {qualified !== reportCount ? `, ${qualified} qualified` : null}
                        </span>
                      ) : null}
                      {row.deleted_at ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[12px] text-muted">
                          Deleted by the author
                        </span>
                      ) : null}
                      <span className="ml-auto text-[12px] text-muted">
                        <When iso={row.created_at} time />
                      </span>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed">
                      {row.body}
                    </p>

                    {isPost && "link_url" in row && row.link_url ? (
                      <p className="mt-2 break-all text-[13px] text-muted">{row.link_url}</p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-[12px] text-muted">
                      {author ? (
                        <PersonCell
                          id={author.id}
                          username={author.username}
                          fullName={author.full_name}
                          avatarUrl={author.avatar_url}
                          accountStatus={author.account_status}
                        />
                      ) : (
                        <span>Unknown author</span>
                      )}
                      <span>
                        <Count n={row.like_count} /> likes
                      </span>
                      {isPost && "comment_count" in row ? (
                        <span>
                          <Count n={row.comment_count} /> comments
                        </span>
                      ) : null}
                      <span className="font-mono">{row.id.slice(0, 8)}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-start gap-2">
                      {/* Brief section 8 asks for the user level consequence to
                          be reachable from the content that prompted it. A
                          warning is recorded here; a suspension is not, because
                          it needs an end date and a considered reason, and that
                          belongs on the account rather than on one post. */}
                      {session.can("users.moderate") && author ? (
                        <ActionForm
                          action={warnUser}
                          fields={{ userId: author.id }}
                          label="Warn author"
                          size="xs"
                          requireReason
                          reasonLabel="What the warning says"
                          confirm={{
                            title: `Record a warning against ${author.username ?? "this account"}?`,
                            body: "It joins their moderation history and the audit log. There is no notification system yet, so it is a record rather than a message: nothing tells them.",
                            confirmLabel: "Record warning",
                          }}
                        />
                      ) : null}

                      {row.status === "visible" ? (
                        <>
                          <ActionForm
                            action={setContentStatus}
                            fields={{
                              entityType: isPost ? "post" : "comment",
                              entityId: row.id,
                              status: "hidden",
                            }}
                            label="Hide"
                            size="xs"
                            requireReason
                            confirm={{
                              title: "Hide this from public view?",
                              body: "The author keeps it and can still see it. Nothing is deleted.",
                              confirmLabel: "Hide",
                            }}
                          />
                          <ActionForm
                            action={setContentStatus}
                            fields={{
                              entityType: isPost ? "post" : "comment",
                              entityId: row.id,
                              status: "removed",
                            }}
                            label="Remove"
                            tone="danger"
                            size="xs"
                            requireReason
                            confirm={{
                              title: "Remove this?",
                              body: "Heavier than hiding, and still not a delete: the row stays and this can be reversed.",
                              confirmLabel: "Remove",
                            }}
                          />
                        </>
                      ) : (
                        <ActionForm
                          action={setContentStatus}
                          fields={{
                            entityType: isPost ? "post" : "comment",
                            entityId: row.id,
                            status: "visible",
                          }}
                          label="Restore"
                          tone="primary"
                          size="xs"
                          confirm={{
                            title: "Put this back?",
                            body: "It becomes publicly visible again, and its qualified report counter resets so the same reporters cannot immediately re-trip the auto hide.",
                            confirmLabel: "Restore",
                          }}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Pagination
            page={page}
            perPage={PER_PAGE}
            total={total}
            makeHref={(p) => href({ page: String(p) })}
          />
        </>
      )}
    </>
  );
}
