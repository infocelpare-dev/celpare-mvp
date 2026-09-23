import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Stars } from "@/components/tools/tool-reviews";
import {
  FactCell,
  FactList,
  Legend,
  Matrix,
  No,
  NotApplicable,
  NotRecorded,
  ProvenanceLine,
  Yes,
  type MatrixRow,
} from "@/components/compare/matrix";
import {
  DOMAIN_LABEL,
  GOAL_ROWS,
  LIFECYCLE_LABEL,
  PERIOD_LABEL,
  PLATFORMS,
  TIER_LABEL,
  foldPlatforms,
  money,
  shortDate,
  tokens,
} from "@/lib/compare/present";
import type {
  Attribute,
  AttributeSection,
  BenchmarkInfo,
  CompareGoal,
  CompareItem,
  CompareItemType,
  EvidenceHealth,
  Evaluation,
  Fact,
  ModelItem,
  Plan,
  Provenance,
  Recommendation,
  ToolItem,
} from "@/lib/compare/types";
import { GOALS } from "@/lib/compare/types";

/*
  The comparison, section by section.

  SERVER COMPONENTS, AND NOT ONE OF THEM SCORES ANYTHING. Every value on this
  page is read from a row and drawn. No section ranks the items, marks a winner,
  totals ticks, averages benchmarks or computes a fit. The order of the columns
  is the order the person chose, in every table, and nothing here reorders them
  (brief sections 9, 29 and 47, D115).

  TYPE AWARE. A tool and a model are not priced or specified in the same units,
  so every section that holds type specific data draws one table per type, over
  only the items of that type. A $20 a month plan and $3 per million input tokens
  never share a row.

  ROWS APPEAR WHEN SOMETHING IS RECORDED. A matrix shows an attribute only when
  at least one item in it has a recorded value, so a thin record reads as a short
  table and one honest sentence, not as a wall of "Not recorded". Where a row IS
  shown, an item with nothing recorded says so in its cell.

  THE ORDER IS THE BRIEF'S HIERARCHY (section 39): items, summary, differences,
  pricing, capabilities, use cases, technical, evidence, reviews, trade offs,
  privacy, sources.
*/

export type SectionId =
  | "glance"
  | "parameters"
  | "summary"
  | "differences"
  | "pricing"
  | "capabilities"
  | "use-cases"
  | "technical"
  | "benchmarks"
  | "reviews"
  | "tradeoffs"
  | "privacy"
  | "sources";

export const SECTION_LABELS: Record<SectionId, string> = {
  glance: "At a glance",
  parameters: "Parameters",
  summary: "Summary",
  differences: "Differences",
  pricing: "Pricing",
  capabilities: "Capabilities",
  "use-cases": "Use cases",
  technical: "Technical",
  benchmarks: "Benchmarks",
  reviews: "Reviews",
  tradeoffs: "Strengths and limits",
  privacy: "Privacy",
  sources: "Sources",
};

export type SectionProps = {
  items: CompareItem[];
  attributes: Attribute[];
  benchmarks: BenchmarkInfo[];
  health: EvidenceHealth;
  goal: CompareGoal | null;
  /* One clock for the whole render, so two cells cannot disagree about "today". */
  now: number;
};

/* ---------------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------------- */

const tools = (items: CompareItem[]) => items.filter((i): i is ToolItem => i.type === "tool");
const models = (items: CompareItem[]) => items.filter((i): i is ModelItem => i.type === "model");

export function factsOf(item: CompareItem, key: string): Fact[] {
  return item.facts.filter((f) => f.attribute === key);
}

