import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { getAiAnalytics, getOverview, listAudit } from "@/lib/admin/queries";
import { ShareBar } from "@/components/ui/charts";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  Section,
  Stat,
  StatGrid,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
  Usd,
  When,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/*
  Plans and billing.

  THERE IS NO BILLING. No payment provider is connected, no subscription table
  exists, and profiles.plan is a column an administrator sets. So there is no
  revenue, no cancellation, no payment failure and no subscription status to
  report, and this page says that in one sentence rather than showing six tiles
  of zeros that look like a business having a bad month.

  What it CAN honestly report, and does: how many accounts are on each plan, the
  full history of who changed whose plan and why, and the AI cost each plan is
  currently generating, which is the one real money number the platform has.

  The audit trail requirement in the brief is satisfied by the plan change
  history below. Nothing on this page can move money, because there is no money
  to move; changing a plan is an entitlement change and it is recorded.
*/
export default async function AdminBillingPage() {
  const session = await requireAdmin("billing.read");

  const [overview, ai, audit] = await Promise.all([
    getOverview(session.db),
    session.can("ai.read") ? getAiAnalytics(session.db, 30) : null,
    session.can("audit.read")
      ? listAudit(session.db, { action: "user.plan_changed", perPage: 25 })
      : null,
  ]);

  if (!overview) {
    return (
      <>
        <PageHeader title="Plans and billing" />
        <div className="mt-6">
          <ErrorState what="plan data" />
        </div>
      </>
    );
  }

  const users = overview.users ?? {};
  const free = users.free ?? 0;
  const pro = users.pro ?? 0;
  const premium = users.premium ?? 0;
  const paying = pro + premium;

  return (
    <>
      <PageHeader
        title="Plans and billing"
        lead="Who is on which plan, what each plan costs to serve, and every plan change ever made."
      />

      <div className="mt-5">
        <Panel className="px-4 py-4">
          <p className="text-[13px] font-medium">No payment provider is connected.</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            There is no subscription table, no invoice, no card on file and no revenue. A plan is
            a column on the account that an administrator sets, and Pro and Premium accounts are
            entitlements granted rather than subscriptions bought. Revenue, cancellations, renewal
            dates and payment failures are therefore absent from this page rather than shown as
            zero: a zero would imply the meter is running and reading nothing.
          </p>
        </Panel>
      </div>

      <Section title="Accounts by plan">
        <StatGrid>
          <Stat label="Free" value={free} />
          <Stat label="Pro" value={pro} />
          <Stat label="Premium" value={premium} />
          <Stat
            label="On a paid plan"
            value={paying}
            hint={
              users.total
                ? `${((paying / users.total) * 100).toFixed(1)}% of ${users.total.toLocaleString("en-GB")} accounts`
                : undefined
            }
          />
        </StatGrid>

        <div className="mt-3">
          <ShareBar
            parts={[
              { label: "Free", value: free },
              { label: "Pro", value: pro },
              { label: "Premium", value: premium },
            ]}
          />
        </div>
      </Section>

      {ai ? (
        <Section
          title="Cost to serve, last 30 days"
          lead="Estimated AI spend attributed to each plan. This is the only real money figure the platform currently has, and it is an outgoing one."
        >
          <TableWrap>
            <Table className="min-w-[560px]">
              <thead>
                <tr>
                  <Th>Plan</Th>
                  <Th numeric>Requests</Th>
                  <Th numeric>Tokens</Th>
                  <Th numeric>Estimated cost</Th>
                  <Th numeric>Per request</Th>
                </tr>
              </thead>
              <tbody>
                {ai.by_plan.map((p) => (
                  <Tr key={p.plan}>
                    <Td className="font-medium">{p.plan}</Td>
                    <Td numeric>{p.requests.toLocaleString("en-GB")}</Td>
                    <Td numeric>{p.total_tokens.toLocaleString("en-GB")}</Td>
                    <Td numeric>
                      <Usd value={p.cost_usd} />
                    </Td>
                    <Td numeric>
                      <Usd value={Number(p.cost_usd) / Math.max(p.requests, 1)} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>

          {ai.by_plan.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No AI usage in the last 30 days"
                body="Cost to serve is counted from ai_usage_records, one row per request."
              />
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section
        title="Plan change history"
        lead="Every change, who made it, what it was before, and the reason they gave. A plan cannot be changed without one."
      >
        {!audit ? (
          <Panel className="px-4 py-4 text-[13px] text-muted">
            Your role can read plan counts but not the audit log.
          </Panel>
        ) : audit.rows.length === 0 ? (
          <EmptyState
            title="No plan has ever been changed"
            body="Plan changes are made from a person's account page and are recorded here permanently. The audit log cannot be edited or deleted: a trigger refuses both."
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[720px]">
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Account</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Changed by</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {audit.rows.map((row) => (
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
                        <span className="text-muted">Unknown</span>
                      )}
                    </Td>
                    <Td className="text-[13px] text-muted">
                      {String(row.before_state?.plan ?? "−")}
                    </Td>
                    <Td className="text-[13px] font-medium">
                      {String(row.after_state?.plan ?? "−")}
                    </Td>
                    <Td className="text-[13px]">
                      {row.actor_username ?? "System"}
                      {row.actor_role ? (
                        <span className="ml-1.5 text-muted">({row.actor_role})</span>
                      ) : null}
                    </Td>
                    <Td>
                      <span className="block max-w-[280px] text-[13px] text-muted">
                        {row.reason ?? "−"}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Section>

      <Section title="What connecting billing would need">
        <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
          A subscriptions table keyed to the provider&rsquo;s customer and subscription ids, a
          webhook endpoint that is the only thing allowed to write it, and profiles.plan becoming
          derived from that table rather than set by hand. The admin plan control would then stay
          for support overrides and would have to say so on the account, so that a manually granted
          Premium is never mistaken for a paid one. None of that is built, and none of it is
          implied anywhere on this page.
        </Panel>
      </Section>
    </>
  );
}
