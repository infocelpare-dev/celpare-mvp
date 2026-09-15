import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { listTools, profilesByIds } from "@/lib/admin/queries";
import { FilterBar } from "@/components/admin/filters";
import {
  Count,
  EmptyState,
  PageHeader,
  Pagination,
  PersonCell,
  Status,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
  When,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const PER_PAGE = 25;

type Search = {
  q?: string;
  status?: string;
  source?: string;
  sort?: string;
  page?: string;
};

export default async function AdminToolsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await requireAdmin("submissions.review");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await listTools(session.db, {
    search: sp.q,
    status: sp.status,
    source: sp.source,
    sort: sp.sort,
    page,
    perPage: PER_PAGE,
  });

  const owners = await profilesByIds(session.db, rows.map((r) => r.developer_id));

  const query = (nextPage: number) => {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (sp.status) params.set("status", sp.status);
    if (sp.source) params.set("source", sp.source);
    if (sp.sort) params.set("sort", sp.sort);
    if (nextPage > 1) params.set("page", String(nextPage));
    const s = params.toString();
    return s ? `/admin/tools?${s}` : "/admin/tools";
  };

  const filtered = Boolean(sp.q || sp.status || sp.source);

  return (
    <>
      <PageHeader
        title="Tools"
        lead="The whole catalogue, at every status. Approved rows are the ones the public and Ask Celpare can see."
        action={
          <Link
            href="/admin/submissions"
            className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            Review queue
          </Link>
        }
      />

      <div className="mt-5">
        <FilterBar
          action="/admin/tools"
          search={{ name: "q", placeholder: "Tool name", value: sp.q }}
          selects={[
            {
              name: "status",
              label: "Status",
              value: sp.status,
              anyLabel: "Any status",
              options: [
                { value: "approved", label: "Approved" },
                { value: "pending", label: "Pending" },
                { value: "changes_required", label: "Changes required" },
                { value: "draft", label: "Draft" },
                { value: "rejected", label: "Rejected" },
              ],
            },
            {
              name: "source",
              label: "Source",
              value: sp.source,
              anyLabel: "Any source",
              options: [
                { value: "admin_seed", label: "Seeded" },
                { value: "developer_submission", label: "Developer" },
                { value: "import", label: "Imported" },
              ],
            },
            {
              name: "sort",
              label: "Sort",
              value: sp.sort,
              anyLabel: "Newest first",
              options: [
                { value: "created_asc", label: "Oldest first" },
                { value: "name_asc", label: "Name" },
                { value: "popular", label: "Popularity" },
                { value: "rating", label: "Rating" },
              ],
            },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title={filtered ? "No tools match those filters" : "The catalogue is empty"}
            body={
              filtered
                ? "Widen the filters, or clear them to see the whole catalogue."
                : "Tools arrive by developer submission or by a seed import."
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-5">
            <TableWrap>
              <Table className="min-w-[940px]">
                <thead>
                  <tr>
                    <Th>Tool</Th>
                    <Th>Status</Th>
                    <Th>Developer</Th>
                    <Th>Source</Th>
                    <Th>Pricing</Th>
                    <Th numeric>Rating</Th>
                    <Th numeric>Popularity</Th>
                    <Th>Submitted</Th>
                    <Th>Published</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((tool) => {
                    const owner = tool.developer_id ? owners.get(tool.developer_id) : null;
                    return (
                      <Tr key={tool.id}>
                        <Td>
                          <Link
                            href={`/admin/tools/${tool.id}`}
                            className="flex min-w-0 items-center gap-2.5 hover:underline"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{tool.name}</span>
                              <span className="block truncate font-mono text-[12px] text-muted">
                                {tool.slug}
                              </span>
                            </span>
                            {tool.verified ? <Status value="approved" /> : null}
                          </Link>
                        </Td>
                        <Td>
                          <Status value={tool.status} />
                        </Td>
                        <Td>
                          {owner ? (
                            <PersonCell
                              id={owner.id}
                              username={owner.username}
                              fullName={owner.full_name}
                              avatarUrl={owner.avatar_url}
                              accountStatus={owner.account_status}
                            />
                          ) : (
                            <span className="text-[13px] text-muted">Seeded, no owner</span>
                          )}
                        </Td>
                        <Td className="text-[13px] text-muted">{tool.source.replace(/_/g, " ")}</Td>
                        <Td className="text-[13px] text-muted">{tool.pricing_model ?? "−"}</Td>
                        <Td numeric>
                          {tool.rating != null ? (
                            <span className="tnum">
                              {Number(tool.rating).toFixed(1)}
                              <span className="ml-1 text-muted">({tool.rating_count})</span>
                            </span>
                          ) : (
                            /* No invented metrics. A tool nobody has rated shows
                               no rating rather than a zero that reads as bad.
                               D13 and D30. */
                            <span className="text-muted">Unrated</span>
                          )}
                        </Td>
                        <Td numeric>
                          <Count n={Math.round(tool.popularity_score)} hideZero />
                        </Td>
                        <Td>
                          <When iso={tool.submitted_at} />
                        </Td>
                        <Td>
                          <When iso={tool.published_at} />
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </div>

          <Pagination page={page} perPage={PER_PAGE} total={total} makeHref={query} />
        </>
      )}
    </>
  );
}
