import { ExternalLink } from "lucide-react";
import { CompareSection, Nothing } from "@/components/compare/sections";
import { Matrix, NotRecorded, type MatrixRow } from "@/components/compare/matrix";
import { ScenarioForm } from "@/components/compare/preferences";
import { cn } from "@/lib/utils";
import { money, shortDate } from "@/lib/compare/present";
import type { CompareItem } from "@/lib/compare/types";
import { formatShort } from "@/lib/compare/intelligence/format";
import type {
  CompareResult,
  ComparisonEvidence,
  ComparisonValue,
  FitAnalysis,
  FitReason,
  SummaryLine,
} from "@/lib/compare/intelligence/types";
import type { CompareDebug } from "@/lib/compare/intelligence/server/debug";

/*
  The compare_v1 sections (guide 16 section 22 and the 4BJ plan).

  Server components over one CompareResult. They draw what the engine computed
  and nothing more: every derived line carries its evidence behind a "Why is this
  shown?" disclosure, a fit is lists of reasons with no number, and no component
  names a winner, badges an option or reorders the columns.
*/

function nameOf(result: CompareResult, id: string): string {
  return result.matrix.entities.find((e) => e.id === id)?.name ?? "An item";
}

function list(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/* Labels for a list of dimension ids, each named once: two attributes can share
   a label ("Coding" is a capability and a use case fit), and "Coding, Coding" reads as a bug. */
function labelsOf(ids: string[], labelOf: Map<string, string>): string[] {
  return [...new Set(ids.map((id) => labelOf.get(id) ?? id))];
}

const KIND_LABEL: Record<SummaryLine["kind"], string> = {
  fact: "Fact",
  derived: "Derived",
  interpretation: "Interpretation",
};

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-border px-2 text-[11px] font-medium uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}

/* "official" is decided by domain: the source is on the listing's own website.
   A vendor with several domains (claude.ai and anthropic.com) therefore reads as
   another site, which is why that case never claims to be independent. */
const SOURCE_TYPE: Record<ComparisonEvidence["sourceType"], string> = {
  official: "On the listed website",
  independent: "Source on another site",
  benchmark: "Benchmark result",
  community: "Celpare community",
  user: "Listing text",
};

