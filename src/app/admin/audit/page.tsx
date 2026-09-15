import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { listAudit } from "@/lib/admin/queries";
import { FilterBar } from "@/components/admin/filters";
import {
  EmptyState,
  PageHeader,
  Pagination,
  Panel,
  Section,
  Status,
  When,
  labelFor,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

/*
  The audit log.

  Append only, and enforced rather than promised: a trigger on the table raises
  42501 on any UPDATE or DELETE, so nothing rewrites history. Not a client, not
  an admin, not a future migration that forgets. Dropping that trigger is itself
  a schema change and therefore visible.

  Entries are written inside the same transaction as the change they describe,
  by a function no client role can execute. So an action that succeeded without
  leaving a record is not a state the database can reach, and an entry that was
  never earned cannot be inserted from outside.

  Every entry carries the state before and after, which is what makes the log
  useful rather than merely present: "role changed" tells you nothing, "user to
  admin, by this person, for this reason" is a record.
*/

const ACTIONS = [
  { value: "user.status_changed", label: "Account suspended or restored" },
  { value: "user.role_changed", label: "Role changed" },
  { value: "user.plan_changed", label: "Plan changed" },
  { value: "user.warned", label: "User warned" },
  { value: "content.status_changed", label: "Content hidden or restored" },
  { value: "report.resolved", label: "Report resolved" },
  { value: "report.triaged", label: "Report triaged" },
  { value: "tool.approve", label: "Tool approved" },
  { value: "tool.reject", label: "Tool rejected" },
  { value: "tool.request_changes", label: "Tool changes requested" },
  { value: "tool.suspend", label: "Tool suspended" },
  { value: "tool.verified_changed", label: "Tool verification" },
  { value: "model.approve", label: "Model approved" },
  { value: "model.reject", label: "Model rejected" },
  { value: "developer.verified_changed", label: "Developer verification" },
  { value: "settings.changed", label: "Setting changed" },
];

function describe(before: Record<string, unknown>, after: Record<string, unknown>): string | null {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return null;

  return keys
    .map((key) => {
      const from = before?.[key];
      const to = after?.[key];
      if (from === undefined) return `${key}: ${JSON.stringify(to)}`;
      if (to === undefined) return `${key}: was ${JSON.stringify(from)}`;
      if (JSON.stringify(from) === JSON.stringify(to)) return null;
      return `${key}: ${JSON.stringify(from)} to ${JSON.stringify(to)}`;
    })
    .filter(Boolean)
    .join(", ");
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; type?: string; page?: string }>;
}) {
  const session = await requireAdmin("audit.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const { rows, total } = await listAudit(session.db, {
    search: sp.q,
    action: sp.action,
    entityType: sp.type,
    page,
    perPage: PER_PAGE,
  });

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (sp.action) params.set("action", sp.action);
    if (sp.type) params.set("type", sp.type);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/admin/audit?${s}` : "/admin/audit";
  };

  const filtered = Boolean(sp.q || sp.action || sp.type);

  return (
    <>
      <PageHeader
        title="Audit log"
        lead="Every sensitive administrative action, permanently. Nothing here can be edited or deleted."
      />

      <div className="mt-5">
        <FilterBar
          action="/admin/audit"
          search={{
            name: "q",
            placeholder: "Action, target, reason or administrator",
            value: sp.q,
          }}
          selects={[
            {
              name: "action",
              label: "Action",
              value: sp.action,
              anyLabel: "Any action",
              options: ACTIONS,
            },
            {
              name: "type",
              label: "Target",
              value: sp.type,
              anyLabel: "Anything",
              options: [
                { value: "user", label: "User" },
                { value: "post", label: "Post" },
                { value: "comment", label: "Comment" },
                { value: "tool", label: "Tool" },
                { value: "model", label: "Model" },
                { value: "developer", label: "Developer" },
                { value: "report", label: "Report" },
                { value: "setting", label: "Setting" },
              ],
            },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title={filtered ? "Nothing matches those filters" : "No administrative actions yet"}
            body={
              filtered
                ? "Widen the filters, or clear them to see the whole log."
                : "The log starts with the migration that created the first super admin, because there was no super admin to grant it. Everything after that is an action somebody took in this dashboard."
            }
            action={
              filtered ? (
                <Link
                  href="/admin/audit"
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
          <Section>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((entry) => {
                const change = describe(entry.before_state, entry.after_state);
                return (
                  <li key={entry.id} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="text-[14px] font-medium">{labelFor(entry.action)}</span>
                      <Status value={entry.entity_type} />
                      {entry.entity_id && entry.entity_type === "user" ? (
                        <Link
                          href={`/admin/users/${entry.entity_id}`}
                          className="text-[13px] text-muted hover:text-foreground hover:underline"
                        >
                          {entry.entity_label ?? entry.entity_id.slice(0, 8)}
                        </Link>
                      ) : entry.entity_label ? (
                        <span className="text-[13px] text-muted">{entry.entity_label}</span>
                      ) : null}
                      <span className="ml-auto text-[12px] text-muted">
                        <When iso={entry.created_at} time />
                      </span>
                    </div>

                    {change ? (
                      <p className="mt-1.5 break-words font-mono text-[12px] leading-relaxed text-muted">
                        {change}
                      </p>
                    ) : null}

                    {entry.reason ? (
                      <p className="mt-1.5 text-[13px] leading-relaxed">{entry.reason}</p>
                    ) : null}

                    <p className="mt-1.5 text-[12px] text-muted">
                      {entry.actor_username ? (
                        entry.actor_id ? (
                          <Link
                            href={`/admin/users/${entry.actor_id}`}
                            className="hover:text-foreground hover:underline"
                          >
                            {entry.actor_username}
                          </Link>
                        ) : (
                          entry.actor_username
                        )
                      ) : (
                        "System"
                      )}
                      {entry.actor_role ? ` · ${labelFor(entry.actor_role)}` : null}
                      {/* Recorded only where it is operationally necessary to
                          attribute an action, and never for a read. */}
                      {entry.ip ? ` · ${entry.ip}` : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Pagination page={page} perPage={PER_PAGE} total={total} makeHref={href} />
        </>
      )}

      <Section title="How this log is protected">
        <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
          <p>
            The table has no grant to any client role, so it cannot be read or written through the
            API. Entries are inserted by a function that is not executable by anyone but the admin
            routines themselves, inside the same transaction as the change, and are read back
            through a capability checked call.
          </p>
          <p className="mt-2">
            A trigger raises on every UPDATE and DELETE, so the log is append only in the database
            rather than by convention. That protects it from a mistake as much as from an attacker:
            a cleanup migration cannot quietly remove a row.
          </p>
        </Panel>
      </Section>
    </>
  );
}
