import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { getAiAnalytics } from "@/lib/admin/queries";
import { RankedBars, ShareBar, TimeSeries } from "@/components/ui/charts";
import { FilterTabs } from "@/components/admin/filters";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Section,
  Stat,
  StatGrid,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
  Usd,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 30, 90];

/*
  AI operations: requests, tokens, cost and latency.

  Everything here comes from ai_usage_records, which the gateway writes one row
  to per request. That table is the billing and audit trail by design: Redis
  holds the live counters and enforces the limits, and this is the durable copy
  that survives a cache flush.

  Cost is labelled estimated everywhere it appears, and it is. It is tokens
  multiplied by the price table in src/lib/ai/config.ts, which is configuration
  rather than an invoice. When the provider bills differently, the provider is
  right. Saying "estimated" rather than "cost" is the difference between a
  number somebody can plan with and one they will be surprised by.

  No API key, base URL secret or provider credential appears on this page or in
  any query behind it.
*/
export default async function AdminAiPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await requireAdmin("ai.read");
  const sp = await searchParams;
  const days = WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 30;

  const ai = await getAiAnalytics(session.db, days);
  if (!ai) {
    return (
      <>
        <PageHeader title="AI operations" />
        <div className="mt-6">
          <ErrorState what="AI usage" />
        </div>
      </>
    );
  }

  const t = ai.totals;
  const requests = t.requests ?? 0;
  const errorRate = requests === 0 ? 0 : ((t.failed ?? 0) / requests) * 100;

  return (
    <>
      <PageHeader
        title="AI operations"
        lead="Every request through the gateway, priced at the configured provider rates."
        action={
          <Link
            href="/admin/gateway"
            className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            Gateway configuration
          </Link>
        }
      />

      <div className="mt-5">
        <FilterTabs
          label="Time window"
          active={`/admin/ai?days=${days}`}
          items={WINDOWS.map((d) => ({ href: `/admin/ai?days=${d}`, label: `${d} days` }))}
        />
      </div>

      {requests === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No AI requests in this window"
            body="Every answer Ask Celpare gives writes one row here. If this is empty and the assistant is being used, check that SUPABASE_SERVICE_ROLE_KEY is set: without it the limits still apply but the billing trail is not written."
          />
        </div>
      ) : (
        <>
          <Section title="Requests">
            <StatGrid>
              <Stat label="Total" value={requests} hint={`Over ${days} days`} />
              <Stat label="Successful" value={t.ok ?? 0} tone="ok" />
              <Stat
                label="Failed"
                value={t.failed ?? 0}
                tone={(t.failed ?? 0) > 0 ? "danger" : "neutral"}
                hint={`${errorRate.toFixed(1)}% error rate`}
              />
              <Stat
                label="Rate limited"
                value={t.rate_limited ?? 0}
                tone={(t.rate_limited ?? 0) > 0 ? "warn" : "neutral"}
                hint="People who hit their plan ceiling"
              />
              <Stat
                label="Out of scope"
                value={t.refused ?? 0}
                hint="Refused by the classifier before any spend"
              />
              <Stat
                label="Filtered"
                value={t.filtered ?? 0}
                hint="Stopped by the input or output filter"
              />
            </StatGrid>

            <div className="mt-3">
              <TimeSeries
                label="Requests per day"
                failedLabel="Not successful"
                unit="requests"
                windowDays={days}
                points={ai.by_day.map((d) => ({
                  day: d.day,
                  value: d.requests,
                  failed: d.failed,
                }))}
              />
            </div>
          </Section>

          <Section title="Tokens">
            <StatGrid>
              <Stat label="Input" value={(t.input_tokens ?? 0).toLocaleString("en-GB")} />
              <Stat label="Output" value={(t.output_tokens ?? 0).toLocaleString("en-GB")} />
              <Stat label="Total" value={(t.total_tokens ?? 0).toLocaleString("en-GB")} />
              <Stat
                label="Search calls"
                value={t.search_calls ?? 0}
                hint="External search API calls, which cost money besides tokens"
              />
              <Stat
                label="Deep research"
                value={t.deep_research ?? 0}
                hint="Premium only. Several searches and a much larger prompt each."
              />
            </StatGrid>

            <div className="mt-3">
              <TimeSeries
                label="Tokens per day"
                unit="tokens"
                windowDays={days}
                points={ai.by_day.map((d) => ({
                  day: d.day,
                  value: d.input_tokens + d.output_tokens,
                }))}
              />
            </div>
          </Section>

          <Section
            title="Estimated cost"
            lead="Tokens at the price table in the gateway configuration. Not an invoice: when the provider bills differently, the provider is right."
          >
            <StatGrid>
              <Stat label="Total" value={`$${Number(t.cost_usd ?? 0).toFixed(4)}`} />
              <Stat
                label="Per request"
                value={`$${(Number(t.cost_usd ?? 0) / Math.max(requests, 1)).toFixed(6)}`}
                hint="Average across every request in the window"
              />
              <Stat
                label="Per 1M tokens"
                value={
                  (t.total_tokens ?? 0) === 0
                    ? "$0"
                    : `$${((Number(t.cost_usd ?? 0) / (t.total_tokens ?? 1)) * 1_000_000).toFixed(2)}`
                }
                hint="Blended across every model used"
              />
            </StatGrid>

            {ai.by_plan.length > 0 ? (
              <div className="mt-3">
                <ShareBar
                  parts={ai.by_plan.map((p) => ({ label: p.plan, value: p.requests }))}
                />
              </div>
            ) : null}
          </Section>

          <Section
            title="Latency"
            lead="Successful requests only. A failed request that timed out would drag the average toward a number nothing actually experienced."
          >
            <StatGrid>
              <Stat label="Average" value={`${ai.latency.avg ?? 0} ms`} />
              <Stat label="P50" value={`${ai.latency.p50 ?? 0} ms`} hint="Half are faster" />
              <Stat
                label="P95"
                value={`${ai.latency.p95 ?? 0} ms`}
                hint="One in twenty is slower than this"
              />
              <Stat label="P99" value={`${ai.latency.p99 ?? 0} ms`} />
              <Stat label="Slowest" value={`${ai.latency.max ?? 0} ms`} />
            </StatGrid>
          </Section>

          <Section title="By model and provider">
            <TableWrap>
              <Table className="min-w-[820px]">
                <thead>
                  <tr>
                    <Th>Model</Th>
                    <Th>Provider</Th>
                    <Th numeric>Requests</Th>
                    <Th numeric>Input</Th>
                    <Th numeric>Output</Th>
                    <Th numeric>Est. cost</Th>
                    <Th numeric>Failed</Th>
                    <Th numeric>Avg latency</Th>
                  </tr>
                </thead>
                <tbody>
                  {ai.by_model.map((m) => (
                    <Tr key={`${m.provider}-${m.model}`}>
                      <Td className="font-mono text-[13px]">{m.model}</Td>
                      <Td className="text-[13px]">{m.provider}</Td>
                      <Td numeric>{m.requests.toLocaleString("en-GB")}</Td>
                      <Td numeric>{m.input_tokens.toLocaleString("en-GB")}</Td>
                      <Td numeric>{m.output_tokens.toLocaleString("en-GB")}</Td>
                      <Td numeric>
                        <Usd value={m.cost_usd} />
                      </Td>
                      <Td numeric>
                        {m.failed > 0 ? (
                          <span className="tnum text-danger-text">{m.failed}</span>
                        ) : (
                          <span className="text-muted">&#8722;</span>
                        )}
                      </Td>
                      <Td numeric>{m.avg_latency} ms</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Section>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Section title="By feature" className="mt-0">
              <RankedBars
                valueLabel="requests"
                rows={ai.by_feature.map((f) => ({
                  label: f.feature,
                  value: f.requests,
                  secondary: `${f.total_tokens.toLocaleString("en-GB")} tokens`,
                }))}
                emptyMessage="Only Ask Celpare is shipped, so every request carries that feature."
              />
            </Section>

            <Section title="By plan" className="mt-0">
              <RankedBars
                valueLabel="requests"
                rows={ai.by_plan.map((p) => ({
                  label: p.plan,
                  value: p.requests,
                  secondary: `$${Number(p.cost_usd).toFixed(4)}`,
                }))}
              />
            </Section>
          </div>

          <Section
            title="Heaviest accounts"
            lead={
              session.can("users.read")
                ? "By total tokens. Counts and cost only: nothing anybody asked the assistant appears here."
                : "By total tokens. Your role can see the totals but not who they belong to."
            }
          >
            {ai.top_users.length === 0 ? (
              <EmptyState
                title="No signed in usage yet"
                body={`${ai.anonymous_requests.toLocaleString("en-GB")} requests in this window came from signed out visitors, which are counted against a signed anonymous cookie and never attributed to a person.`}
              />
            ) : (
              <RankedBars
                valueLabel="tokens"
                rows={ai.top_users.map((u) => ({
                  label: u.username ?? "Unnamed account",
                  value: u.total_tokens,
                  secondary: `${u.requests} requests, $${Number(u.cost_usd).toFixed(4)}, ${u.plan}`,
                  href: session.can("users.read") ? `/admin/users/${u.user_id}` : undefined,
                }))}
              />
            )}

            <p className="mt-3 text-[12px] text-muted">
              {ai.anonymous_requests.toLocaleString("en-GB")} requests in this window were from
              signed out visitors. Those are limited against a signed anonymous cookie and are
              never joined to an account, so they cannot appear in this table.
            </p>
          </Section>
        </>
      )}
    </>
  );
}
