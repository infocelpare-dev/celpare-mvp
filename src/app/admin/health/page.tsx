import { requireAdmin } from "@/lib/admin/guard";
import { getHealth } from "@/lib/admin/health";
import { getStorageUsage } from "@/lib/admin/queries";
import { formatBytes, formatCount } from "@/lib/format";
import {
  PageHeader,
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
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/*
  System health.

  Every check here either measures something or says it does not know. There is
  no row that reports healthy because nothing has told it otherwise, which is
  the failure mode of most status pages: a green board that goes green again
  five minutes after an outage because the check was never wired to anything.

  The database check runs a real query through PostgREST, the pooler and RLS,
  and times it. The AI provider is judged from the last 24 hours of real
  requests rather than by sending a synthetic one, because a health check that
  costs tokens on every page load is a health check that gets turned off.

  Where a check can only report configuration, it says configured rather than
  healthy, and the detail line explains what is lost without it.
*/

const ORDER: Record<string, number> = { down: 0, degraded: 1, unknown: 2, healthy: 3 };

export default async function AdminHealthPage() {
  const session = await requireAdmin();
  const [checks, storage] = await Promise.all([
    getHealth(session.db),
    getStorageUsage(session.db),
  ]);

  const sorted = [...checks].sort(
    (a, b) => (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9),
  );

  const count = (state: string) => checks.filter((c) => c.state === state).length;
  const overall =
    count("down") > 0 ? "down" : count("degraded") > 0 ? "degraded" : "healthy";

  return (
    <>
      <PageHeader
        title="System health"
        lead="Checked at the moment this page rendered. Nothing here is cached or polled in the background."
      />

      <div className="mt-5">
        <Panel
          className={
            overall === "down"
              ? "border-danger-surface bg-danger-surface px-4 py-4"
              : overall === "degraded"
                ? "border-warn-surface bg-warn-surface px-4 py-4"
                : "px-4 py-4"
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Status value={overall} />
            <span className="text-[14px] font-medium">
              {overall === "down"
                ? "Something is down"
                : overall === "degraded"
                  ? "Running with something degraded"
                  : "Everything checked is responding"}
            </span>
            <span className="ml-auto text-[12px] text-muted">
              {checks.length} checks, {new Date().toLocaleTimeString("en-GB")}
            </span>
          </div>
        </Panel>
      </div>

      <Section title="Summary">
        <StatGrid>
          <Stat label="Healthy" value={count("healthy")} tone="ok" />
          <Stat
            label="Degraded"
            value={count("degraded")}
            tone={count("degraded") > 0 ? "warn" : "neutral"}
          />
          <Stat
            label="Down"
            value={count("down")}
            tone={count("down") > 0 ? "danger" : "neutral"}
          />
          <Stat
            label="Unknown"
            value={count("unknown")}
            hint="Nothing recent enough to judge from"
          />
        </StatGrid>
      </Section>

      <Section title="Checks" lead="Worst first, so the thing that needs attention is at the top.">
        <TableWrap>
          <Table className="min-w-[620px]">
            <thead>
              <tr>
                <Th>Component</Th>
                <Th>State</Th>
                <Th>Detail</Th>
                <Th numeric>Measured</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((check) => (
                <Tr key={check.key}>
                  <Td className="font-medium">{check.label}</Td>
                  <Td>
                    <Status value={check.state} />
                  </Td>
                  <Td>
                    <span className="block max-w-[420px] text-[13px] leading-relaxed text-muted">
                      {check.detail}
                    </span>
                  </Td>
                  <Td numeric>
                    {check.latencyMs != null ? (
                      <span className="tnum">{check.latencyMs} ms</span>
                    ) : (
                      /* Absent rather than zero, so nothing reads as instant
                         that was never actually timed. */
                      <span className="text-muted">Not timed</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Section>

      <Section
        title="Storage"
        lead="Bucket sizes only. Object paths and owners are not read here, because reporting how much space avatars take does not require enumerating them."
      >
        {storage && storage.buckets.length > 0 ? (
          <StatGrid>
            <Stat label="Objects" value={formatCount(storage.total_objects)} />
            <Stat label="Total size" value={formatBytes(storage.total_bytes)} />
            {storage.buckets.map((bucket) => (
              <Stat
                key={bucket.name}
                label={bucket.name}
                value={formatBytes(bucket.bytes)}
                hint={`${formatCount(bucket.objects)} object${bucket.objects === 1 ? "" : "s"}, ${bucket.public ? "public" : "private"}`}
              />
            ))}
          </StatGrid>
        ) : (
          <Panel className="px-4 py-4 text-[13px] text-muted">
            No buckets, or storage could not be read.
          </Panel>
        )}
      </Section>

      <Section title="Deployment">
        <StatGrid>
          <Stat label="Environment" value={process.env.NODE_ENV ?? "unknown"} />
          <Stat label="Node" value={process.version} />
          <Stat
            label="Region"
            value={process.env.VERCEL_REGION ?? "local"}
            hint="Where this render ran"
          />
          <Stat
            label="Build"
            value={(process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7)}
            hint="Commit this deployment was built from"
          />
        </StatGrid>
      </Section>

      <Section title="What these checks can and cannot tell you">
        <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
          <p>
            The database row is a real query: a count through PostgREST, the connection pooler and
            an RLS policy, timed end to end. Over 1.5 seconds it reports degraded rather than
            healthy, because a database that answers slowly is not fine and pretending otherwise is
            how a slow query becomes a mystery outage.
          </p>
          <p className="mt-2">
            The AI provider row is inferred from the last 24 hours of real requests rather than
            measured by calling it. A synthetic health request would cost tokens on every page
            load, would be indistinguishable from a real one in the billing record, and would tell
            you less than production traffic already does. With no requests in 24 hours it reports
            unknown, which is the honest answer.
          </p>
          <p className="mt-2">
            The remaining rows report whether something is configured. Rate limiting without
            Upstash still limits, in a per process counter that does not survive a restart and is
            not shared between instances, so it is degraded rather than down. Usage recording
            without a service role key means limits still apply and the billing and security trail
            is not written.
          </p>
        </Panel>
      </Section>
    </>
  );
}
