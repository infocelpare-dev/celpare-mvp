import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { listReports, profilesByIds } from "@/lib/admin/queries";
import { FilterBar, FilterTabs } from "@/components/admin/filters";
import {
  EmptyState,
  PageHeader,
  Pagination,
  PersonCell,
  Stat,
  StatGrid,
  Status,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
  When,
  labelFor,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

/*
  The reports centre.

  One table covers every kind of report, which is why the entity type is a
  column rather than a separate page per kind. The schema already worked that
  way for posts and comments; users, tools, models and developers were added
  alongside them so that a complaint about a developer lands in the same queue a
  moderator is already working, instead of in an inbox nobody opens.

  Only posts and comments currently have a surface that files a report. The
  other four types are reachable by the schema and have no reporting UI yet,
  which is stated on the page rather than left to be discovered.
*/

const TABS = [
  { key: "open", label: "Open" },
  { key: "upheld", label: "Upheld" },
  { key: "dismissed", label: "Dismissed" },
  { key: "", label: "Everything" },
];

type Search = {
  status?: string;
  type?: string;
  reason?: string;
  priority?: string;
  page?: string;
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await requireAdmin("reports.read");
  const sp = await searchParams;

  const status = sp.status ?? "open";
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await listReports(session.db, {
    status: status || undefined,
    entityType: sp.type,
    reason: sp.reason,
    priority: sp.priority,
    page,
    perPage: PER_PAGE,
  });

  const reporters = await profilesByIds(session.db, [
    ...rows.map((r) => r.reporter_id),
    ...rows.map((r) => r.assigned_to),
  ]);

  const href = (next: Partial<Search>) => {
    const merged = { ...sp, ...next };
    const params = new URLSearchParams();
    if (merged.status !== undefined && merged.status !== "open") params.set("status", merged.status);
    if (merged.type) params.set("type", merged.type);
    if (merged.reason) params.set("reason", merged.reason);
    if (merged.priority) params.set("priority", merged.priority);
    if (Number(merged.page) > 1) params.set("page", String(merged.page));
    const s = params.toString();
    return s ? `/admin/reports?${s}` : "/admin/reports";
  };

  const critical = rows.filter((r) => r.priority === "critical").length;
  const high = rows.filter((r) => r.priority === "high").length;
  const unassigned = rows.filter((r) => !r.assigned_to).length;

  return (
    <>
      <PageHeader
        title="Reports"
        lead="Every complaint, whatever it is about. Posts and comments can be reported today; the other types are ready in the schema and have no reporting surface yet."
      />

      <div className="mt-5">
        <StatGrid>
          <Stat
            label="On this page"
            value={rows.length}
            hint={`${total.toLocaleString("en-GB")} matching in total`}
          />
          <Stat
            label="Critical"
            value={critical}
            tone={critical > 0 ? "danger" : "neutral"}
          />
          <Stat label="High" value={high} tone={high > 0 ? "warn" : "neutral"} />
          <Stat
            label="Unassigned"
            value={unassigned}
            tone={unassigned > 0 ? "warn" : "neutral"}
            hint="Nobody has picked these up"
          />
        </StatGrid>
      </div>

      <div className="mt-5">
        <FilterTabs
          label="Report status"
          active={href({ status: status, page: "1" })}
          items={TABS.map((t) => ({
            href: href({ status: t.key, page: "1" }),
            label: t.label,
          }))}
        />
      </div>

      <div className="mt-4">
        <FilterBar
          action="/admin/reports"
          hidden={{ status: status === "open" ? undefined : status }}
          selects={[
            {
              name: "type",
              label: "About",
              value: sp.type,
              anyLabel: "Anything",
              options: [
                { value: "post", label: "Post" },
                { value: "comment", label: "Comment" },
                { value: "user", label: "User" },
                { value: "tool", label: "Tool" },
                { value: "model", label: "Model" },
                { value: "developer", label: "Developer" },
              ],
            },
            {
              name: "reason",
              label: "Reason",
              value: sp.reason,
              anyLabel: "Any reason",
              options: [
                { value: "spam", label: "Spam" },
                { value: "abuse", label: "Abuse" },
                { value: "harassment", label: "Harassment" },
                { value: "offtopic", label: "Off topic" },
                { value: "illegal", label: "Illegal" },
                { value: "security", label: "Security" },
                { value: "other", label: "Other" },
              ],
            },
            {
              name: "priority",
              label: "Priority",
              value: sp.priority,
              anyLabel: "Any priority",
              options: [
                { value: "critical", label: "Critical" },
                { value: "high", label: "High" },
                { value: "normal", label: "Normal" },
                { value: "low", label: "Low" },
              ],
            },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title={status === "open" ? "Nothing is waiting" : "No reports match"}
            body={
              status === "open"
                ? "An empty open queue is the good state. Reports arrive here the moment somebody files one, and three qualified reports against one item hide it automatically while it waits."
                : "Try another tab or widen the filters."
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-5">
            <TableWrap>
              <Table className="min-w-[900px]">
                <thead>
                  <tr>
                    <Th>Priority</Th>
                    <Th>About</Th>
                    <Th>Reason</Th>
                    <Th>Note</Th>
                    <Th>Reporter</Th>
                    <Th>Assigned</Th>
                    <Th>Status</Th>
                    <Th>Filed</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((report) => {
                    const reporter = reporters.get(report.reporter_id);
                    const assignee = report.assigned_to ? reporters.get(report.assigned_to) : null;

                    return (
                      <Tr key={report.id}>
                        <Td>
                          <Status value={report.priority} />
                        </Td>
                        <Td>
                          <Link
                            href={`/admin/reports/${report.id}`}
                            className="font-medium hover:underline"
                          >
                            {labelFor(report.entity_type)}
                          </Link>
                        </Td>
                        <Td className="text-[13px]">{labelFor(report.reason)}</Td>
                        <Td>
                          <span className="block max-w-[260px] truncate text-[13px] text-muted">
                            {report.note ?? "−"}
                          </span>
                        </Td>
                        <Td>
                          {reporter ? (
                            <PersonCell
                              id={reporter.id}
                              username={reporter.username}
                              fullName={reporter.full_name}
                              avatarUrl={reporter.avatar_url}
                              accountStatus={reporter.account_status}
                              /* Whether a report counted toward auto hide is the
                                 first thing a moderator wants to know about the
                                 person who filed it. D73. */
                              sub={report.qualified ? "Counted toward auto hide" : "Did not count"}
                            />
                          ) : (
                            <span className="text-[13px] text-muted">Unknown</span>
                          )}
                        </Td>
                        <Td>
                          {assignee ? (
                            <span className="text-[13px]">{assignee.username ?? assignee.id}</span>
                          ) : (
                            <span className="text-[13px] text-muted">Nobody</span>
                          )}
                        </Td>
                        <Td>
                          <Status value={report.status} />
                        </Td>
                        <Td>
                          <When iso={report.created_at} />
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </div>

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