/* "Why is this shown?": the evidence rows behind a derived statement. */
export function Why({ result, ids, entityId }: { result: CompareResult; ids: string[]; entityId?: string }) {
  const rows = [...new Set(ids)].map((id) => result.evidence[id]).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <details className="mt-1.5 text-[13px]">
      <summary
        className="inline-flex min-h-6 cursor-pointer list-none items-center text-muted underline-offset-4 hover:text-foreground hover:underline [&::-webkit-details-marker]:hidden"
        data-compare-event="dimension_expanded"
      >
        Why is this shown?
      </summary>
      <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
        {rows.map((e) => (
          <li key={e.id} className="leading-relaxed">
            <span className="text-muted">{nameOf(result, e.entityId)}: </span>
            {e.claim}
            <span className="text-muted">
              {" "}
              · {SOURCE_TYPE[e.sourceType]}
              {e.observedAt ? `, checked ${shortDate(e.observedAt)}` : ", no check date recorded"}
              {e.confidence === "low" ? ", low confidence" : ""}
            </span>
            {e.sourceUrl ? (
              <>
                {" "}
                <a
                  href={e.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-compare-event={entityId ? "recommendation_clicked" : "source_opened"}
                  data-compare-item-type={entityId ? result.matrix.entities.find((x) => x.id === entityId)?.type : undefined}
                  data-compare-item-id={entityId}
                  className="inline-flex items-center gap-1 underline underline-offset-4"
                >
                  {e.sourceName ?? "Source"}
                  <ExternalLink className="size-3" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ---------------------------------------------------------------------------
   Key differences: the tagged summary, then pairwise (2) or leaders (3+)
   --------------------------------------------------------------------------- */

function flagLine(result: CompareResult, di: number): string | null {
  const dim = result.matrix.dimensions[di];
  const row = result.matrix.values[di];
  const yes: string[] = [];
  const no: string[] = [];
  const none: string[] = [];
  row.forEach((v, i) => {
    const n = result.matrix.entities[i].name;
    if (v.state === "known" && v.value === true) yes.push(n);
    else if (v.state === "known" && v.value === false) no.push(n);
    else if (v.state !== "not_applicable") none.push(n);
  });
  if (yes.length === 0 || no.length === 0) return null;
  const platform = dim.section === "platforms";
  return [
    `${dim.label}: ${platform ? "listed by" : "recorded yes for"} ${list(yes)}`,
    `${platform ? "not listed by" : "recorded no for"} ${list(no)}`,
    none.length > 0 ? `not recorded for ${list(none)}` : null,
  ]
    .filter(Boolean)
    .join("; ")
    .concat(".");
}

export function KeyDifferences({ result }: { result: CompareResult }) {
  const n = result.matrix.entities.length;
  const at = new Map(result.order.map((id, i) => [id, i]));
  const publicIssues = result.issues.filter((i) => i.visibility === "public");

  const pairs =
    n === 2
      ? result.pairwise.filter((p) => p.delta !== 0).sort((a, b) => (at.get(a.dimension) ?? 0) - (at.get(b.dimension) ?? 0)).slice(0, 12)
      : [];
  const leaders =
    n >= 3
      ? result.stats
          .filter((s) => s.leader)
          .sort((a, b) => (at.get(a.dimension) ?? 0) - (at.get(b.dimension) ?? 0))
          .slice(0, 10)
      : [];
  const flags =
    n >= 3
      ? result.matrix.dimensions
          .map((d, i) => ({ d, i, line: d.kind === "flag" ? flagLine(result, i) : null }))
          .filter((x) => x.line)
          .sort((a, b) => (at.get(a.d.id) ?? 0) - (at.get(b.d.id) ?? 0))
          .slice(0, 8)
      : [];

  return (
    <CompareSection
      id="differences"
      title="Key differences"
      lead="What the recorded data says differs, and how each statement was worked out. It does not decide which difference matters to you, and it never picks a winner."
    >
      <ul className="space-y-2.5" aria-label="Summary">
        {result.summary.map((l, i) => (
          <li key={i} className="flex items-start gap-3 text-[14px] leading-relaxed">
            <Tag>{KIND_LABEL[l.kind]}</Tag>
            <span className={cn(l.kind === "interpretation" && "text-muted")}>{l.text}</span>
          </li>
        ))}
      </ul>

      {pairs.length > 0 ? (
        <ul className="mt-6 divide-y divide-border rounded-2xl border border-border">
          {pairs.map((p) => (
            <li key={`${p.dimension}-${p.a}-${p.b}`} className="px-4 py-3 text-[14px] leading-relaxed">
              <p>{p.interpretation}</p>
              {p.caveat ? <p className="mt-1 text-[13px] text-muted">{p.caveat}</p> : null}
              <Why result={result} ids={p.evidence} />
            </li>
          ))}
        </ul>
      ) : null}

      {leaders.length > 0 || flags.length > 0 ? (
        <ul className="mt-6 divide-y divide-border rounded-2xl border border-border">
          {leaders.map((s) => {
            const di = result.matrix.dimensions.findIndex((d) => d.id === s.dimension);
            const dim = result.matrix.dimensions[di];
            const ev = result.matrix.values[di].flatMap((v) => (v.state === "known" ? v.evidence : []));
            return (
              <li key={s.dimension} className="px-4 py-3 text-[14px] leading-relaxed">
                <p>
                  <span className="font-medium">{s.leader!.label}:</span> {list(s.leader!.entityIds.map((id) => nameOf(result, id)))} ({s.leader!.display})
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  Recorded for {s.known} of {s.total}
                  {s.min !== undefined && s.max !== undefined && s.range! > 0
                    ? `, from ${formatShort(dim, s.min)} to ${formatShort(dim, s.max)}`
                    : ""}
                  {s.median !== undefined ? `, median ${formatShort(dim, s.median)}` : ""}.
                  {s.leader!.caveat ? ` ${s.leader!.caveat}` : ""}
                </p>
                <Why result={result} ids={ev} />
              </li>
            );
          })}
          {flags.map((x) => (
            <li key={x.d.id} className="px-4 py-3 text-[14px] leading-relaxed">
              <p>{x.line}</p>
              <Why result={result} ids={result.matrix.values[x.i].flatMap((v) => (v.state === "known" ? v.evidence : []))} />
            </li>
          ))}
        </ul>
      ) : null}

      {pairs.length === 0 && leaders.length === 0 && flags.length === 0 ? (
        <div className="mt-6">
          <Nothing>The recorded data does not separate these yet. The sections below show everything that is on record for each.</Nothing>
        </div>
      ) : null}

      {publicIssues.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-border px-4 py-3">
          <p className="text-[13px] font-medium">Data notes</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-muted">
            {publicIssues.slice(0, 8).map((i, k) => (
              <li key={k}>{i.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Fit: only with a goal or weights (D161)
   --------------------------------------------------------------------------- */

function Reasons({ result, title, sign, items, entityId }: { result: CompareResult; title: string; sign: string; items: FitReason[]; entityId: string }) {
  return (
    <>
      <p className="mt-3 text-[12px] font-medium uppercase tracking-wide text-muted">{title}</p>
      {items.length === 0 ? (
        <NotRecorded label="None from the recorded data" />
      ) : (
        <ul className="mt-1 space-y-2">
          {items.map((r) => (
            <li key={r.dimension} className="text-[14px] leading-relaxed">
              <span aria-hidden className="mr-1.5 font-medium">
                {sign}
              </span>
              {r.text}
              <span className="block text-[13px] text-muted">{r.reason}</span>
              <Why result={result} ids={r.evidence} entityId={entityId} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function FitSection({ result }: { result: CompareResult }) {
  if (!result.fit || !result.goal) return null;
  const labelOf = new Map(result.matrix.dimensions.map((d) => [d.id, d.label]));
  return (
    <CompareSection
      id="fit"
      title={`Fit for ${result.goal.key === "custom" ? "your priorities" : result.goal.name.toLowerCase()}`}
      lead="How each option matches what you said matters, from the recorded data. This is not a verdict on which is better overall, and nothing here is scored or ranked."
    >
      {result.explanation ? <p className="mb-4 text-[15px] leading-relaxed">{result.explanation}</p> : null}
      {nothingSeparates(result.fit) ? (
        <p className="mb-4 text-[14px] leading-relaxed text-muted">
          The recorded data does not separate these for this goal yet. What is missing for each one is listed below.
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {result.fit.map((f: FitAnalysis) => (
          <li key={f.entityId} className="rounded-2xl border border-border p-4">
            <p className="font-medium">{nameOf(result, f.entityId)}</p>
            <Reasons result={result} title="Strengths for this goal" sign="+" items={f.strengths} entityId={f.entityId} />
            <Reasons result={result} title="Tradeoffs for this goal" sign="−" items={f.tradeoffs} entityId={f.entityId} />
            {f.missingEvidence.length > 0 ? (
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                No data on record for: {list(labelsOf(f.missingEvidence, labelOf).slice(0, 6))}
                {labelsOf(f.missingEvidence, labelOf).length > 6 ? ` and ${labelsOf(f.missingEvidence, labelOf).length - 6} more` : ""}. Missing data is not counted against it.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {result.sharedMissing.length > 0 ? (
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          Nobody in this comparison has data on record for {list(labelsOf(result.sharedMissing, labelOf).slice(0, 6))}
          {labelsOf(result.sharedMissing, labelOf).length > 6 ? ` and ${labelsOf(result.sharedMissing, labelOf).length - 6} more` : ""}, so those priorities could not be checked.
        </p>
      ) : null}
    </CompareSection>
  );
}

/* The small tools and models panel (D162): shared dimensions only. */
function nothingSeparates(fit: FitAnalysis[]): boolean {
  return fit.every((f) => f.strengths.length === 0 && f.tradeoffs.length === 0);
}

export function MixedPanel({ result }: { result: CompareResult }) {
  if (!result.fit || !result.goal) return null;
  const labelOf = new Map(result.matrix.dimensions.map((d) => [d.id, d.label]));
  const empty = nothingSeparates(result.fit);
  return (
    <CompareSection
      id="mixed"
      title={`Tools and models for ${result.goal.key === "custom" ? "your priorities" : result.goal.name.toLowerCase()}`}
      lead="A tool is a product you subscribe to and a model is something you call through an API, so they are chosen on different facts. This panel only uses what both have: shared capabilities, deployment, privacy and recorded use case fit. Prices are never set side by side."
    >
      {empty ? (
        <Nothing>
          The data both kinds share does not separate these for this goal yet.
          {result.sharedMissing.length > 0
            ? ` Nothing is on record for ${list(labelsOf(result.sharedMissing, labelOf).slice(0, 5))} across all of them.`
            : ""}
        </Nothing>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {result.fit.map((f) => {
            const e = result.matrix.entities.find((x) => x.id === f.entityId);
            return (
              <li key={f.entityId} className="rounded-2xl border border-border p-4">
                <p className="font-medium">{e?.name}</p>
                <p className="text-[12px] text-muted">{e?.type === "tool" ? "Tool" : "Model"}</p>
                <Reasons result={result} title="Strengths" sign="+" items={f.strengths} entityId={f.entityId} />
                <Reasons result={result} title="Tradeoffs" sign="−" items={f.tradeoffs} entityId={f.entityId} />
                {f.missingEvidence.length > 0 ? (
                  <p className="mt-3 text-[13px] text-muted">No data on record for: {list(labelsOf(f.missingEvidence, labelOf).slice(0, 5))}.</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Performance (D167): Not measured until somebody measures
   --------------------------------------------------------------------------- */

function cellFor(v: ComparisonValue): React.ReactNode {
  if (v.state === "known") {
    return (
      <span>
        {v.display}
        {v.freshness === "stale" ? <span className="block text-[12px] text-muted">Older data</span> : null}
        {v.note ? <span className="block text-[12px] text-muted">{v.note}</span> : null}
      </span>
    );
  }
  if (v.state === "not_measured") return <NotRecorded label="Not measured" />;
  if (v.state === "conflict") return <span className="text-[13px]">Sources report different values. See sources.</span>;
  if (v.state === "not_applicable") return <NotRecorded label="Does not apply" />;
  return <NotRecorded />;
}

export function PerformanceSection({ result, items }: { result: CompareResult; items: CompareItem[] }) {
  const rows: MatrixRow[] = result.matrix.dimensions.flatMap((d, i) =>
    d.kind === "performance" ? [{ key: d.id, label: d.label, cells: result.matrix.values[i].map(cellFor) }] : [],
  );
  const measured = rows.length > 0 && result.matrix.dimensions.some((d, i) => d.kind === "performance" && result.matrix.coverage[i] > 0);
  return (
    <CompareSection
      id="performance"
      title="Performance"
      lead="Time to first token, output speed, latency, throughput and uptime, each with where and when it was measured. Performance changes by provider, endpoint and day, so a measurement is never presented as a constant."
    >
      {!measured ? (
        <p className="mb-4 text-[14px] leading-relaxed">
          No performance measurements are recorded for these models yet. Celpare does not estimate them, so every cell below reads Not measured.
        </p>
      ) : null}
      <Matrix caption="Performance" columns={items} rows={rows} />
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Cost estimate (D165): explicit assumptions only
   --------------------------------------------------------------------------- */

export function CostSection({ result }: { result: CompareResult }) {
  const s = result.scenario;
  return (
    <CompareSection
      id="cost"
      title="Cost estimate"
      lead="Enter how many tokens you expect to send and receive. Celpare multiplies them by each model's listed input and output price. Cache and batch discounts depend on how a workload is built, so they are not included."
    >
      <ScenarioForm
        initial={s ? s.assumptions : null}
      />
      {s ? (
        <div className="mt-5">
          <p className="text-[13px] font-medium">
            {s.label}: {s.assumptions.inputTokens.toLocaleString("en-US")} input tokens and {s.assumptions.outputTokens.toLocaleString("en-US")} output tokens.
          </p>
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
            {s.costs.map((c) => (
              <li key={c.entityId} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-[14px]">
                <span>{nameOf(result, c.entityId)}</span>
                {c.cost !== null ? (
                  <span className="tabular-nums">
                    {money(c.cost, "USD")}
                    <span className="ml-2 text-[12px] text-muted">
                      input {money(c.inputCost ?? 0, "USD")}, output {money(c.outputCost ?? 0, "USD")}
                    </span>
                  </span>
                ) : (
                  <span className="text-[13px] italic text-muted">No estimate: {list(c.missing)} price not recorded</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Tradeoffs chart (Pareto). Direct labels, a table always, no "best"
   --------------------------------------------------------------------------- */

export function TradeoffChart({ result }: { result: CompareResult }) {
  const p = result.pareto;
  if (!p) return null;
  const xd = result.matrix.dimensions.find((d) => d.id === p.x)!;
  const yd = result.matrix.dimensions.find((d) => d.id === p.y)!;
  const W = 560;
  const H = 300;
  const pad = { l: 56, r: 24, t: 20, b: 48 };
  const xs = p.points.map((q) => q.x);
  const ys = p.points.map((q) => q.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (v: number) => pad.l + (x1 === x0 ? 0.5 : (v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (v: number) => H - pad.b - (y1 === y0 ? 0.5 : (v - y0) / (y1 - y0)) * (H - pad.t - pad.b);
  /* The dimension's recorded direction, in words, so a reader knows which way is favourable on each axis. */
  const dirWord = (dir: string) => (dir === "lower" ? "lower is favourable" : "higher is favourable");

  return (
    <CompareSection
      id="tradeoff-chart"
      title="Tradeoffs"
      lead={`${xd.label} against ${yd.label}. Outlined points are options no other option beats on both at once. That is a tradeoff, not a ranking: which point suits you depends on which axis matters more.`}
    >
      <figure className="hidden sm:block">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[640px] text-foreground" role="img" aria-label={`Scatter of ${xd.label} against ${yd.label}`}>
          <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} className="stroke-current opacity-30" />
          <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} className="stroke-current opacity-30" />
          <text x={pad.l} y={H - 14} className="fill-current text-[11px] opacity-70">{`${xd.label} (${dirWord(xd.direction)})`}</text>
          <text x={12} y={pad.t - 6} className="fill-current text-[11px] opacity-70">{`${yd.label} (${dirWord(yd.direction)})`}</text>
          <text x={pad.l} y={H - pad.b + 16} className="fill-current text-[10px] opacity-60">{formatShort(xd, x0)}</text>
          <text x={W - pad.r} y={H - pad.b + 16} textAnchor="end" className="fill-current text-[10px] opacity-60">{formatShort(xd, x1)}</text>
          <text x={pad.l - 6} y={H - pad.b} textAnchor="end" className="fill-current text-[10px] opacity-60">{formatShort(yd, y0)}</text>
          <text x={pad.l - 6} y={pad.t + 8} textAnchor="end" className="fill-current text-[10px] opacity-60">{formatShort(yd, y1)}</text>
          {p.points.map((q) => (
            <g key={q.entityId}>
              <circle cx={sx(q.x)} cy={sy(q.y)} r={6} className={cn("stroke-current", q.dominated ? "fill-transparent opacity-50" : "fill-transparent")} strokeWidth={q.dominated ? 1.25 : 2.5} />
              {/* Labels in the right half sit left of their point, so none is clipped at the edge. */}
              <text
                x={sx(q.x) > W / 2 ? sx(q.x) - 10 : sx(q.x) + 10}
                y={sy(q.y) + 4}
                textAnchor={sx(q.x) > W / 2 ? "end" : "start"}
                className="fill-current text-[11px]"
              >
                {nameOf(result, q.entityId)}
              </text>
            </g>
          ))}
        </svg>
      </figure>
      <table className="mt-4 w-full max-w-[640px] text-left text-[14px]">
        <caption className="sr-only">{`${xd.label} and ${yd.label} for each option`}</caption>
        <thead>
          <tr className="border-b border-border text-[12px] text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">Option</th>
            <th scope="col" className="py-2 pr-3 font-medium">{xd.label}</th>
            <th scope="col" className="py-2 pr-3 font-medium">{yd.label}</th>
            <th scope="col" className="py-2 font-medium">Beaten on both by another</th>
          </tr>
        </thead>
        <tbody>
          {p.points.map((q) => (
            <tr key={q.entityId} className="border-b border-border">
              <th scope="row" className="py-2 pr-3 font-normal">{nameOf(result, q.entityId)}</th>
              <td className="py-2 pr-3 tabular-nums">{formatShort(xd, q.x)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatShort(yd, q.y)}</td>
              <td className="py-2">{q.dominated ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.missing.length > 0 ? (
        <p className="mt-3 text-[13px] text-muted">
          Left out, no data for this pair: {list(p.missing.map((id) => nameOf(result, id)))}.
        </p>
      ) : null}
    </CompareSection>
  );
}

/* ---------------------------------------------------------------------------
   Admin debug
   --------------------------------------------------------------------------- */

export function CompareDebugPanel({ debug }: { debug: CompareDebug }) {
  return (
    <section aria-label="compare_v1 debug" className="mt-8 rounded-2xl border border-dashed border-border p-4 text-[12px]">
      <p className="font-mono text-[13px] font-semibold">
        {debug.algorithm} · {debug.strategy} · cache {debug.cache} · load {debug.timings.load} ms · pipeline {debug.timings.pipeline} ms
      </p>
      <p className="mt-1 font-mono text-muted">
        set {debug.setKey} · evidence {debug.evidenceCount} ({Object.entries(debug.evidenceBySource).map(([k, v]) => `${k} ${v}`).join(", ")})
        {debug.unavailable.length > 0 ? ` · unavailable ${debug.unavailable.join(", ")}` : ""}
      </p>
      {debug.goal ? (
        <p className="mt-2 font-mono">
          goal {debug.goal.key}: {debug.goal.requirements.map((r) => `${r.dimension}(${r.importance},${r.group})`).join(" ")}
        </p>
      ) : (
        <p className="mt-2 font-mono text-muted">no goal, no weights: fit not computed</p>
      )}
      {debug.issues.length > 0 ? (
        <ul className="mt-2 space-y-0.5 font-mono">
          {debug.issues.map((i, k) => (
            <li key={k}>
              [{i.visibility}] {i.code}: {i.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Dimensions">
        <table className="w-full font-mono">
          <thead>
            <tr className="text-left text-muted">
              <th className="pr-2">#</th>
              <th className="pr-2">dimension</th>
              <th className="pr-2">kind</th>
              <th className="pr-2">dir</th>
              <th className="pr-2">cov</th>
              {debug.entities.map((e) => (
                <th key={e.id} className="pr-2">
                  {e.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {debug.dimensions.map((d) => (
              <tr key={d.id} className="border-t border-border align-top">
                <td className="pr-2">{d.rank}</td>
                <td className="pr-2">{d.id}</td>
                <td className="pr-2">{d.kind}</td>
                <td className="pr-2">{d.direction}</td>
                <td className="pr-2">{d.coverage}</td>
                {d.cells.map((c, k) => (
                  <td key={k} className="pr-2" title={c.evidence?.join(" ")}>
                    {c.state === "known" ? `${c.display}${c.freshness && c.freshness !== "fresh" ? ` (${c.freshness})` : ""}` : c.state}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
