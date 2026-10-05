import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { profilesByIds } from "@/lib/admin/queries";
import { changeToolSponsorship, setSponsorshipPlacement } from "@/app/actions/admin";
import { ActionForm } from "@/components/admin/action-form";
import { FilterTabs } from "@/components/admin/filters";
import { EmptyState, PageHeader, PersonCell, Status, When } from "@/components/admin/ui";
import { SponsoredLabel } from "@/components/ui/sponsored-label";
import { formatUsd } from "@/lib/pricing/plans";
import { MAX_SPONSORED_TOOLS, SPONSORED_ACTIVE, SPONSORSHIP_PRICE_CENTS } from "@/lib/sponsored/config";
import { freshnessScore, performanceScore, qualityScore, rankSponsored, runFailures, type Campaign, type Failure } from "@/lib/sponsored/rank";
import { getAllCampaignsAsAdmin } from "@/lib/sponsored/server";
import { searchFit } from "@/lib/sponsored/search";
import { runSearch } from "@/lib/search/engine";
import { NO_AFFINITY, WEIGHTS } from "@/lib/search/ranking";

export const dynamic = "force-dynamic";

/*
  Sponsored tools (D204, D205). Developers see the offer on /pricing/sponsored,
  where it is Coming soon; runs will start from payments (Phase 7). This page
  lists them, shows why each one can or cannot be served and how it is doing
  (aggregates only, never a person), and lets an admin extend a run, end it,
  or suspend its placement without touching the paid dates.

  "Test a query" ranks the sponsored layer for a search exactly as Search
  would, for an anonymous first time viewer, and records nothing.

  Active shows soonest to end first, so a run about to lapse is at the top.
*/

const FAILURE_TEXT: Record<Failure, string> = {
  not_sponsored: "Not sponsored",
  run_inactive: "Run is not active",
  run_expired: "Outside the run's dates",
  tool_not_live: "Tool is not published (suspended, pending or rejected)",
  placement_suspended: "Placement suspended by an admin",
  owner_inactive: "Owner's account is not active",
  below_relevance: "Below the relevance floor",
  below_share_of_best: "Under half as relevant as the best match",
  below_quality: "Below the quality floor",
  no_website: "No https website",
  reported: "Reported too often",
  dismissed: "Hidden by this viewer",
  frequency_cap: "Daily cap reached for this viewer",
  consecutive: "Shown in this viewer's last serve",
  over_limit: `Ranked below the top ${MAX_SPONSORED_TOOLS}`,
};

type Stats = Record<string, Record<string, { n: number; ask: number; search: number }>>;

function pct(n: number) {
  return `${Math.round(n * 100)}`;
}

/* The standing gates for a run, before any query: run state, website,
   reports, quality. */
function standingFailures(c: Campaign): Failure[] {
  const out = runFailures(c);
  if (!c.websiteHttps) out.push("no_website");
  if (c.reporters30d >= SPONSORED_ACTIVE.maxReporters || c.openReports >= SPONSORED_ACTIVE.maxOpenReports) out.push("reported");
  if (qualityScore(c) < SPONSORED_ACTIVE.minQuality) out.push("below_quality");
  return out;
}

const TABS = [
  { key: "active", label: "Active" },
  { key: "ended", label: "Ended" },
  { key: "all", label: "Everything" },
];

/* Past its end date but still marked active. Read at request time; this page
   is force-dynamic, so every load asks again. */
function hasLapsed(r: { status: string; ends_at: string | null }) {
  return r.status === "active" && r.ends_at !== null && new Date(r.ends_at).getTime() <= Date.now();
}

type Row = {
  id: string;
  tool_id: string;
  developer_id: string;
  status: string;
  price_cents: number;
  message: string | null;
  decision_reason: string | null;
  decided_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  frequency_cap: number | null;
  ranking_version: string;
  placement_suspended_at: string | null;
  placement_suspended_reason: string | null;
  tools: { name: string; slug: string; status: string } | null;
};

