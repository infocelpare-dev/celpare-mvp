import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { getUserDetail } from "@/lib/admin/queries";
import { ALL_ROLES, RANK, ROLE_DESCRIPTION, ROLE_LABEL, type Role } from "@/lib/admin/capabilities";
import { setUserPlan, setUserRole, setUserStatus, warnUser } from "@/app/actions/admin";
import { ActionForm, ActionSelectForm } from "@/components/admin/action-form";
import { RankedBars, TimeSeries } from "@/components/ui/charts";
import {
  EmptyState,
  Field,
  FieldList,
  PageHeader,
  Panel,
  Section,
  Stat,
  StatGrid,
  Status,
  When,
  labelFor,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/*
  One person, everything operationally relevant about them, and the actions.

  What is deliberately NOT here, and this is the privacy rule for the whole
  dashboard: the contents of their conversations, the text of their searches,
  their saved tools, their collections, or anything else they wrote for
  themselves. The counts are here because moderation and support need to know
  whether an account is active and whether it is generating complaints. The
  contents are not, because no administrative function needs to read somebody's
  private notes, and a dashboard that shows them because it could is how that
  becomes normal.

  Community posts are the exception, and only through the moderation surfaces,
  where the thing being read was published in public in the first place.
*/
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin("users.read");
  const { id } = await params;

  const detail = await getUserDetail(session.db, id);
  if (!detail) notFound();

  const { account, activity, moderation } = detail;
  const isSelf = account.id === session.userId;
  /* Mirrors admin_assert_outranks. Shown so a refused action is greyed out with
     a reason rather than failing after a round trip. The database refuses it
     either way. */
  const outranked = RANK[session.role as Role] > RANK[(account.role as Role) ?? "user"];

  const suspended = account.account_status === "suspended";

  return (
    <>
      <PageHeader
        title={account.username ?? account.full_name ?? "Account"}
        lead={account.email}
        action={
          <>
            {account.username ? (
              <Link
                href={`/u/${account.username}`}
                className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
              >
                Public profile
              </Link>
            ) : null}
            <Link
              href="/admin/users"
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            >
              All users
            </Link>
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Status value={account.account_status} />
        {account.role !== "user" ? <Status value={account.role} /> : null}
        <span className="rounded-full border border-border px-2 py-0.5 text-[12px] text-muted">
          {account.plan}
        </span>
        {account.email_confirmed_at ? null : <Status value="pending" />}
        {account.is_developer ? (
          <span className="rounded-full border border-border px-2 py-0.5 text-[12px] text-muted">
            Developer mode on
          </span>
        ) : null}
      </div>

      {suspended && account.status_reason ? (
        <div className="mt-4 rounded-xl border border-danger-surface bg-danger-surface px-4 py-3">
          <p className="text-[13px] font-medium text-danger-text">
            Suspended{" "}
            {account.suspended_until ? (
              <>
                until{" "}
                {new Date(account.suspended_until).toLocaleString("en-GB")}
              </>
            ) : (
              "indefinitely"
            )}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-danger-text/85">
            {account.status_reason}
          </p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Section title="Activity">
            <StatGrid>
              <Stat label="Posts" value={activity.posts ?? 0} />
              <Stat label="Comments" value={activity.comments ?? 0} />
              <Stat label="Likes given" value={activity.likes ?? 0} />
              <Stat label="Saves" value={activity.saves ?? 0} />
              <Stat label="Reposts" value={activity.reposts ?? 0} />
              <Stat label="Collections" value={activity.collections ?? 0} />
              <Stat label="Saved tools" value={activity.saved_tools ?? 0} />
              <Stat label="Tools submitted" value={activity.tools ?? 0} />
              <Stat label="Models submitted" value={activity.models ?? 0} />
              <Stat
                label="Conversations"
                value={activity.conversations ?? 0}
                hint="Count only. The contents are never shown here."
              />
              <Stat
                label="Searches"
                value={activity.searches ?? 0}
                hint="Count only. The queries are not attributed on this page."
              />
              <Stat label="Followers" value={account.follower_count ?? 0} />
            </StatGrid>
          </Section>

          {detail.ai ? (
            <Section
              title="AI usage"
              lead="Counted from ai_usage_records, priced at the rates configured in the gateway."
            >
              <StatGrid>
                <Stat label="Requests" value={detail.ai.requests} />
                <Stat
                  label="Total tokens"
                  value={detail.ai.total_tokens.toLocaleString("en-GB")}
                  hint={`${detail.ai.input_tokens.toLocaleString("en-GB")} in, ${detail.ai.output_tokens.toLocaleString("en-GB")} out`}
                />
                <Stat
                  label="Estimated cost"
                  value={`$${Number(detail.ai.cost_usd).toFixed(4)}`}
                  hint="At the configured provider prices"
                />
                <Stat
                  label="Not successful"
                  value={detail.ai.failed}
                  tone={detail.ai.failed > 0 ? "warn" : "neutral"}
                  hint="Errors, refusals and rate limits"
                />
              </StatGrid>

              {detail.ai.by_day.length > 0 ? (
                <div className="mt-3">
                  <TimeSeries
                    label="Requests per day"
                    unit="requests"
                    windowDays={30}
                    points={detail.ai.by_day.map((d) => ({ day: d.day, value: d.requests }))}
                  />
                </div>
              ) : null}

              {detail.ai.by_model.length > 0 ? (
                <div className="mt-3">
                  <RankedBars
                    valueLabel="requests"
                    rows={detail.ai.by_model.map((m) => ({
                      label: `${m.model} (${m.provider})`,
                      value: m.requests,
                      secondary: `${m.tokens.toLocaleString("en-GB")} tokens, $${Number(m.cost_usd).toFixed(4)}`,
                    }))}
                  />
                </div>
              ) : null}
            </Section>
          ) : null}

          <Section title="Moderation">
            <StatGrid>
              <Stat
                label="Reports received"
                value={moderation.reports_received ?? 0}
                tone={(moderation.reports_received ?? 0) > 0 ? "warn" : "neutral"}
              />
              <Stat label="Reports submitted" value={moderation.reports_submitted ?? 0} />
              <Stat
                label="Warnings"
                value={moderation.warnings ?? 0}
                tone={(moderation.warnings ?? 0) > 0 ? "warn" : "neutral"}
              />
              <Stat
                label="Suspensions"
                value={moderation.suspensions ?? 0}
                tone={(moderation.suspensions ?? 0) > 0 ? "danger" : "neutral"}
              />
              <Stat label="Hidden content" value={moderation.hidden_content ?? 0} />
            </StatGrid>

            <div className="mt-3">
              {detail.history === undefined ? (
                <Panel className="px-4 py-4 text-[13px] text-muted">
                  Your role can see the counts above but not the case history.
                </Panel>
              ) : detail.history.length === 0 ? (
                <EmptyState
                  title="No moderation history"
                  body="Nothing has ever been done to this account. Warnings, suspensions and content decisions appear here with the reason and who made them."
                />
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {detail.history.map((entry) => (
                    <li key={entry.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-[13px] font-medium">{labelFor(entry.action)}</span>
                        <span className="text-[12px] text-muted">on {entry.entity_type}</span>
                        <span className="ml-auto text-[12px] text-muted">
                          {entry.actor ? `by ${entry.actor}, ` : ""}
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
            </div>
          </Section>
        </div>

        <div className="min-w-0">
          <Section title="Account">
            <FieldList>
              <Field label="User id" mono>
                {account.id}
              </Field>
              <Field label="Username">{account.username ?? "Not set"}</Field>
              <Field label="Name">{account.full_name ?? "Not set"}</Field>
              <Field label="Email">{account.email}</Field>
              <Field label="Email confirmed">
                {account.email_confirmed_at ? (
                  <When iso={account.email_confirmed_at} time />
                ) : (
                  <span className="text-warn-text">Never confirmed</span>
                )}
              </Field>
              <Field label="Sign in methods">
                {account.providers.length > 0 ? account.providers.join(", ") : "Password only"}
              </Field>
              <Field label="Joined">
                <When iso={account.created_at} time />
              </Field>
              <Field label="Last sign in">
                {account.last_sign_in_at ? (
                  <When iso={account.last_sign_in_at} time />
                ) : (
                  "Never signed in"
                )}
              </Field>
              <Field label="Location">{account.location ?? "Not set"}</Field>
              <Field label="Website">
                {account.website_url ? (
                  <a
                    href={account.website_url}
                    rel="nofollow noopener noreferrer"
                    target="_blank"
                    className="hover:underline"
                  >
                    {account.website_url}
                  </a>
                ) : (
                  "Not set"
                )}
              </Field>
            </FieldList>
          </Section>

          {detail.developer ? (
            <Section title="Developer">
              <FieldList>
                <Field label="Handle">{detail.developer.handle}</Field>
                <Field label="Verified">
                  {detail.developer.verified ? (
                    <Status value="approved" />
                  ) : (
                    <span className="text-muted">Not verified</span>
                  )}
                </Field>
                <Field label="Terms accepted">
                  {detail.developer.accepted_terms_at ? (
                    <>
                      <When iso={detail.developer.accepted_terms_at} time />
                      <span className="ml-2 text-muted">
                        version {detail.developer.terms_version ?? "unknown"}
                      </span>
                    </>
                  ) : (
                    /* This is the authorization gate, not the profile flag. It
                       is worth saying plainly here because it is the single
                       thing that decides whether they can submit anything. */
                    <span className="text-warn-text">
                      Not accepted, so submission is refused
                    </span>
                  )}
                </Field>
                <Field label="Company">{detail.developer.company ?? "Not set"}</Field>
              </FieldList>
              <div className="mt-3">
                <Link
                  href={`/admin/developers/${account.id}`}
                  className="text-[13px] text-muted hover:text-foreground hover:underline"
                >
                  Developer detail
                </Link>
              </div>
            </Section>
          ) : null}

          {session.can("users.moderate") ? (
            <Section title="Account actions">
              {isSelf ? (
                <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
                  This is your own account. Nobody can suspend, warn or re-role themselves,
                  in the interface or in the database.
                </Panel>
              ) : !outranked ? (
                <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
                  This account holds the same or higher privileges than yours, so you cannot
                  act on it. Two administrators cannot suspend each other.
                </Panel>
              ) : (
                <div className="flex flex-col gap-3">
                  {suspended ? (
                    <ActionForm
                      action={setUserStatus}
                      fields={{ userId: account.id, status: "active" }}
                      label="Lift the suspension"
                      tone="primary"
                      confirm={{
                        title: "Restore this account?",
                        body: "They will be able to sign in and post again immediately.",
                        confirmLabel: "Restore account",
                      }}
                    />
                  ) : (
                    <ActionForm
                      action={setUserStatus}
                      fields={{ userId: account.id, status: "suspended" }}
                      label="Suspend"
                      tone="danger"
                      requireReason
                      confirm={{
                        title: "Suspend this account?",
                        body: "They keep their content and lose the ability to post. The reason is recorded against the account and in the audit log.",
                        confirmLabel: "Suspend account",
                      }}
                    />
                  )}

                  <ActionForm
                    action={warnUser}
                    fields={{ userId: account.id }}
                    label="Record a warning"
                    requireReason
                    confirm={{
                      title: "Record a warning?",
                      body: "This adds to their moderation history. It does not notify them: there is no notification system yet.",
                      confirmLabel: "Record warning",
                    }}
                  />

                  <ActionForm
                    action={setUserStatus}
                    fields={{ userId: account.id, status: "disabled" }}
                    label="Disable the account"
                    tone="danger"
                    requireReason
                    confirm={{
                      title: "Disable this account?",
                      body: "Heavier than a suspension and meant to be permanent. Nothing is deleted, so it can still be reversed.",
                      confirmLabel: "Disable account",
                    }}
                  />
                </div>
              )}
            </Section>
          ) : null}

          {session.can("users.plan") ? (
            <Section title="Plan">
              <ActionSelectForm
                action={setUserPlan}
                fields={{ userId: account.id }}
                name="plan"
                legend="Change the plan"
                hint="Changes entitlements immediately. There is no billing integration yet, so this does not charge or refund anybody."
                current={account.plan}
                submitLabel="Change plan"
                options={[
                  { value: "free", label: "Free" },
                  { value: "pro", label: "Pro" },
                  { value: "premium", label: "Premium" },
                ]}
              />
            </Section>
          ) : null}

          {session.can("users.role") ? (
            <Section title="Role">
              <ActionSelectForm
                action={setUserRole}
                fields={{ userId: account.id }}
                name="role"
                legend="Change the role"
                hint="This is the only control that hands out administrative power. Super admin only, never on your own account, and never leaving the platform without one."
                current={account.role}
                submitLabel="Change role"
                tone="danger"
                disabled={isSelf}
                disabledReason={isSelf ? "You cannot change your own role." : undefined}
                options={ALL_ROLES.map((r) => ({
                  value: r,
                  label: ROLE_LABEL[r],
                  description: ROLE_DESCRIPTION[r],
                }))}
              />
            </Section>
          ) : null}

          {!session.can("users.moderate") && !session.can("users.plan") && !session.can("users.role") ? (
            <Section title="Actions">
              <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
                Your role can read this account and change nothing about it.
              </Panel>
            </Section>
          ) : null}
        </div>
      </div>
    </>
  );
}
