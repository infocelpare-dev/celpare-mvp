import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { getRecommendationAnalytics } from "@/lib/admin/queries";
import { RankedBars } from "@/components/ui/charts";
import { FilterTabs } from "@/components/admin/filters";
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
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 30, 90];

/*
  Recommendation analytics.

  Explore Intelligence (explore_v1, 4BI, D151) is the engine that writes here:
  every impression, click and dismiss of a tool, model, person, topic or
  category on Explore, with its section and candidate source. Posts and videos
  shown on Explore are recorded with the feed's events (surface explore), so a
  view means one thing everywhere. Ask Celpare is still retrieval, not
  recommendation, and writes nothing here.

  recommendation_events is that table. Its shape is the
  decision worth making now, and the important column is candidate_source: which
  generator put a row in front of somebody. It is the cheapest diagnostic a
  recommender can record and the one that is painful to add later, because
  without it a bad recommendation cannot be traced to what produced it.
*/
export default async function AdminRecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await requireAdmin("analytics.read");
  const sp = await searchParams;
  const days = WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 30;

  const data = await getRecommendationAnalytics(session.db, days);
  if (!data) {
    return (
      <>
        <PageHeader title="Recommendations" />
        <div className="mt-6">
          <ErrorState what="recommendation analytics" />
        </div>
      </>
    );
  }

  const impressions = data.totals.impressions ?? 0;
  const clicks = data.totals.clicks ?? 0;
  const saves = data.totals.saves ?? 0;
  const dismissals = data.totals.dismissals ?? 0;

  const ctr = impressions === 0 ? 0 : (clicks / impressions) * 100;
  const saveRate = clicks === 0 ? 0 : (saves / clicks) * 100;

  const running = impressions > 0 || clicks > 0;

  return (
    <>
      <PageHeader
        title="Recommendations"
        lead="What Explore recommended, and what people did with it. Nothing here is estimated or projected."
        action={
          <Link
            href="/admin/search"
            className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            Search analytics
          </Link>
        }
      />

      <div className="mt-5">
        <Panel className="px-4 py-4">
          <p className="text-[13px] font-medium">Explore Intelligence, explore_v1.</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Explore ranks tools, models, people, topics and categories with hand set weights, not a
            trained model, and records here every time one is shown, opened or dismissed. Posts and
            videos shown on Explore are counted with the feed&apos;s events instead, so a view means
            one thing everywhere. Ask Celpare is retrieval and does not write here. Append ?debug=1
            to /explore to see why any item ranked where it did.
          </p>
        </Panel>
      </div>

      <div className="mt-5">
        <FilterTabs
          label="Time window"
          active={`/admin/recommendations?days=${days}`}
          items={WINDOWS.map((d) => ({
            href: `/admin/recommendations?days=${d}`,
            label: `${d} days`,
          }))}
        />
      </div>

      <Section title="Performance">
        <StatGrid>
          <Stat label="Impressions" value={impressions} hint="Recommendations shown" />
          <Stat
            label="Clicks"
            value={clicks}
            hint={impressions === 0 ? "Needs impressions first" : `${ctr.toFixed(1)}% click rate`}
          />
          <Stat
            label="Saves"
            value={saves}
            hint={clicks === 0 ? "Needs clicks first" : `${saveRate.toFixed(1)}% of clicks`}
          />
          <Stat
            label="Dismissals"
            value={dismissals}
            tone={dismissals > 0 ? "warn" : "neutral"}
            hint="Explicitly rejected by the person"
          />
        </StatGrid>
      </Section>

      {!running ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing has been recorded"
            body="Nothing was shown on Explore in this window. Every impression, click and dismissal of a tool, model, person or topic lands here, tagged with its section and the candidate source that generated it."
          />
        </div>
      ) : (
        <>
          <Section
            title="By candidate source"
            lead="Which generator put each recommendation in front of somebody. This is the diagnostic that lets a bad recommendation be traced back to what produced it."
          >
            <TableWrap>
              <Table className="min-w-[520px]">
                <thead>
                  <tr>
                    <Th>Candidate source</Th>
                    <Th numeric>Impressions</Th>
                    <Th numeric>Clicks</Th>
                    <Th numeric>Saves</Th>
                    <Th numeric>Click rate</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_source.map((s) => (
                    <Tr key={s.candidate_source}>
                      <Td className="font-mono text-[13px]">{s.candidate_source}</Td>
                      <Td numeric>{s.impressions.toLocaleString("en-GB")}</Td>
                      <Td numeric>{s.clicks.toLocaleString("en-GB")}</Td>
                      <Td numeric>{s.saves.toLocaleString("en-GB")}</Td>
                      <Td numeric>
                        {s.impressions === 0
                          ? "−"
                          : `${((s.clicks / s.impressions) * 100).toFixed(1)}%`}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </Section>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Section title="By surface" className="mt-0">
              <RankedBars
                valueLabel="impressions"
                rows={data.by_surface.map((s) => ({
                  label: s.surface,
                  value: s.impressions,
                  secondary: `${s.clicks} clicks`,
                }))}
              />
            </Section>

            <Section title="By Explore section" className="mt-0">
              <RankedBars
                valueLabel="impressions"
                rows={(data.by_section ?? []).map((s) => ({
                  label: s.section,
                  value: s.impressions,
                  secondary: `${s.clicks} clicks`,
                }))}
              />
            </Section>

            <Section title="By entity" className="mt-0">
              <RankedBars
                valueLabel="impressions"
                rows={(data.by_entity ?? []).map((s) => ({
                  label: s.entity_type,
                  value: s.impressions,
                  secondary: `${s.clicks} clicks, ${s.dismissals} dismissed`,
                }))}
              />
            </Section>

            <Section title="Most clicked tools" className="mt-0">
              <RankedBars
                valueLabel="clicks"
                rows={data.top_tools.map((t) => ({
                  label: t.name,
                  value: t.clicks,
                  secondary: `${t.impressions} shown, ${t.saves} saved`,
                }))}
              />
            </Section>
          </div>
        </>
      )}

      <Section title="What each row carries">
        <Panel className="px-4 py-4">
          <p className="text-[13px] leading-relaxed text-muted">
            One row per event in <span className="font-mono">recommendation_events</span>: the
            entity and its type, the Explore section and position, the candidate source and reason
            that placed it, the algorithm version, and whether it was shown, clicked or dismissed.
            Impressions are the part that makes everything else meaningful: clicks without
            impressions is a popularity list, not a measurement.
          </p>
        </Panel>
      </Section>
    </>
  );
}
