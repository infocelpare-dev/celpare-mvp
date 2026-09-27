import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { EmptyState, ErrorState, PageHeader, Section, Stat, StatGrid, Table, TableWrap, Td, Th, Tr, When } from "@/components/admin/ui";
import { STAGES, configDrift } from "@/lib/community/intelligence/lifecycle";

export const dynamic = "force-dynamic";

/*
  Post Intelligence, for admins (4BG). Every post's stored lifecycle stage,
  audience wave and relative performance, the last time the tick ran, the
  scheduled jobs, and whether the database's copy of the thresholds matches
  lifecycle.ts. Read through admin_post_intelligence(), which checks the
  analytics.read capability itself; this page's guard is the second layer.
*/

type Row = {
  post_id: string;
  author_username: string | null;
  body: string | null;
  created_at: string;
  stage: string;
  wave: number;
  perf_score: number | null;
  velocity: number | null;
  reference_hourly: number | null;
  viewers: number;
  stage_since: string;
  computed_at: string;
};

type Status = {
  config: Record<string, unknown> | null;
  last_tick: string | null;
  /* Measured by the database, so the page renders nothing time dependent. */
  minutes_since_tick: number | null;
  stages: Record<string, number> | null;
  jobs: { name: string; schedule: string; active: boolean }[] | null;
};

export default async function AdminPostIntelligencePage() {
  const session = await requireAdmin("analytics.read");

  const [rowsRes, statusRes] = await Promise.all([
    session.db.rpc("admin_post_intelligence", { p_limit: 200 }),
    session.db.rpc("admin_post_intelligence_status"),
  ]);

  if (rowsRes.error || statusRes.error) {
    console.error("[admin] post intelligence failed", rowsRes.error?.message, statusRes.error?.message);
    return (
      <>
        <PageHeader title="Post Intelligence" />
        <div className="mt-6">
          <ErrorState what="post intelligence" />
        </div>
      </>
    );
  }

  const rows = (rowsRes.data as Row[]) ?? [];
  const status = statusRes.data as Status;
  const drift = configDrift(status.config ?? null);
  const minutesSinceTick = status.minutes_since_tick;

  return (
    <>
      <PageHeader
        title="Post Intelligence"
        lead="Where every post is in its lifecycle, as the five minute tick last left it. docs/context/13-post-intelligence.md"
      />

      <Section title="Health">
        <StatGrid>
          <Stat
            label="Last tick"
            value={minutesSinceTick === null ? "never" : `${minutesSinceTick} min ago`}
            tone={minutesSinceTick === null || minutesSinceTick > 20 ? "danger" : "neutral"}
            hint={minutesSinceTick !== null && minutesSinceTick > 20 ? "Stale: readers are using the per request fallback" : undefined}
          />
          <Stat
            label="Config"
            value={drift.length === 0 ? "in sync" : `${drift.length} differ`}
            tone={drift.length === 0 ? "neutral" : "danger"}
            hint={drift.length ? drift.slice(0, 4).join(", ") : undefined}
          />
          {(status.jobs ?? []).map((j) => (
            <Stat key={j.name} label={j.name} value={j.active ? j.schedule : "paused"} tone={j.active ? "neutral" : "danger"} />
          ))}
        </StatGrid>
      </Section>

      <Section title="Stages">
        <StatGrid>
          {STAGES.map((s) => (
            <Stat key={s} label={s.replace("_", " ")} value={status.stages?.[s] ?? 0} />
          ))}
        </StatGrid>
      </Section>

      <Section title="Posts" lead="Most recently computed first. perf 1.0 is the creator's usual in this topic.">
        {rows.length === 0 ? (
          <EmptyState title="No posts yet" body="Posts appear here the moment they are published." />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Post</Th>
                  <Th>Stage</Th>
                  <Th numeric>Wave</Th>
                  <Th numeric>Perf</Th>
                  <Th numeric>Viewers</Th>
                  <Th numeric>Units per hour</Th>
                  <Th>In stage since</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Tr key={r.post_id}>
                    <Td className="max-w-[320px]">
                      <Link href={`/community/${r.post_id}`} className="line-clamp-2 hover:underline">
                        {r.body || "(no text)"}
                      </Link>
                      <span className="text-[12px] text-muted">@{r.author_username ?? "unknown"}</span>
                    </Td>
                    <Td>{r.stage.replace("_", " ")}</Td>
                    <Td numeric>{r.wave}</Td>
                    <Td numeric>{r.perf_score === null ? "?" : r.perf_score.toFixed(2)}</Td>
                    <Td numeric>{r.viewers}</Td>
                    <Td numeric>
                      {(r.velocity ?? 0).toFixed(1)}
                      {r.reference_hourly ? ` / ${r.reference_hourly.toFixed(2)}` : ""}
                    </Td>
                    <Td>
                      <When iso={r.stage_since} time />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </Section>
    </>
  );
}
