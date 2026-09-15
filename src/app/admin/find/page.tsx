import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { globalSearch } from "@/lib/admin/queries";
import { EmptyState, PageHeader, Status, labelFor } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/*
  Global admin search results.

  A separate page rather than a dropdown under the box, on purpose. A dropdown
  needs client state, keyboard handling and a debounce to feel right, and gives
  back six truncated rows; a page can group by entity type, show the status of
  each hit, and be linked to.

  The capability gating is entirely inside admin_global_search: each branch is
  wrapped in the capability that owns that entity, so a support account searching
  "chatgpt" gets tools and no audit entries. There is no code path here that
  could widen that, because this page never queries a table directly.
*/

const KIND_LABEL: Record<string, string> = {
  user: "Users",
  developer: "Developers",
  tool: "Tools",
  model: "Models",
  report: "Reports",
  post: "Posts",
  comment: "Comments",
  audit: "Audit events",
};

const KIND_ORDER = ["user", "developer", "tool", "model", "report", "post", "comment", "audit"];

export default async function AdminFindPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireAdmin();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const hits = query.length >= 2 ? await globalSearch(session.db, query) : [];

  const grouped = new Map<string, typeof hits>();
  for (const hit of hits) {
    const list = grouped.get(hit.kind) ?? [];
    list.push(hit);
    grouped.set(hit.kind, list);
  }
  const kinds = KIND_ORDER.filter((k) => grouped.has(k));

  return (
    <>
      <PageHeader
        title={query ? `Results for "${query}"` : "Search"}
        lead={
          query.length >= 2
            ? `${hits.length} ${hits.length === 1 ? "match" : "matches"}. Only entities your role can reach are searched.`
            : "Search users, developers, tools, models, reports, posts, comments and audit events."
        }
      />

      {query.length < 2 ? (
        <div className="mt-6">
          <EmptyState
            title="Type at least two characters"
            body="Use the box in the bar above. A user id, a tool slug, a report id or a phrase from a post all work."
          />
        </div>
      ) : hits.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing matched"
            body="Nothing your role can see matches that. A search that finds nothing and a search that is refused look the same on purpose: the dashboard does not confirm that something exists behind a door you cannot open."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {kinds.map((kind) => (
            <section key={kind}>
              <h2 className="mb-2 font-display text-[15px] font-semibold">
                {KIND_LABEL[kind] ?? labelFor(kind)}
              </h2>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {grouped.get(kind)!.map((hit) => (
                  <li key={`${hit.kind}-${hit.id}`}>
                    <Link
                      href={hit.href}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors duration-200 ease-out hover:bg-surface"
                    >
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                        {hit.label}
                      </span>
                      {hit.sublabel ? (
                        <span className="min-w-0 max-w-[280px] truncate text-[13px] text-muted">
                          {hit.sublabel}
                        </span>
                      ) : null}
                      {hit.status ? <Status value={hit.status} /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