export function attributesIn(attributes: Attribute[], section: AttributeSection, type?: CompareItemType) {
  return attributes
    .filter((a) => a.section === section && (!type || a.appliesTo.includes(type)))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function goalRelated(goal: CompareGoal | null, key: string): boolean {
  if (!goal) return false;
  const rows = GOAL_ROWS[goal];
  return rows.fit === key || rows.related.includes(key);
}

/* One row per attribute that at least one of these items has a value for. */
export function factRows(
  items: CompareItem[],
  attributes: Attribute[],
  goal: CompareGoal | null,
  now: number,
  fitFirst = false,
): MatrixRow[] {
  const rows: MatrixRow[] = [];
  for (const a of attributes) {
    const any = items.some((i) => a.appliesTo.includes(i.type) && factsOf(i, a.key).length > 0);
    if (!any) continue;
    rows.push({
      key: a.key,
      label: a.unit ? `${a.label} (${a.unit})` : a.label,
      highlight: goalRelated(goal, a.key),
      cells: items.map((i) => {
        if (!a.appliesTo.includes(i.type)) return <NotApplicable key={i.id} />;
        const facts = factsOf(i, a.key);
        if (facts.length === 0) return <NotRecorded key={i.id} />;
        if (a.valueType === "list") return <FactList key={i.id} facts={facts} now={now} />;
        if (a.valueType === "fit") return <FitCell key={i.id} fact={facts[0]} now={now} />;
        return <FactCell key={i.id} fact={facts[0]} now={now} />;
      }),
    });
  }
  /* A goal moves its own use case row to the top. It does not move any COLUMN
     and it does not hide any row: presentation only, brief section 27. */
  if (fitFirst && goal) {
    const at = rows.findIndex((r) => r.key === GOAL_ROWS[goal].fit);
    if (at > 0) rows.unshift(...rows.splice(at, 1));
  }
  return rows;
}

const FIT_LABEL: Record<string, string> = {
  strong: "Strong fit",
  moderate: "Moderate fit",
  limited: "Limited fit",
};

function FitCell({ fact, now }: { fact: Fact; now: number }) {
  return (
    <span className="block">
      <span>{FIT_LABEL[fact.text ?? ""] ?? fact.text}</span>
      {fact.note ? <span className="mt-1 block text-[12px] text-muted">{fact.note}</span> : null}
      <ProvenanceLine provenance={fact.provenance} now={now} compact />
    </span>
  );
}

function Text({ value, fallback = "Not recorded" }: { value: string | null | undefined; fallback?: string }) {
  return value ? <span>{value}</span> : <NotRecorded label={fallback} />;
}

/* One sentence where a table would be empty. Stated, never left blank. */
export function Nothing({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] leading-relaxed text-muted">{children}</p>;
}

/* D109: a read that failed says so where its content would have been. */
export function ReadFailed({ what }: { what: string }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-xl border border-border px-4 py-3 text-[14px]"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {what} could not be loaded just now. The rest of the comparison is unaffected. Reload the
        page to try again.
      </span>
    </p>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 mt-6 text-[14px] font-semibold first:mt-0">{children}</h3>;
}

/*
  A section. A native <details>, so it collapses with no script, keeps its state
  per section, and is announced as expandable. Open by default: collapsing is a
  choice the reader makes, not something the page makes for them.
  data-compare-section is what the tracker observes for section_viewed.
*/
export function CompareSection({
  id,
  title,
  lead,
  children,
}: {
  id: SectionId;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} data-compare-section={id} className="scroll-mt-32 border-t border-border py-8">
      <details open className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <h2 className="font-display text-[20px] font-semibold">{title}</h2>
          <span className="text-[13px] text-muted">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span>
            <span className="sr-only"> {title}</span>
          </span>
        </summary>
        {lead ? <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-muted">{lead}</p> : null}
        <div className="mt-5">{children}</div>
      </details>
    </section>
  );
}

function ItemMark({ item, size = 40 }: { item: CompareItem; size?: number }) {
  const logo = item.type === "tool" ? item.logoUrl : null;
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background p-1"
      style={{ width: size, height: size }}
    >
      {logo ? (
        <Image src={logo} alt="" width={size} height={size} className="size-full rounded-full object-contain" unoptimized />
      ) : (
        <span className="font-display text-[15px] font-semibold text-muted" aria-hidden>
          {item.name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Summary
   --------------------------------------------------------------------------- */

export function SummarySection({
  items,
  recommendation,
}: SectionProps & { recommendation?: Recommendation | null }) {
  const chosen = recommendation ? items.find((i) => i.id === recommendation.itemId) : null;
  const goalLabel = recommendation ? GOALS.find((g) => g.key === recommendation.goal)?.label : null;

  return (
    <CompareSection
      id="summary"
      title="Summary"
      lead="What each one is, in its own listing's words. Celpare does not name a winner: which one is right depends on what you need it for."
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-2xl border border-border p-4">
            <div className="flex items-start gap-3">
              <ItemMark item={item} />
              <div className="min-w-0">
                <p className="font-medium">{item.name}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {item.type === "tool" ? "Tool" : "Model"}
                  {item.type === "model" && item.provider ? ` by ${item.provider}` : ""}
                  {item.type === "tool" && item.categories[0] ? `, ${item.categories[0]}` : ""}
                </p>
              </div>
            </div>
            <p className="mt-3 line-clamp-4 text-[14px] leading-relaxed">
              {(item.type === "tool" ? item.tagline : null) ?? item.description ?? (
                <span className="text-muted">No description has been listed.</span>
              )}
            </p>
          </li>
        ))}
      </ul>

      {/*
        The recommendation slot. Rendered ONLY when a later analysis step supplies
        one, which today nothing does. It is always framed by the goal it answers,
        never as an objective best (brief section 30).
      */}
      {recommendation && chosen && goalLabel ? (
        <div className="mt-5 rounded-2xl border border-foreground p-4">
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
            Based on your goal: {goalLabel}
          </p>
          <p className="mt-1 font-medium">{chosen.name}</p>
          <p className="mt-1 text-[14px] leading-relaxed">{recommendation.reason}</p>
          <p className="mt-2 text-[12px] text-muted">
            A recommendation for this goal, not a verdict on which is better overall.
          </p>
        </div>
      ) : null}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Differences
   --------------------------------------------------------------------------- */

type Difference = { key: string; label: string; values: { name: string; value: string }[] };

/*
  Where the RECORDED data differs, stated as data.

  This is set difference, not judgement: a row appears when two items hold
  different recorded values for the same thing, and it lists what each holds.
  It never says which difference matters or which side is better. Absence is
  handled carefully: a platform a listing does not mention is "not listed", never
  "not supported", and an unrecorded flag is never counted as a no.
*/
function differences(items: CompareItem[]): Difference[] {
  const out: Difference[] = [];
  const ts = tools(items);
  const ms = models(items);

  if (ts.length >= 2) {
    const pm = ts.map((t) => ({ name: t.name, value: t.pricingModel ?? "" }));
    const known = pm.filter((p) => p.value);
    if (new Set(known.map((p) => p.value)).size > 1) {
      out.push({
        key: "pricing-model",
        label: "Pricing model",
        values: pm.map((p) => ({ ...p, value: p.value ? cap(p.value) : "Not recorded" })),
      });
    }

    const folded = ts.map((t) => ({ tool: t, ...foldPlatforms(t.platforms) }));
    for (const p of PLATFORMS) {
      const listed = folded.filter((f) => f.known.has(p));
      if (listed.length > 0 && listed.length < folded.length && folded.every((f) => f.tool.platforms.length > 0)) {
        out.push({
          key: `platform-${p}`,
          label: p,
          values: folded.map((f) => ({ name: f.tool.name, value: f.known.has(p) ? "Listed" : "Not listed" })),
        });
      }
    }
  }

  if (ms.length >= 2) {
    const ctx = ms.filter((m) => m.contextWindow);
    if (new Set(ctx.map((m) => m.contextWindow)).size > 1) {
      out.push({
        key: "context",
        label: "Context window",
        values: ms.map((m) => ({ name: m.name, value: m.contextWindow ? `${tokens(m.contextWindow)} tokens` : "Not recorded" })),
      });
    }
    for (const [k, label] of [["input", "Input price"], ["output", "Output price"]] as const) {
      const priced = ms.filter((m) => m.prices[k] !== null);
      if (new Set(priced.map((m) => m.prices[k])).size > 1) {
        out.push({
          key: `price-${k}`,
          label: `${label}, per 1M tokens`,
          values: ms.map((m) => ({ name: m.name, value: m.prices[k] !== null ? money(m.prices[k]!, "USD") : "Not recorded" })),
        });
      }
    }
    const mods = ms.map((m) => m.modalities.slice().sort().join(", "));
    if (new Set(mods.filter(Boolean)).size > 1) {
      out.push({
        key: "modalities",
        label: "Modalities",
        values: ms.map((m, i) => ({ name: m.name, value: mods[i] || "Not recorded" })),
      });
    }
  }

  /* Flags recorded yes for some and recorded no for others. Unrecorded is left
     out of the test entirely, because it is not a value. */
  const flagKeys = new Set(items.flatMap((i) => i.facts.filter((f) => f.flag !== null).map((f) => f.attribute)));
  for (const key of flagKeys) {
    const values = items.map((i) => ({ item: i, fact: factsOf(i, key)[0] }));
    const recorded = values.filter((v) => v.fact && v.fact.flag !== null);
    if (new Set(recorded.map((v) => v.fact!.flag)).size > 1) {
      out.push({
        key: `fact-${key}`,
        label: key,
        values: values.map((v) => ({
          name: v.item.name,
          value: !v.fact || v.fact.flag === null ? "Not recorded" : v.fact.flag ? "Yes" : "No",
        })),
      });
    }
  }

  return out;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function DifferencesSection({ items, attributes }: SectionProps) {
  const labels = new Map(attributes.map((a) => [a.key, a.label]));
  const list = differences(items).map((d) =>
    d.key.startsWith("fact-") ? { ...d, label: labels.get(d.label) ?? d.label } : d,
  );
  const mixed = tools(items).length > 0 && models(items).length > 0;

  return (
    <CompareSection
      id="differences"
      title="Key differences"
      lead="Where the recorded data for these differs. This lists what each one has on record. It does not decide which difference matters to you."
    >
      {mixed ? (
        <p className="mb-4 rounded-xl border border-border px-4 py-3 text-[14px] leading-relaxed">
          You are comparing tools with models. A tool is a product you subscribe to and a model is
          priced per token through an API, so their pricing and specifications are shown in separate
          tables below rather than side by side.
        </p>
      ) : null}

      {list.length === 0 ? (
        <Nothing>
          The recorded data does not separate these yet. The sections below show everything that is on
          record for each.
        </Nothing>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {list.slice(0, 10).map((d) => (
            <li key={d.key} className="px-4 py-3">
              <p className="text-[13px] font-medium">{d.label}</p>
              <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
                {d.values.map((v) => (
                  <li key={v.name}>
                    <span className="text-muted">{v.name}: </span>
                    <span className={v.value === "Not recorded" || v.value === "Not listed" ? "italic text-muted" : ""}>
                      {v.value}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Pricing
   --------------------------------------------------------------------------- */

const TIER_ORDER: Plan["tier"][] = ["free", "individual", "team", "business", "enterprise", "usage", "other"];

function PlanCell({ plans, now }: { plans: Plan[]; now: number }) {
  return (
    <ul className="space-y-2.5">
      {plans.map((p) => (
        <li key={p.id}>
          <span className="block font-medium">{p.name}</span>
          <span className="block tabular-nums">
            {p.tier === "free"
              ? "$0"
              : p.price !== null
                ? `${money(p.price, p.currency)} ${p.period ? PERIOD_LABEL[p.period] : ""}${p.perSeat ? " per seat" : ""}`.trim()
                : "Price not published"}
          </span>
          {p.annualPrice !== null ? (
            <span className="block text-[12px] text-muted tabular-nums">
              {money(p.annualPrice, p.currency)} per year{p.perSeat ? " per seat" : ""} when billed annually
            </span>
          ) : null}
          {p.trialDays ? <span className="block text-[12px] text-muted">{p.trialDays} day trial</span> : null}
          {p.limits ? <span className="mt-0.5 block text-[12px] text-muted">{p.limits}</span> : null}
          <ProvenanceLine provenance={p.provenance} now={now} compact />
        </li>
      ))}
    </ul>
  );
}

function ListingLine({ date }: { date: string | null }) {
  const d = shortDate(date);
  return (
    <span className="mt-1 block text-[11px] text-muted">
      From the catalogue listing{d ? `, last changed ${d}` : ""}. Not independently verified.
    </span>
  );
}

function ToolPricing({ items, health, now }: { items: ToolItem[]; health: EvidenceHealth; now: number }) {
  const rows: MatrixRow[] = [
    {
      key: "model",
      label: "Pricing model",
      cells: items.map((t) => <Text key={t.id} value={t.pricingModel ? cap(t.pricingModel) : null} />),
    },
    {
      key: "summary",
      label: "As listed",
      cells: items.map((t) =>
        t.pricingSummary ? (
          <span key={t.id} className="block">
            {t.pricingSummary}
            <ListingLine date={t.listedUpdatedAt} />
          </span>
        ) : (
          <NotRecorded key={t.id} />
        ),
      ),
    },
  ];

  const anyPlans = items.some((t) => t.plans.length > 0);
  if (anyPlans) {
    for (const tier of TIER_ORDER) {
      if (!items.some((t) => t.plans.some((p) => p.tier === tier))) continue;
      rows.push({
        key: `tier-${tier}`,
        label: TIER_LABEL[tier],
        cells: items.map((t) => {
          const plans = t.plans.filter((p) => p.tier === tier);
          if (plans.length > 0) return <PlanCell key={t.id} plans={plans} now={now} />;
          return t.plans.length > 0 ? (
            <span key={t.id} className="text-[12px] text-muted">
              No {TIER_LABEL[tier].toLowerCase()} plan recorded
            </span>
          ) : (
            <NotRecorded key={t.id} />
          );
        }),
      });
    }
  }

  return (
    <>
      <Matrix caption="Tool pricing" columns={items} rows={rows} />
      {!health.plans ? (
        <div className="mt-3">
          <ReadFailed what="Plan by plan pricing" />
        </div>
      ) : !anyPlans ? (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          No plan by plan pricing has been recorded for these tools yet, so only what each listing says
          is shown. Prices change often, and Celpare will not state a current price it has not checked.
        </p>
      ) : null}
    </>
  );
}

function ModelPricing({ items, now }: { items: ModelItem[]; now: number }) {
  const lines: [keyof ModelItem["prices"], string][] = [
    ["input", "Input"],
    ["cachedInput", "Cached input"],
    ["cacheWrite", "Cache writes"],
    ["output", "Output"],
    ["batchInput", "Batch input"],
    ["batchOutput", "Batch output"],
  ];

  const rows: MatrixRow[] = [];
  for (const [key, label] of lines) {
    /* Input and output always show, because they are the two every API model is
       priced on. The rest appear only when somebody has recorded one. */
    const always = key === "input" || key === "output";
    if (!always && !items.some((m) => m.prices[key] !== null)) continue;
    rows.push({
      key,
      label: (
        <>
          {label}
          <span className="block text-[11px] font-normal text-muted">USD per 1M tokens</span>
        </>
      ),
      cells: items.map((m) => {
        const v = m.prices[key] as number | null;
        return v !== null ? (
          <span key={m.id} className="tabular-nums">
            {money(v, "USD")}
          </span>
        ) : (
          <NotRecorded key={m.id} />
        );
      }),
    });
  }

  if (items.some((m) => m.prices.note)) {
    rows.push({
      key: "note",
      label: "Pricing notes",
      cells: items.map((m) => <Text key={m.id} value={m.prices.note} fallback="None recorded" />),
    });
  }

  rows.push({
    key: "source",
    label: "Where the prices come from",
    cells: items.map((m) => {
      const hasPrice = m.prices.input !== null || m.prices.output !== null;
      if (m.prices.provenance.url || m.prices.provenance.verifiedAt) {
        return <ProvenanceLine key={m.id} provenance={m.prices.provenance} now={now} compact />;
      }
      return hasPrice ? <ListingLine key={m.id} date={m.listedUpdatedAt} /> : <NotRecorded key={m.id} />;
    }),
  });

  return <Matrix caption="Model API pricing" columns={items} rows={rows} />;
}

export function PricingSection({ items, health, now }: SectionProps) {
  const ts = tools(items);
  const ms = models(items);
  return (
    <CompareSection
      id="pricing"
      title="Pricing"
      lead="Subscriptions and API prices are different units, so tools and models are priced in separate tables. Every price says where it came from and when it was checked."
    >
      {ts.length > 0 ? (
        <>
          {ms.length > 0 ? <SubHead>Tools: plans and subscriptions</SubHead> : null}
          <ToolPricing items={ts} health={health} now={now} />
        </>
      ) : null}
      {ms.length > 0 ? (
        <>
          {ts.length > 0 ? <SubHead>Models: API pricing</SubHead> : null}
          <ModelPricing items={ms} now={now} />
        </>
      ) : null}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Capabilities
   --------------------------------------------------------------------------- */

export function CapabilitiesSection({ items, attributes, health, goal, now }: SectionProps) {
  const ts = tools(items);
  const ms = models(items);

  const toolRows = factRows(ts, attributesIn(attributes, "capabilities", "tool"), goal, now);
  const modelRows = factRows(ms, attributesIn(attributes, "capabilities", "model"), goal, now);

  return (
    <CompareSection
      id="capabilities"
      title="Capabilities"
      lead="What each one is recorded as doing. Nothing here is inferred from a name or a description."
    >
      {!health.facts ? <ReadFailed what="Recorded capabilities" /> : <Legend />}

      {ts.length > 0 ? (
        <div className="mt-4">
          {ms.length > 0 ? <SubHead>Tools</SubHead> : null}
          {toolRows.length > 0 ? <Matrix caption="Tool capabilities" columns={ts} rows={toolRows} /> : null}
          {toolRows.length === 0 && health.facts ? (
            <Nothing>No capabilities have been recorded for these tools yet.</Nothing>
          ) : null}

          {/* The listings' own feature lists, as written. Free text does not line
              up row by row, so it is shown as each listing words it rather than
              forced into a matrix that would imply it had been matched. */}
          {ts.some((t) => t.features.length > 0) ? (
            <>
              <SubHead>Features, as each listing words them</SubHead>
              <Matrix
                caption="Listed features"
                columns={ts}
                rows={[
                  {
                    key: "features",
                    label: "Listed features",
                    cells: ts.map((t) =>
                      t.features.length > 0 ? (
                        <ul key={t.id} className="space-y-1">
                          {t.features.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      ) : (
                        <NotRecorded key={t.id} />
                      ),
                    ),
                  },
                ]}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {ms.length > 0 ? (
        <div className="mt-4">
          {ts.length > 0 ? <SubHead>Models</SubHead> : null}
          <Matrix
            caption="Model modalities and capabilities"
            columns={ms}
            rows={[
              {
                key: "modalities",
                label: "Modalities, as listed",
                highlight: goal === "image" || goal === "video",
                cells: ms.map((m) => <Text key={m.id} value={m.modalities.join(", ") || null} />),
              },
              ...(ms.some((m) => m.outputModalities.length > 0)
                ? [
                    {
                      key: "output-modalities",
                      label: "Output modalities",
                      cells: ms.map((m) => <Text key={m.id} value={m.outputModalities.join(", ") || null} />),
                    },
                  ]
                : []),
              ...modelRows,
            ]}
          />
          {modelRows.length === 0 && health.facts ? (
            <p className="mt-3 text-[13px] text-muted">
              Beyond their listed modalities, no capabilities have been recorded for these models yet.
            </p>
          ) : null}
        </div>
      ) : null}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Use cases
   --------------------------------------------------------------------------- */

export function UseCasesSection({ items, attributes, health, goal, now }: SectionProps) {
  const rows = factRows(items, attributesIn(attributes, "use_cases"), goal, now, true);
  const goalLabel = goal ? GOALS.find((g) => g.key === goal)?.label : null;

  return (
    <CompareSection
      id="use-cases"
      title="Use cases"
      lead="Documented fit for common jobs. A fit label is only shown where one has been recorded with its source. Celpare does not guess it."
    >
      {!health.facts ? (
        <ReadFailed what="Use case fit" />
      ) : rows.length > 0 ? (
        <Matrix caption="Use case fit" columns={items} rows={rows} />
      ) : (
        <Nothing>
          No documented use case fit has been recorded for these yet
          {goalLabel ? `, including for ${goalLabel.toLowerCase()}` : ""}. The capabilities and pricing above
          are what is on record.
        </Nothing>
      )}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Technical
   --------------------------------------------------------------------------- */

function ModelSpecs({ items, attributes, goal, now }: { items: ModelItem[]; attributes: Attribute[]; goal: CompareGoal | null; now: number }) {
  const base: MatrixRow[] = [
    { key: "provider", label: "Provider", cells: items.map((m) => <Text key={m.id} value={m.provider} />) },
    { key: "family", label: "Family", cells: items.map((m) => <Text key={m.id} value={m.family} />) },
    { key: "version", label: "Version", cells: items.map((m) => <Text key={m.id} value={m.version} />) },
    {
      key: "api-id",
      label: "API model id",
      cells: items.map((m) =>
        m.apiModelId ? (
          <code key={m.id} className="break-all font-mono text-[12px]">
            {m.apiModelId}
          </code>
        ) : (
          <NotRecorded key={m.id} />
        ),
      ),
    },
    { key: "released", label: "Released", cells: items.map((m) => <Text key={m.id} value={shortDate(m.releaseDate)} />) },
    {
      key: "lifecycle",
      label: "Status",
      cells: items.map((m) => <Text key={m.id} value={m.lifecycle ? LIFECYCLE_LABEL[m.lifecycle] : null} />),
    },
    {
      key: "weights",
      label: "Open weights",
      cells: items.map((m) =>
        m.openWeights === true ? <Yes key={m.id} /> : m.openWeights === false ? <No key={m.id} /> : <NotRecorded key={m.id} />,
      ),
    },
    {
      key: "context",
      label: "Context window",
      highlight: goal === "research",
      cells: items.map((m) => <Text key={m.id} value={m.contextWindow ? `${tokens(m.contextWindow)} tokens` : null} />),
    },
    {
      key: "max-output",
      label: "Maximum output",
      cells: items.map((m) => <Text key={m.id} value={m.maxOutputTokens ? `${tokens(m.maxOutputTokens)} tokens` : null} />),
    },
  ];

  /* Identity rows that nobody has recorded for any of these are dropped, the
     same rule the fact rows follow, so a model table is not nine rows of
     "Not recorded". Provider and context stay, being the two every listing has. */
  const keep = base.filter((r) => {
    if (r.key === "provider" || r.key === "context") return true;
    return r.cells.some((c) => {
      const el = c as React.ReactElement;
      return el.type !== NotRecorded;
    });
  });

  const extra = [
    ...factRows(items, attributesIn(attributes, "deployment", "model"), goal, now),
    ...factRows(items, attributesIn(attributes, "technical", "model"), goal, now),
  ];

  return <Matrix caption="Model specifications" columns={items} rows={[...keep, ...extra]} />;
}

function ToolTechnical({ items, attributes, goal, now }: { items: ToolItem[]; attributes: Attribute[]; goal: CompareGoal | null; now: number }) {
  const folded = items.map((t) => foldPlatforms(t.platforms));
  const platformRows: MatrixRow[] = PLATFORMS.filter((p) => folded.some((f) => f.known.has(p))).map((p) => ({
    key: `platform-${p}`,
    label: p,
    highlight: goal === "api" && p === "API",
    cells: items.map((t, i) =>
      folded[i].known.has(p) ? (
        <Yes key={t.id} />
      ) : t.platforms.length === 0 ? (
        <NotRecorded key={t.id} />
      ) : (
        <span key={t.id} className="text-[12px] text-muted">
          Not listed
        </span>
      ),
    ),
  }));
  if (folded.some((f) => f.other.length > 0)) {
    platformRows.push({
      key: "platform-other",
      label: "Also listed",
      cells: items.map((t, i) => <Text key={t.id} value={folded[i].other.join(", ") || null} fallback="Nothing else" />),
    });
  }

  const integrationRows = factRows(items, attributesIn(attributes, "integrations", "tool"), goal, now);
  const deployRows = [
    ...factRows(items, attributesIn(attributes, "deployment", "tool"), goal, now),
    ...factRows(items, attributesIn(attributes, "technical", "tool"), goal, now),
  ];
  const identityRows = factRows(items, attributesIn(attributes, "identity", "tool"), goal, now);

  return (
    <>
      <SubHead>Platforms</SubHead>
      {platformRows.length > 0 ? (
        <>
          <Matrix caption="Platforms" columns={items} rows={platformRows} />
          <p className="mt-2 text-[12px] text-muted">
            From each listing. Not listed means the listing does not mention it, which is not the same as
            unsupported.
          </p>
        </>
      ) : (
        <Nothing>No platforms have been listed for these tools.</Nothing>
      )}

      <SubHead>Integrations</SubHead>
      {integrationRows.length > 0 ? (
        <Matrix caption="Integrations" columns={items} rows={integrationRows} />
      ) : (
        <Nothing>No integrations have been recorded for these tools yet. None are assumed.</Nothing>
      )}

      {deployRows.length + identityRows.length > 0 ? (
        <>
          <SubHead>Deployment and developer details</SubHead>
          <Matrix caption="Tool deployment and developer details" columns={items} rows={[...identityRows, ...deployRows]} />
        </>
      ) : null}
    </>
  );
}

export function TechnicalSection({ items, attributes, health, goal, now }: SectionProps) {
  const ts = tools(items);
  const ms = models(items);
  return (
    <CompareSection id="technical" title="Technical" lead="Platforms, integrations, deployment and specifications, where they are on record.">
      {!health.facts ? (
        <div className="mb-4">
          <ReadFailed what="Recorded technical details" />
        </div>
      ) : null}
      {ts.length > 0 ? (
        <div>
          {ms.length > 0 ? <h3 className="mb-1 text-[15px] font-semibold">Tools</h3> : null}
          <ToolTechnical items={ts} attributes={attributes} goal={goal} now={now} />
        </div>
      ) : null}
      {ms.length > 0 ? (
        <div className={ts.length > 0 ? "mt-8" : ""}>
          {ts.length > 0 ? <h3 className="mb-3 text-[15px] font-semibold">Models</h3> : null}
          <ModelSpecs items={ms} attributes={attributes} goal={goal} now={now} />
        </div>
      ) : null}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Benchmarks and human preference
   --------------------------------------------------------------------------- */

function formatScore(e: Evaluation): string {
  const v = Number(e.score.toFixed(2));
  return e.unit === "percent" ? `${v}%` : String(v);
}

/*
  Where a benchmark sits on the page. Grouped by the job it is evidence for,
  coding first because it is the question asked most, then agents, knowledge
  and business work, research and reasoning, and seeing. The order is about the
  JOB, never about any model's score.
*/
const GROUPS: { key: string; label: string; domains: string[] }[] = [
  { key: "coding", label: "Coding", domains: ["coding"] },
  { key: "agents", label: "Agents and computer use", domains: ["agentic", "computer_use"] },
  { key: "work", label: "Knowledge and business work", domains: ["knowledge", "business"] },
  { key: "research", label: "Research and reasoning", domains: ["reasoning", "science", "math", "long_context"] },
  { key: "vision", label: "Vision and multimodal", domains: ["multimodal"] },
  { key: "preference", label: "Human preference", domains: ["preference"] },
  { key: "other", label: "Other", domains: ["other"] },
];

function groupOf(domain: string) {
  return GROUPS.find((g) => g.domains.includes(domain)) ?? GROUPS[GROUPS.length - 1];
}

const GOAL_GROUP: Partial<Record<CompareGoal, string>> = {
  coding: "coding",
  api: "coding",
  agents: "agents",
  business: "work",
  writing: "work",
  research: "research",
  image: "vision",
};

function ScoreBar({ e, max }: { e: Evaluation; max: number }) {
  /* A percentage is drawn against 100, so 40% looks like 40% and not like
     "the most". A rating has no ceiling, so it is drawn against the row's
     largest value. Size, never a verdict. */
  const pct = e.unit === "percent" ? e.score : max > 0 ? (e.score / max) * 100 : 0;
  return (
    <span className="mt-1.5 block h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-surface" aria-hidden>
      <span
        className="block h-full rounded-full bg-foreground"
        style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
      />
    </span>
  );
}

/*
  One row per (name, metric). The cells are NOT compared with each other: no
  bold, no colour, no "best" marker. When the models in a row were measured by
  different people or with a different harness or dataset version, the row says
  the numbers are not like for like, because that is exactly when a side by side
  number misleads.
*/
function EvaluationRows({
  items,
  kind,
  now,
  benchmarks,
  goal,
}: {
  items: ModelItem[];
  kind: Evaluation["kind"];
  now: number;
  benchmarks: Map<string, BenchmarkInfo>;
  goal: CompareGoal | null;
}) {
  const groups = new Map<
    string,
    { name: string; metric: string; domain: string; higher: boolean; slug: string | null }
  >();
  for (const m of items) {
    for (const e of m.evaluations) {
      if (e.kind !== kind) continue;
      const key = `${e.name}|${e.metric}`;
      if (!groups.has(key)) {
        groups.set(key, {
          name: e.name,
          metric: e.metric,
          domain: e.domain,
          higher: e.higherIsBetter,
          slug: e.benchmarkSlug,
        });
      }
    }
  }

  const byGroup = new Map<string, MatrixRow[]>();
  const ordered = [...groups.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name));

  for (const [key, g] of ordered) {
    const info = g.slug ? benchmarks.get(g.slug) : undefined;
    const cellsFor = items.map(
      (m) =>
        m.evaluations
          .filter((e) => e.kind === kind && `${e.name}|${e.metric}` === key)
          .sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt))[0] ?? null,
    );
    const present = cellsFor.filter((e): e is Evaluation => e !== null);
    const max = Math.max(0, ...present.map((e) => e.score));
    const mixedSetup =
      new Set(present.map((e) => e.harness ?? "")).size > 1 ||
      new Set(present.map((e) => e.datasetVersion ?? "")).size > 1 ||
      new Set(present.map((e) => e.evaluator)).size > 1;

    const row: MatrixRow = {
      key,
      highlight: Boolean(goal && info?.useCases.includes(goal)),
      label: (
        <>
          {g.name}
          <span className="block text-[11px] font-normal text-muted">
            {info?.category ?? DOMAIN_LABEL[g.domain] ?? g.domain}. {g.metric}, {g.higher ? "higher" : "lower"} is
            better
          </span>
          {info ? <span className="mt-1 block text-[12px] font-normal leading-snug">{info.measures}</span> : null}
          {mixedSetup && present.length > 1 ? (
            <span className="mt-1 block text-[11px] font-normal italic">
              Not like for like: measured by different people or setups
            </span>
          ) : null}
        </>
      ),
      cells: cellsFor.map((e, i) =>
        e ? (
          <span key={items[i].id} className="block">
            <span className="text-[15px] font-medium tabular-nums">{formatScore(e)}</span>
            <ScoreBar e={e} max={max} />
            {e.ciLow !== null && e.ciHigh !== null ? (
              <span className="mt-1 block text-[11px] text-muted tabular-nums">
                95% interval {Number(e.ciLow.toFixed(2))} to {Number(e.ciHigh.toFixed(2))}
              </span>
            ) : null}
            {e.note ? <span className="mt-1 block text-[11px] leading-snug">{e.note}</span> : null}
            <span className="mt-1 block text-[11px] leading-snug text-muted">
              {[e.harness, `${e.evaluator}, ${shortDate(e.evaluatedAt)}`].filter(Boolean).join(". ")}
            </span>
            <ProvenanceLine provenance={e.provenance} now={now} compact />
          </span>
        ) : (
          <span key={items[i].id} className="text-[12px] italic text-muted">
            Not published
          </span>
        ),
      ),
    };

    const gk = groupOf(g.domain).key;
    byGroup.set(gk, [...(byGroup.get(gk) ?? []), row]);
  }

  /* A goal moves its own group to the top. It moves no column and hides no row. */
  const goalGroup = goal ? GOAL_GROUP[goal] : undefined;
  const order = [...GROUPS].sort((a, b) => (a.key === goalGroup ? -1 : b.key === goalGroup ? 1 : 0));

  return (
    <>
      {order
        .filter((g) => byGroup.has(g.key))
        .map((g) => {
          const rows = byGroup.get(g.key)!;
          return (
            <div key={g.key} className="mt-6 first:mt-0">
              <h3 id={`benchmarks-${g.key}`} className="mb-3 flex scroll-mt-28 items-center gap-2 text-[15px] font-semibold">
                {g.label}
                <span className="rounded-full bg-surface px-2 py-0.5 text-[12px] font-normal text-muted">
                  {rows.length} {rows.length === 1 ? "benchmark" : "benchmarks"}
                </span>
              </h3>
              <Matrix caption={`${g.label} benchmarks`} columns={items} rows={rows} />
            </div>
          );
        })}
    </>
  );
}

export function BenchmarksSection({ items, health, now, benchmarks, goal }: SectionProps) {
  const ms = models(items);
  if (ms.length === 0) return null;
  const anyBench = ms.some((m) => m.evaluations.some((e) => e.kind === "benchmark"));
  const anyPref = ms.some((m) => m.evaluations.some((e) => e.kind === "human_preference"));
  const info = new Map(benchmarks.map((b) => [b.slug, b]));
  const used = new Set(
    ms.flatMap((m) => m.evaluations.map((e) => e.benchmarkSlug).filter((x): x is string => Boolean(x))),
  );
  const glossary = benchmarks.filter((b) => used.has(b.slug));
  const present = GROUPS.filter((g) =>
    ms.some((m) => m.evaluations.some((e) => e.kind === "benchmark" && groupOf(e.domain).key === g.key)),
  );

  return (
    <CompareSection
      id="benchmarks"
      title="Benchmarks"
      lead="Grouped by the job they measure, coding first. Each result shows who measured it, when, and anything printed beside it such as with tools. There is no overall score, and most published results are run by the companies that make the models."
    >
      {!health.evaluations ? (
        <ReadFailed what="Benchmark results" />
      ) : (
        <>
          {anyBench ? (
            <>
              <ul className="mb-5 flex flex-wrap gap-1.5 text-[13px]">
                {present.map((g) => (
                  <li key={g.key}>
                    <a
                      href={`#benchmarks-${g.key}`}
                      className="inline-flex min-h-9 items-center rounded-full border border-border px-3 transition-colors duration-200 ease-out hover:bg-surface"
                    >
                      {g.label}
                    </a>
                  </li>
                ))}
              </ul>
              <EvaluationRows items={ms} kind="benchmark" now={now} benchmarks={info} goal={goal} />
            </>
          ) : (
            <Nothing>No benchmark results have been recorded for these models yet.</Nothing>
          )}

          {glossary.length > 0 ? (
            <details className="mt-6 rounded-2xl border border-border p-4">
              <summary className="cursor-pointer text-[14px] font-medium">What these benchmarks measure</summary>
              <dl className="mt-3 space-y-3">
                {glossary.map((b) => (
                  <div key={b.slug}>
                    <dt className="text-[14px] font-medium">
                      {b.name}
                      <span className="font-normal text-muted">. {b.category}</span>
                    </dt>
                    <dd className="mt-0.5 text-[13px] leading-relaxed">{b.measures}</dd>
                    <dd className="mt-0.5 text-[12px] leading-relaxed text-muted">{b.howToRead}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ) : null}

          {anyPref ? (
            <>
              <SubHead>Human preference</SubHead>
              <p className="mb-3 max-w-[70ch] text-[13px] leading-relaxed text-muted">
                Pairwise human preference measures which answers people preferred. It is a different kind of evidence
                from a benchmark and is never mixed with one.
              </p>
              <EvaluationRows items={ms} kind="human_preference" now={now} benchmarks={info} goal={goal} />
            </>
          ) : null}
        </>
      )}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Reviews
   --------------------------------------------------------------------------- */

export function ReviewsSection({ items, health }: SectionProps) {
  const ts = tools(items);
  const ms = models(items);

  return (
    <CompareSection
      id="reviews"
      title="Reviews"
      lead="Ratings from Celpare members. A rating is one signal among several, and a handful of ratings says little on its own."
    >
      {ts.length > 0 ? (
        !health.reviews ? (
          <ReadFailed what="Reviews" />
        ) : (
          <Matrix
            caption="Reviews"
            columns={ts}
            rows={[
              {
                key: "rating",
                label: "Average rating",
                cells: ts.map((t) =>
                  t.rating !== null && t.ratingCount > 0 ? (
                    <span key={t.id} className="inline-flex items-center gap-2">
                      <Stars value={t.rating} size={14} />
                      <span className="tabular-nums">{t.rating.toFixed(1)}</span>
                    </span>
                  ) : (
                    <NotRecorded key={t.id} label="Not rated yet" />
                  ),
                ),
              },
              {
                key: "count",
                label: "Ratings",
                cells: ts.map((t) => (
                  <span key={t.id} className="tabular-nums">
                    {t.ratingCount > 0 ? t.ratingCount : <NotRecorded label="None yet" />}
                  </span>
                )),
              },
              {
                key: "spread",
                label: "Spread",
                cells: ts.map((t) =>
                  t.ratingBreakdown && t.ratingCount > 0 ? (
                    <span key={t.id} className="text-[13px] tabular-nums">
                      {([5, 4, 3, 2, 1] as const)
                        .filter((s) => t.ratingBreakdown![s] > 0)
                        .map((s) => `${s} star: ${t.ratingBreakdown![s]}`)
                        .join(", ")}
                    </span>
                  ) : (
                    <NotRecorded key={t.id} label="None yet" />
                  ),
                ),
              },
              {
                key: "latest",
                label: "Most recent review",
                cells: ts.map((t) => <Text key={t.id} value={shortDate(t.latestReviewAt)} fallback="None yet" />),
              },
              {
                key: "themes",
                label: "Review themes",
                cells: ts.map((t) => <NotRecorded key={t.id} label="Not analysed yet" />),
              },
            ]}
          />
        )
      ) : null}
      {ms.length > 0 ? (
        <p className={ts.length > 0 ? "mt-3 text-[13px] text-muted" : "text-[14px] text-muted"}>
          Celpare does not collect reviews of models yet, so {ms.map((m) => m.name).join(", ")}{" "}
          {ms.length === 1 ? "has" : "have"} no rating here.
        </p>
      ) : null}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Strengths and limitations
   --------------------------------------------------------------------------- */

export function TradeOffsSection({ items, health, now }: SectionProps) {
  const any = items.some((i) => factsOf(i, "strength").length + factsOf(i, "limitation").length > 0);
  return (
    <CompareSection
      id="tradeoffs"
      title="Strengths and limitations"
      lead="Documented trade offs, each with its source. Only recorded claims appear here."
    >
      {!health.facts ? (
        <ReadFailed what="Strengths and limitations" />
      ) : !any ? (
        <Nothing>No strengths or limitations have been recorded for these yet.</Nothing>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => {
            const s = factsOf(i, "strength");
            const l = factsOf(i, "limitation");
            return (
              <li key={i.id} className="rounded-2xl border border-border p-4">
                <p className="font-medium">{i.name}</p>
                <p className="mt-3 text-[12px] font-medium uppercase tracking-wide text-muted">Strengths</p>
                {s.length > 0 ? <FactList facts={s} now={now} /> : <NotRecorded label="None recorded" />}
                <p className="mt-3 text-[12px] font-medium uppercase tracking-wide text-muted">Limitations</p>
                {l.length > 0 ? <FactList facts={l} now={now} /> : <NotRecorded label="None recorded" />}
              </li>
            );
          })}
        </ul>
      )}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Privacy and trust
   --------------------------------------------------------------------------- */

export function PrivacySection({ items, attributes, health, goal, now }: SectionProps) {
  const rows = factRows(items, attributesIn(attributes, "privacy"), goal, now);
  return (
    <CompareSection
      id="privacy"
      title="Privacy and trust"
      lead="Data use, retention, security and compliance, as documented. Anything not documented is shown as not specified. Celpare does not infer privacy claims."
    >
      {!health.facts ? (
        <ReadFailed what="Privacy details" />
      ) : rows.length > 0 ? (
        <Matrix
          caption="Privacy and trust"
          columns={items}
          rows={rows.map((r) => ({
            ...r,
            cells: r.cells.map((c) => {
              const el = c as React.ReactElement;
              return el.type === NotRecorded ? <NotRecorded key={el.key ?? undefined} label="Not specified" /> : c;
            }),
          }))}
        />
      ) : (
        <Nothing>Not specified for any of these yet.</Nothing>
      )}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Sources
   --------------------------------------------------------------------------- */

type SourceRow = { key: string; what: string; provenance: Provenance };

function sourcesOf(item: CompareItem): SourceRow[] {
  const rows: SourceRow[] = [];
  const add = (what: string, p: Provenance) => {
    if (!p.url && !p.verifiedAt) return;
    rows.push({ key: `${what}-${p.url ?? ""}-${p.verifiedAt ?? ""}`, what, provenance: p });
  };
  if (item.type === "model") add("API pricing", item.prices.provenance);
  if (item.type === "tool") for (const p of item.plans) add(`${p.name} plan`, p.provenance);
  if (item.type === "model") for (const e of item.evaluations) add(e.name, e.provenance);
  for (const f of item.facts) add(f.attribute.replace(/_/g, " "), f.provenance);

  /* One line per distinct source, so thirty facts from one model card read as
     one source with what it backs, not thirty identical links. */
  const merged = new Map<string, SourceRow>();
  for (const r of rows) {
    const k = r.provenance.url ?? r.key;
    const prev = merged.get(k);
    if (!prev) merged.set(k, { ...r, key: k });
    else if (!prev.what.includes(r.what)) prev.what = `${prev.what}, ${r.what}`;
  }
  return [...merged.values()];
}

export function SourcesSection({ items, now }: SectionProps) {
  return (
    <CompareSection
      id="sources"
      title="Sources and freshness"
      lead="Where this comparison's data comes from. Verified means somebody checked the value against its source on that date. A listing date is when the catalogue entry last changed, which is not a verification."
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((i) => {
          const sources = sourcesOf(i);
          const listed = shortDate(i.listedUpdatedAt);
          return (
            <li key={i.id} className="rounded-2xl border border-border p-4">
              <p className="font-medium">{i.name}</p>
              <p className="mt-1 text-[13px] text-muted">
                Catalogue listing{listed ? `, last changed ${listed}` : ""}.
                {i.type === "tool" && i.inCatalogueSince ? ` Listed since ${shortDate(i.inCatalogueSince)}.` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                {i.href ? (
                  <Link
                    href={i.href}
                    data-compare-event="tool_opened_from_comparison"
                    data-compare-item-type={i.type}
                    data-compare-item-id={i.id}
                    className="underline underline-offset-2 transition-colors duration-200 ease-out hover:text-muted"
                  >
                    Open on Celpare
                  </Link>
                ) : null}
                {i.websiteUrl ? (
                  <a
                    href={i.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    data-compare-event={i.type === "model" ? "model_opened_from_comparison" : "source_opened"}
                    data-compare-item-type={i.type}
                    data-compare-item-id={i.id}
                    className="inline-flex items-center gap-1 underline underline-offset-2 transition-colors duration-200 ease-out hover:text-muted"
                  >
                    Official site
                    <ExternalLink className="size-3" aria-hidden />
                    <span className="sr-only">for {i.name}, opens in a new tab</span>
                  </a>
                ) : null}
              </div>
              {sources.length > 0 ? (
                <ul className="mt-3 space-y-2 border-t border-border pt-3">
                  {sources.map((s) => (
                    <li key={s.key} className="text-[13px]">
                      <span className="block">{s.provenance.label ?? "Source"}</span>
                      <span className="block text-[12px] text-muted">Backs: {s.what}</span>
                      <ProvenanceLine provenance={s.provenance} now={now} compact />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 border-t border-border pt-3 text-[13px] text-muted">
                  No independently sourced data has been recorded for {i.name} yet. Everything shown for it comes
                  from its catalogue listing.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </CompareSection>
  );
}

