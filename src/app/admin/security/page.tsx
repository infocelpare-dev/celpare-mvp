import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { listAudit, listSecurityEvents, profilesByIds } from "@/lib/admin/queries";
import { FilterBar } from "@/components/admin/filters";
import {
  EmptyState,
  PageHeader,
  Pagination,
  Panel,
  Section,
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

const PER_PAGE = 50;

/*
  The security centre.

  Two feeds, kept separate because they answer different questions:

    security_events   things that were refused. Failed sign ins, captcha
                      failures, permission denials, rate limit trips. Written
                      server side by our own code.

    admin_audit_log   things that succeeded and mattered. Role changes, plan
                      changes, suspensions. Every entry is somebody with power
                      using it.

  auth.audit_log_entries exists on this Supabase project and is empty, so the
  platform is not populating it here. That is why failed sign ins are recorded
  from our own login action instead: it is the only place that reliably sees one.
  Where a feed has no source yet, the page says so rather than showing a
  reassuring zero.
*/
export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; severity?: string; page?: string }>;
}) {
  const session = await requireAdmin("security.read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const [events, sensitive] = await Promise.all([
    listSecurityEvents(session.db, {
      kind: sp.kind,
      severity: sp.severity,
      page,
      perPage: PER_PAGE,
    }),
    session.can("audit.read")
      ? listAudit(session.db, { entityType: "user", perPage: 15 })
      : null,
  ]);

  const actors = await profilesByIds(session.db, events.rows.map((e) => e.user_id));

  const bySeverity = (s: string) => events.rows.filter((e) => e.severity === s).length;
  const byKind = (k: string) => events.rows.filter((e) => e.kind === k).length;

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (sp.kind) params.set("kind", sp.kind);
    if (sp.severity) params.set("severity", sp.severity);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/admin/security?${s}` : "/admin/security";
  };

  /* Role changes are the highest consequence action on the platform: it is the
     only one that hands out the ability to do everything else. Surfaced at the
     top rather than left to be found in a filtered audit search. */
  const roleChanges = sensitive?.rows.filter((r) => r.action === "user.role_changed") ?? [];

  return (
    <>
      <PageHeader
        title="Security"
        lead="What was refused, and what somebody with power did. Two different feeds, deliberately not merged."
        action={
          <>
            {/* Application errors are the third feed and live on their own page,
                because they come from Sentry rather than from our tables and can
                be unavailable while these two are fine. */}
            <Link
              href="/admin/sentry"
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            >
              Application errors
            </Link>
            {session.can("audit.read") ? (
              <Link
                href="/admin/audit"
                className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
              >
                Full audit log
              </Link>
            ) : null}
          </>
        }
      />

      <Section title="On this page">
        <StatGrid>
          <Stat label="Events" value={events.total} />
          <Stat
            label="Critical"
            value={bySeverity("critical")}
            tone={bySeverity("critical") > 0 ? "danger" : "neutral"}
          />
          <Stat
            label="High"
            value={bySeverity("high")}
            tone={bySeverity("high") > 0 ? "danger" : "neutral"}
          />
          <Stat
            label="Medium"
            value={bySeverity("medium")}
            tone={bySeverity("medium") > 0 ? "warn" : "neutral"}
          />
          <Stat label="Failed sign ins" value={byKind("login_failed")} />
          <Stat
            label="Permission denials"
            value={byKind("permission_denied") + byKind("admin_denied")}
            tone={byKind("admin_denied") > 0 ? "warn" : "neutral"}
          />
        </StatGrid>
      </Section>

      {roleChanges.length > 0 ? (
        <Section
          title="Role changes"
          lead="The only action that hands out administrative power. Every one requires a reason and a super admin, and nobody can change their own."
        >
          <TableWrap>
            <Table className="min-w-[680px]">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Account</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>By</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {roleChanges.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <When iso={row.created_at} time />
                    </Td>
                    <Td>
                      {row.entity_id ? (
                        <Link
                          href={`/admin/users/${row.entity_id}`}
                          className="font-medium hover:underline"
                        >
                          {row.entity_label ?? row.entity_id.slice(0, 8)}
                        </Link>
                      ) : (
                        "Unknown"
                      )}
                    </Td>
                    <Td className="text-[13px] text-muted">
                      {String(row.before_state?.role ?? "−")}
                    </Td>
                    <Td>
                      <Status value={String(row.after_state?.role ?? "user")} />
                    </Td>
                    <Td className="text-[13px]">{row.actor_username ?? "System"}</Td>
                    <Td>
                      <span className="block max-w-[260px] text-[13px] text-muted">
                        {row.reason ?? "−"}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Section>
      ) : null}

      <Section title="Security events">
        <FilterBar
          action="/admin/security"
          selects={[
            {
              name: "kind",
              label: "Kind",
              value: sp.kind,
              anyLabel: "Anything",
              options: [
                { value: "login_failed", label: "Failed sign in" },
                { value: "login_blocked", label: "Sign in blocked" },
                { value: "captcha_failed", label: "Captcha failed" },
                { value: "signup_blocked", label: "Signup blocked" },
                { value: "permission_denied", label: "Permission denied" },
                { value: "admin_denied", label: "Admin access denied" },
                { value: "rate_limited", label: "Rate limited" },
                { value: "suspicious", label: "Suspicious" },
              ],
            },
            {
              name: "severity",
              label: "Severity",
              value: sp.severity,
              anyLabel: "Any severity",
              options: [
                { value: "critical", label: "Critical" },
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ],
            },
          ]}
        />

        {events.rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No security events recorded"
              body="Failed sign ins and captcha failures are written from the login action. Recording started with this dashboard, so there is no history before it and nothing has been backfilled."
            />
          </div>
        ) : (
          <>
            <div className="mt-4">
              <TableWrap>
                <Table className="min-w-[820px]">
                  <thead>
                    <tr>
                      <Th>When</Th>
                      <Th>Severity</Th>
                      <Th>Kind</Th>
                      <Th>Account</Th>
                      <Th>Subject</Th>
                      <Th>Address</Th>
                      <Th>Detail</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.rows.map((event) => {
                      const actor = event.user_id ? actors.get(event.user_id) : null;
                      return (
                        <Tr key={event.id}>
                          <Td>
                            <When iso={event.created_at} time />
                          </Td>
                          <Td>
                            <Status value={event.severity} />
                          </Td>
                          <Td className="text-[13px]">{labelFor(event.kind)}</Td>
                          <Td>
                            {actor ? (
                              <Link
                                href={`/admin/users/${actor.id}`}
                                className="text-[13px] hover:underline"
                              >
                                {actor.username ?? actor.id.slice(0, 8)}
                              </Link>
                            ) : (
                              <span className="text-[13px] text-muted">No session</span>
                            )}
                          </Td>
                          <Td>
                            {/* An address typed into a login form is a claim,
                                not an account. Shown so a burst against one
                                address is visible, never joined to a profile. */}
                            <span className="block max-w-[200px] truncate text-[13px] text-muted">
                              {event.subject ?? "−"}
                            </span>
                          </Td>
                          <Td className="font-mono text-[12px] text-muted">{event.ip ?? "−"}</Td>
                          <Td>
                            <span className="block max-w-[240px] truncate font-mono text-[12px] text-muted">
                              {Object.keys(event.detail ?? {}).length > 0
                                ? JSON.stringify(event.detail)
                                : "−"}
                            </span>
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
              total={events.total}
              makeHref={href}
            />
          </>
        )}
      </Section>

      <Section title="What is not measured here">
        <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
          <p>
            Supabase&rsquo;s own <span className="font-mono">auth.audit_log_entries</span> table is
            empty on this project, so sign in attempts that never reach our code, and anything
            Supabase refuses before we see it, are not visible. Our own login action records what
            it sees.
          </p>
          <p className="mt-2">
            RLS refusals are not logged either. A policy denial happens inside Postgres and returns
            an empty result or a 42501 to the caller; there is no trigger on a refusal to hang a
            log write off. What is recorded instead is every refusal our own server made, which
            covers the admin surfaces completely.
          </p>
          <p className="mt-2">
            Neither feed ever contains a password, a token, a session, a captcha response or an API
            key. The detail column carries reasons and counts, and nothing in the code that writes
            it ever receives a credential.
          </p>
        </Panel>
      </Section>
    </>
  );
}