export default async function AdminSponsorshipsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await requireAdmin("users.plan");
  const sp = await searchParams;
  const testQuery = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const status = TABS.some((t) => t.key === sp.status) ? sp.status! : "active";

  let query = session.db
    .from("tool_sponsorships")
    .select(
      "id, tool_id, developer_id, status, price_cents, message, decision_reason, decided_at, starts_at, ends_at, created_at, frequency_cap, ranking_version, placement_suspended_at, placement_suspended_reason, tools(name, slug, status)",
    )
    .limit(100);
  query =
    status === "active"
      ? query.order("ends_at", { ascending: true })
      : query.order("created_at", { ascending: false });
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  /* A failed read is an error page, never an empty queue (rule 13). */
  if (error) throw new Error(`sponsorships: ${error.message}`);
  const rows = (data ?? []) as unknown as Row[];

  const [owners, campaigns, statsRes] = await Promise.all([
    profilesByIds(session.db, [...new Set(rows.map((r) => r.developer_id))]),
    getAllCampaignsAsAdmin(session.db),
    session.db.rpc("admin_sponsorship_stats", { p_days: 30 }),
  ]);
  if (statsRes.error) throw new Error(`sponsorship stats: ${statsRes.error.message}`);
  const stats: Stats = {};
  for (const r of (statsRes.data ?? []) as { sponsorship_id: string; event: string; n: number; ask: number; search: number }[]) {
    (stats[r.sponsorship_id] ??= {})[r.event] = { n: r.n, ask: r.ask, search: r.search };
  }
  const campaignById = new Map(campaigns.map((c) => [c.sponsorshipId, c]));

  /* The query tester: the organic tool ranking for this query, then the
     sponsored layer over every run (live or not, so failures show), for a
     viewer with no history. runSearch with record false writes nothing. */
  let test: ReturnType<typeof rankSponsored> | null = null;
  const nameOf = new Map(rows.map((r) => [r.tool_id, r.tools?.name ?? r.tool_id]));
  if (testQuery) {
    const results = await runSearch({ query: testQuery, tab: "tools", signedIn: false, viewerId: null, record: false });
    test = rankSponsored({
      surface: "search",
      campaigns,
      candidates: results.tools.map((x) => ({
        toolId: x.candidate.id,
        relevance: x.score.relevance / WEIGHTS.RELEVANCE,
        fit: searchFit(x.candidate, NO_AFFINITY),
      })),
    });
    for (const x of results.tools) nameOf.set(x.candidate.id, x.candidate.name);
  }

  return (
    <>
      <PageHeader
        title="Sponsored tools"
        lead={`Tools sponsored at ${formatUsd(SPONSORSHIP_PRICE_CENTS)} a month, the same for every developer: no bids. While a run is active the tool is eligible for a labelled Sponsored slot in Search and Ask, only on queries it matches, at most ${MAX_SPONSORED_TOOLS} at a time, ordered by ${SPONSORED_ACTIVE.version} (relevance, quality, fit, performance, verification, freshness). On sale from payments (Phase 7); until then it shows Coming soon on /pricing/sponsored.`}
      />

      <div className="mt-5">
        <FilterTabs
          label="Sponsorship status"
          active={`/admin/sponsorships?status=${status}`}
          items={TABS.map((t) => ({
            href: `/admin/sponsorships?status=${t.key}`,
            label: t.label,
            count: t.key === status ? rows.length : undefined,
          }))}
        />
      </div>

      <section className="mt-6 rounded-xl border border-border p-4" aria-labelledby="sponsored-test">
        <h2 id="sponsored-test" className="font-display text-[15px] font-semibold">
          Test a query
        </h2>
        <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-muted">
          Ranks the sponsored layer for a Search query as {SPONSORED_ACTIVE.version} would, for a first time anonymous
          viewer. Every run is considered, live or not, so you can see why one is left out. Nothing is recorded.
        </p>
        <form className="mt-3 flex flex-wrap gap-2" action="/admin/sponsorships">
          <input type="hidden" name="status" value={status} />
          <label htmlFor="sponsored-q" className="sr-only">
            Search query
          </label>
          <input
            id="sponsored-q"
            name="q"
            defaultValue={testQuery}
            placeholder="ai coding tool"
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[14px] focus-visible:outline-2 focus-visible:outline-ring"
          />
          <button
            type="submit"
            className="min-h-10 cursor-pointer rounded-full bg-foreground px-4 text-[14px] font-medium text-background transition-opacity duration-200 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Rank
          </button>
        </form>

        {test ? (
          test.decisions.length === 0 ? (
            <p className="mt-4 text-[13px] text-muted">
              No sponsored tool was among the tools this query retrieved, so no sponsored slot would show.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="text-[12px] text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Position</th>
                    <th className="py-2 pr-3 font-medium">Tool</th>
                    <th className="py-2 pr-3 font-medium">Score</th>
                    <th className="py-2 pr-3 font-medium">Relevance</th>
                    <th className="py-2 pr-3 font-medium">Quality</th>
                    <th className="py-2 pr-3 font-medium">Fit</th>
                    <th className="py-2 pr-3 font-medium">Performance</th>
                    <th className="py-2 pr-3 font-medium">Verified</th>
                    <th className="py-2 pr-3 font-medium">Freshness</th>
                    <th className="py-2 pr-3 font-medium">Diversity</th>
                    <th className="py-2 font-medium">Left out because</th>
                  </tr>
                </thead>
                <tbody>
                  {test.decisions.map((d) => (
                    <tr key={d.toolId} className="border-t border-border align-top">
                      <td className="py-2 pr-3">{d.position === null ? "Not shown" : `#${d.position + 1}`}</td>
                      <td className="py-2 pr-3 font-medium">{nameOf.get(d.toolId) ?? d.slug}</td>
                      <td className="py-2 pr-3 tabular-nums">{d.score ?? "-"}</td>
                      <td className="py-2 pr-3 tabular-nums">{d.components ? pct(d.components.relevance) : "-"}</td>
                      <td className="py-2 pr-3 tabular-nums">{d.components ? pct(d.components.quality) : "-"}</td>
                      <td className="py-2 pr-3 tabular-nums">{d.components ? pct(d.components.fit) : "-"}</td>
                      <td className="py-2 pr-3 tabular-nums">{d.components ? pct(d.components.performance) : "-"}</td>
                      <td className="py-2 pr-3 tabular-nums">{d.components ? pct(d.components.verification) : "-"}</td>
                      <td className="py-2 pr-3 tabular-nums">{d.components ? pct(d.components.freshness) : "-"}</td>
                      <td className="py-2 pr-3 tabular-nums">{d.diversityPenalty ? `-${d.diversityPenalty}` : "0"}</td>
                      <td className="py-2 text-muted">{d.failures.length ? d.failures.map((f) => FAILURE_TEXT[f]).join("; ") : "Shown"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={status === "active" ? "No tool is sponsored" : "Nothing with that status"}
            body={
              status === "active"
                ? "Sponsorship is Coming soon. Runs appear here once payments open."
                : "Try another tab."
            }
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => {
            const owner = owners.get(r.developer_id);
            const name = r.tools?.name ?? "Deleted tool";
            const lapsed = hasLapsed(r);

            return (
              <li key={r.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/tools/${r.tool_id}`}
                        className="font-display text-[15px] font-semibold hover:underline"
                      >
                        {name}
                      </Link>
                      {r.status === "active" && !lapsed ? <SponsoredLabel /> : null}
                      <Status value={lapsed ? "ended" : r.status} />
                      <span className="text-[12px] text-muted">{formatUsd(r.price_cents)} a month</span>
                    </div>

                    {r.decision_reason ? (
                      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-muted">
                        Decision: {r.decision_reason}
                      </p>
                    ) : null}

                    {r.placement_suspended_at ? (
                      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-foreground">
                        Placement suspended <When iso={r.placement_suspended_at} />
                        {r.placement_suspended_reason ? `: ${r.placement_suspended_reason}` : ""}
                      </p>
                    ) : null}

                    <RunState campaign={campaignById.get(r.id)} />
                    <RunStats stats={stats[r.id]} version={r.ranking_version} cap={r.frequency_cap} />

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
                      {r.starts_at ? (
                        <span>
                          Started <When iso={r.starts_at} />
                        </span>
                      ) : null}
                      {r.ends_at ? (
                        <span>
                          {lapsed || r.status !== "active" ? "Ended" : "Ends"} <When iso={r.ends_at} />
                        </span>
                      ) : null}
                      {owner ? (
                        <PersonCell
                          id={owner.id}
                          username={owner.username}
                          fullName={owner.full_name}
                          avatarUrl={owner.avatar_url}
                          accountStatus={owner.account_status}
                        />
                      ) : null}
                    </div>
                  </div>

                  {r.tools ? (
                    <Link
                      href={`/tools/${r.tools.slug}`}
                      className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
                    >
                      Public page
                    </Link>
                  ) : null}
                </div>

                {r.status === "active" && !lapsed ? (
                  <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-border pt-4">
                    <ActionForm
                      action={changeToolSponsorship}
                      fields={{ id: r.id, action: "extend" }}
                      label="Extend one month"
                      tone="primary"
                      confirm={{
                        title: `Extend ${name} by a month?`,
                        body: "Only once the next month is paid for.",
                        confirmLabel: "Extend",
                      }}
                    />
                    {r.placement_suspended_at ? (
                      <ActionForm
                        action={setSponsorshipPlacement}
                        fields={{ id: r.id, suspend: "false" }}
                        label="Restore placement"
                        confirm={{
                          title: `Restore the sponsored placement of ${name}?`,
                          body: "It can be served again on queries it matches.",
                          confirmLabel: "Restore",
                        }}
                      />
                    ) : (
                      <ActionForm
                        action={setSponsorshipPlacement}
                        fields={{ id: r.id, suspend: "true" }}
                        label="Suspend placement"
                        requireReason
                        reasonLabel="Why, for the audit log"
                        confirm={{
                          title: `Suspend the sponsored placement of ${name}?`,
                          body: "It stops being served as sponsored. The paid run and its dates are unchanged.",
                          confirmLabel: "Suspend",
                        }}
                      />
                    )}
                    <ActionForm
                      action={changeToolSponsorship}
                      fields={{ id: r.id, action: "end" }}
                      label="End now"
                      tone="danger"
                      requireReason
                      reasonLabel="Why, shown to the developer"
                      confirm={{
                        title: `End the sponsorship of ${name}?`,
                        body: "The Sponsored slot stops today.",
                        confirmLabel: "End",
                      }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* Read at request time; this page is force-dynamic, as hasLapsed is. */
function freshnessToday(c: Campaign) {
  return freshnessScore(c, Date.now());
}

/* Why this run can or cannot be served right now, before any query, and the
   standing parts of its score. */
function RunState({ campaign }: { campaign: Campaign | undefined }) {
  if (!campaign) return null;
  const failures = standingFailures(campaign);
  return (
    <p className="mt-2 max-w-[80ch] text-[12px] leading-relaxed text-muted">
      <span className="font-medium text-foreground">
        {failures.length === 0 ? "Eligible" : `Not served: ${failures.map((f) => FAILURE_TEXT[f]).join("; ")}`}
      </span>
      {" · "}Quality {pct(qualityScore(campaign))} · Performance {pct(performanceScore(campaign))} · Verified{" "}
      {campaign.verified ? "yes" : "no"} · Freshness {pct(freshnessToday(campaign))}
    </p>
  );
}

/* Thirty days of aggregate counts. Served is a serve in a response; Views is
   on screen for a second. Never per person. */
function RunStats({
  stats,
  version,
  cap,
}: {
  stats: Stats[string] | undefined;
  version: string;
  cap: number | null;
}) {
  const n = (e: string) => stats?.[e]?.n ?? 0;
  const views = n("view");
  const clicks = n("click");
  const items: [string, string][] = [
    ["Served", String(n("impression"))],
    ["Views", String(views)],
    ["Clicks", String(clicks)],
    ["Click rate", views > 0 ? `${((clicks / views) * 100).toFixed(1)}%` : "-"],
    ["Saves", String(n("save"))],
    ["Hidden", String(n("dismiss"))],
    ["Reports", String(n("report"))],
    ["Search / Ask", `${stats?.impression?.search ?? 0} / ${stats?.impression?.ask ?? 0}`],
    ["Version", version],
    ["Daily cap", cap === null ? `${SPONSORED_ACTIVE.maxImpressionsPerViewerPerDay} (default)` : String(cap)],
  ];
  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      {items.map(([k, v]) => (
        <div key={k} className="flex gap-1">
          <dt>{k}</dt>
          <dd className="tabular-nums text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
