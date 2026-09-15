import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { listUsers } from "@/lib/admin/queries";
import { ALL_ROLES, ROLE_LABEL } from "@/lib/admin/capabilities";
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
  role?: string;
  plan?: string;
  status?: string;
  verified?: string;
  sort?: string;
  page?: string;
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await requireAdmin("users.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await listUsers(session.db, {
    search: sp.q,
    role: sp.role,
    plan: sp.plan,
    status: sp.status,
    verified: sp.verified,
    sort: sp.sort,
    page,
    perPage: PER_PAGE,
  });

  /* Rebuilt from the parsed values rather than passed through, so a page link
     cannot carry an unexpected parameter forward. */
  const query = (nextPage: number) => {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (sp.role) params.set("role", sp.role);
    if (sp.plan) params.set("plan", sp.plan);
    if (sp.status) params.set("status", sp.status);
    if (sp.verified) params.set("verified", sp.verified);
    if (sp.sort) params.set("sort", sp.sort);
    if (nextPage > 1) params.set("page", String(nextPage));
    const s = params.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };

  const filtered = Boolean(sp.q || sp.role || sp.plan || sp.status || sp.verified);

  return (
    <>
      <PageHeader
        title="Users"
        lead="Every account on the platform. Email addresses are shown because support and moderation need them, and nothing else private is."
      />

      <div className="mt-5">
        <FilterBar
          action="/admin/users"
          search={{ name: "q", placeholder: "Username, name, email or user id", value: sp.q }}
          selects={[
            {
              name: "role",
              label: "Role",
              value: sp.role,
              anyLabel: "Any role",
              options: ALL_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
            },
            {
              name: "plan",
              label: "Plan",
              value: sp.plan,
              anyLabel: "Any plan",
              options: [
                { value: "free", label: "Free" },
                { value: "pro", label: "Pro" },
                { value: "premium", label: "Premium" },
              ],
            },
            {
              name: "status",
              label: "Status",
              value: sp.status,
              anyLabel: "Any status",
              options: [
                { value: "active", label: "Active" },
                { value: "suspended", label: "Suspended" },
                { value: "disabled", label: "Disabled" },
                { value: "deleted", label: "Deleted" },
              ],
            },
            {
              name: "verified",
              label: "Email",
              value: sp.verified,
              anyLabel: "Any",
              options: [
                { value: "yes", label: "Confirmed" },
                { value: "no", label: "Not confirmed" },
              ],
            },
            {
              name: "sort",
              label: "Sort",
              value: sp.sort,
              anyLabel: "Newest first",
              options: [
                { value: "created_asc", label: "Oldest first" },
                { value: "active_desc", label: "Recently active" },
                { value: "username_asc", label: "Username" },
              ],
            },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title={filtered ? "No accounts match those filters" : "No accounts yet"}
            body={
              filtered
                ? "Widen the filters, or clear them to see every account."
                : "Accounts appear here as soon as people sign up."
            }
            action={
              filtered ? (
                <Link
                  href="/admin/users"
                  className="rounded-lg border border-border px-3 py-1.5 text-[13px] transition-colors duration-200 ease-out hover:bg-surface"
                >
                  Clear filters
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-5">
            <TableWrap>
              <Table className="min-w-[980px]">
                <thead>
                  <tr>
                    <Th>Account</Th>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th>Plan</Th>
                    <Th>Status</Th>
                    <Th numeric>Posts</Th>
                    <Th numeric>Comments</Th>
                    <Th numeric>Tools</Th>
                    <Th numeric>Reports</Th>
                    <Th>Joined</Th>
                    <Th>Last seen</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((user) => (
                    <Tr key={user.id}>
                      <Td>
                        <PersonCell
                          id={user.id}
                          username={user.username}
                          fullName={user.full_name}
                          avatarUrl={user.avatar_url}
                          sub={user.is_developer ? "Developer mode on" : undefined}
                        />
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          <span className="max-w-[220px] truncate text-[13px] text-muted">
                            {user.email}
                          </span>
                          {/* An unconfirmed address is the thing worth flagging.
                              A confirmed one is the normal case and needs no
                              badge competing for attention. */}
                          {user.email_confirmed ? null : <Status value="pending" />}
                        </span>
                      </Td>
                      <Td>
                        {user.role === "user" ? (
                          <span className="text-muted">User</span>
                        ) : (
                          <Status value={user.role} />
                        )}
                      </Td>
                      <Td className="text-[13px]">{user.plan}</Td>
                      <Td>
                        <Status value={user.account_status} />
                      </Td>
                      <Td numeric>
                        <Count n={user.post_count} hideZero />
                      </Td>
                      <Td numeric>
                        <Count n={user.comment_count} hideZero />
                      </Td>
                      <Td numeric>
                        <Count n={user.tool_count} hideZero />
                      </Td>
                      <Td numeric>
                        {user.reports_against > 0 ? (
                          <span className="tnum text-danger-text">{user.reports_against}</span>
                        ) : (
                          <span className="text-muted">&#8722;</span>
                        )}
                      </Td>
                      <Td>
                        <When iso={user.created_at} />
                      </Td>
                      <Td>
                        <When iso={user.last_sign_in_at} />
                      </Td>
                    </Tr>
                  ))}
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
