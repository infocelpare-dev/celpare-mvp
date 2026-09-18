import { requireAdmin } from "@/lib/admin/guard";
import { getSearchAnalytics } from "@/lib/admin/queries";
import { RankedBars, TimeSeries } from "@/components/ui/charts";
import { FilterTabs } from "@/components/admin/filters";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  Section,
  Stat,
  StatGrid,
} from "@/components/admin/ui";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 30, 90];

/*
  Search and discovery analytics.

  The search algorithm is untouched. This reads search_events, a table the
  search route writes one row to after a search has already happened and
  returned. Nothing here influences ranking, and nothing on the query path waits
  on a write: the log is fire and forget and degrades to nothing if it fails.

  The most valuable panel is zero result queries. Every one of those is somebody
  who came looking for something Celpare does not have, which is the cheapest
  list of what to add to the catalogue that exists.

  Queries are recorded, and they are never attributed to a person on this page.
  The user id is on the row so that a plan can be told from a crawler, and the
  popular and zero result lists group by the text alone.
*/
export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await requireAdmin("analytics.read");
  const sp = await searchParams;
  const days = WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 30;

  const data = await getSearchAnalytics(session.db, days);
  if (!data) {
    return (
      <>
        <PageHeader title="Search" />
        <div className="mt-6">
          <ErrorState what="search analytics" />
        </div>
      </>
    );
  }

  const t = data.totals;
  const searches = t.searches ?? 0;
  const zero = t.zero_result ?? 0;
  const views = data.tool_views.total ?? 0;
  const fromSearch = data.tool_views.from_search ?? 0;

  const successRate = searches === 0 ? 0 : ((searches - zero) / searches) * 100;
  /* Conversion is tool views that came FROM a search, over searches. Counting
     every tool view against searches would credit search for people arriving
     from a link, which would make the number go up as search got less used. */
  const conversion = searches === 0 ? 0 : (fromSearch / searches) * 100;

  return (
    <>
      <PageHeader
        title="Search and discovery"
        lead="What people looked for, what came back, and what they opened afterwards."
      />

      <div className="mt-5">
        <FilterTabs
          label="Time window"
          active={`/admin/search?days=${days}`}
          items={WINDOWS.map((d) => ({ href: `/admin/search?days=${d}`, label: `${d} days` }))}
        />
      </div>

      {searches === 0 && views === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing recorded in this window"
            body="Search logging was added with this dashboard, so it only holds searches made from now on. The tool search API and the tool pages both write here; there is no backfill, because inventing history would be worse than having none."
          />
        </div>
      ) : (
        <>
          <Section title="Searches">
            <StatGrid>
              <Stat label="Searches" value={searches} hint={`Over ${days} days`} />
              <Stat
                label="Distinct queries"
                value={t.distinct_queries ?? 0}
                hint="After trimming and lowercasing"
              />
              <Stat
                label="Found something"
                value={t.with_results ?? 0}
                tone="ok"
                hint={`${successRate.toFixed(1)}% success rate`}
              />
              <Stat
                label="Found nothing"
                value={zero}
                tone={zero > 0 ? "warn" : "neutral"}
                hint="The catalogue gap list"
              />
              <Stat
                label="From an account"
                value={t.signed_in ?? 0}
                hint={`${searches - (t.signed_in ?? 0)} from signed out visitors`}
              />
            </StatGrid>

            <div className="mt-3">
              <TimeSeries
                label="Searches per day"
                failedLabel="Found nothing"
                unit="searches"
                windowDays={days}
                points={data.by_day.map((d) => ({
                  day: d.day,
                  value: d.searches,
                  failed: d.zero_result,
                }))}
              />
            </div>
          </Section>

          <Section title="From search to a tool">
            <StatGrid>
              <Stat label="Tool views" value={views} />
              <Stat
                label="From a search"
                value={fromSearch}
                hint={`${conversion.toFixed(1)}% of searches led to a tool`}
              />
              <Stat label="From Explore" value={data.tool_views.from_explore ?? 0} />
              <Stat
                label="From Ask Celpare"
                value={data.tool_views.from_ask ?? 0}
                hint="Opened from a recommendation card"
              />
            </StatGrid>
          </Section>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Section title="Most searched" className="mt-0">
              <RankedBars
                valueLabel="searches"
                rows={data.popular.map((q) => ({
                  label: q.query,
                  value: q.searches,
                  secondary: `${q.avg_results} results on average`,
                }))}
              />
            </Section>

            <Section
              title="Found nothing"
              lead="Every row is somebody who wanted something the catalogue does not have."
              className="mt-0"
            >
              <RankedBars
                valueLabel="searches"
                rows={data.zero_result.map((q) => ({
                  label: q.query,
                  value: q.searches,
                  tone: "danger" as const,
                }))}
                emptyMessage="Every search in this window returned at least one result."
              />
            </Section>
          </div>

          <Section title="Most opened tools">
            <RankedBars
              valueLabel="views"
              rows={data.top_tools.map((tool) => ({
                label: tool.name,
                value: tool.views,
                secondary: `${tool.from_search} from search`,
                href: session.can("submissions.review")
                  ? `/admin/tools/${tool.tool_id}`
                  : `/tools/${tool.slug}`,
              }))}
            />
          </Section>
        </>
      )}

      <Section title="What this measures">
        <Panel className="px-4 py-4 text-[13px] leading-relaxed text-muted">
          A row is written after a search has already run and returned, so logging cannot slow a
          query down or change what it finds. Rows are written server side with the service role
          rather than through a public endpoint, so nobody can manufacture a thousand searches for
          a competitor&rsquo;s name and bury the real ones. Queries are grouped by their text and
          are not attributed to individual people anywhere on this page.
        </Panel>
      </Section>
    </>
  );
}
