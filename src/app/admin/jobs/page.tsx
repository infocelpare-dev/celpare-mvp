import { requireAdmin } from "@/lib/admin/guard";
import { listJobRuns } from "@/lib/admin/queries";
import {
  EmptyState,
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
  When,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/*
  Background jobs.

  THERE IS NO SCHEDULER. Nothing runs on a timer anywhere in this project, and
  this page does not pretend otherwise. What it does is record executions of the
  one maintenance routine that exists, so that when a scheduler is added it has
  somewhere to write and the history is already there to read.

  Listing the work that IS being done somewhere other than a job is the useful
  half of this page today. Counter maintenance, auto hide and search indexing
  all happen, and they happen in triggers and generated columns inside the
  transaction that caused them. That is a real architectural choice rather than
  a gap: a counter maintained by a trigger cannot drift from its rows, and one
  maintained by a nightly job can.
*/

/* What runs, and where. Written out rather than inferred, because "there is no
   job for this" and "this is not happening" are different statements and the
   difference is the whole point of the page. */
const WORK = [
  {
    name: "Post and comment counters",
    where: "Database trigger",
    detail:
      "like_count, comment_count, save_count and repost_count are maintained by AFTER triggers inside the same transaction as the row that changed them, so they cannot drift.",
  },
  {
    name: "Auto hide at the report threshold",
    where: "Database trigger",
    detail:
      "tg_reports_count counts qualified reports as they arrive and flips status to hidden on the third. Immediate rather than batched, because a delay here is a delay in hiding abuse.",
  },
  {
    name: "Tool search index",
    where: "Generated column",
    detail:
      "tools.search_vector is a stored generated tsvector, recomputed by Postgres whenever the row changes. There is nothing to schedule.",
  },
  {
    name: "Search term frequencies",
    where: "Manual, refresh_tool_terms()",
    detail:
      "The only routine here that genuinely wants a schedule. Today it is run by hand after a catalogue import.",
  },
  {
    name: "AI usage aggregation",
    where: "Query time",
    detail:
      "The AI pages aggregate ai_usage_records on read rather than into a rollup table. At this volume that is faster than maintaining a rollup and cannot go stale.",
  },
  {
    name: "Rate limit windows",
    where: "Redis TTL",
    detail:
      "Counters are keyed by date with a TTL to UTC midnight, so they expire themselves. A reset job would be a second thing to go wrong.",
  },
  {
    name: "Notifications",
    where: "Not built",
    detail:
      "There is no notification system, so nothing queues, sends or retries. A warning recorded against an account is not delivered to them.",
  },
];

export default async function AdminJobsPage() {
  const session = await requireAdmin("jobs.read");
  const runs = await listJobRuns(session.db);

  const count = (status: string) => runs.filter((r) => r.status === status).length;

  return (
    <>
      <PageHeader
        title="Background jobs"
        lead="What ran, and where the platform's recurring work actually happens."
      />

      <div className="mt-5">
        <Panel className="px-4 py-4">
          <p className="text-[13px] font-medium">There is no scheduler.</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            No cron, no queue, no worker. Almost everything that would normally be a background job
            here is done inside the transaction that caused it, by a trigger or a generated column,
            which is why the counters and the search index cannot drift. The table below records
            executions so that a scheduler added later writes somewhere that already exists, and so
            that the one routine still run by hand leaves a trace.
          </p>
        </Panel>
      </div>

      <Section title="Runs recorded">
        <StatGrid>
          <Stat label="Total" value={runs.length} />
          <Stat label="Succeeded" value={count("succeeded")} tone="ok" />
          <Stat
            label="Failed"
            value={count("failed")}
            tone={count("failed") > 0 ? "danger" : "neutral"}
          />
          <Stat
            label="Running"
            value={count("running")}
            tone={count("running") > 0 ? "warn" : "neutral"}
          />
          <Stat label="Queued" value={count("queued")} hint="Nothing enqueues yet" />
        </StatGrid>

        <div className="mt-3">
          {runs.length === 0 ? (
            <EmptyState
              title="No runs recorded"
              body="Nothing has been run through the job recorder yet. An entry appears here the moment something is."
            />
          ) : (
            <TableWrap>
              <Table className="min-w-[720px]">
                <thead>
                  <tr>
                    <Th>Job</Th>
                    <Th>Status</Th>
                    <Th numeric>Attempt</Th>
                    <Th>Started</Th>
                    <Th>Finished</Th>
                    <Th numeric>Duration</Th>
                    <Th>Error</Th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <Tr key={run.id}>
                      <Td className="font-mono text-[13px]">{run.job}</Td>
                      <Td>
                        <Status value={run.status} />
                      </Td>
                      <Td numeric>{run.attempt}</Td>
                      <Td>
                        <When iso={run.started_at} time />
                      </Td>
                      <Td>
                        <When iso={run.finished_at} time />
                      </Td>
                      <Td numeric>
                        {run.duration_ms != null ? (
                          <span className="tnum">{run.duration_ms} ms</span>
                        ) : (
                          <span className="text-muted">&#8722;</span>
                        )}
                      </Td>
                      <Td>
                        <span className="block max-w-[260px] truncate text-[13px] text-danger-text">
                          {run.error ?? ""}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </div>
      </Section>

      <Section
        title="Where the recurring work happens"
        lead="An empty job table does not mean nothing is running. Most of this is deliberately not a job."
      >
        <ul className="divide-y divide-border rounded-xl border border-border">
          {WORK.map((item) => (
            <li key={item.name} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[14px] font-medium">{item.name}</span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                  {item.where}
                </span>
              </div>
              <p className="mt-1.5 max-w-[80ch] text-[13px] leading-relaxed text-muted">
                {item.detail}
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
