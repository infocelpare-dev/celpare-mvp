import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Legend,
  Matrix,
  No,
  NotRecorded,
  ProvenanceLine,
  Yes,
  type MatrixRow,
} from "@/components/compare/matrix";
import {
  BenchmarksSection,
  CompareSection,
  Nothing,
  ReadFailed,
  SourcesSection,
  attributesIn,
  factRows,
  factsOf,
  type SectionProps,
} from "@/components/compare/sections";
import { money, tokens } from "@/lib/compare/present";
import type { ModelItem } from "@/lib/compare/types";

/*
  The Models tab, laid out the way OpenRouter's model compare is: one column per
  model with its identity at the top, an "at a glance" block with the numbers
  people actually choose on (context, output, price, modalities), and then the
  detail underneath.

  THE BARS ARE A SCALE, NOT A SCORE. Each bar is the value divided by the
  largest value in that row, so a reader sees at a glance that one model's
  context is twice another's or its output price five times as high. Nothing is
  coloured better or worse, nothing is marked cheapest or best, and the bar is
  aria-hidden: the number beside it is the fact (D115).

  Every number here came from a row with a source and a verified date, and the
  Pricing and Sources sections say which.
*/

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span className="mt-1.5 block h-1.5 w-full max-w-[140px] overflow-hidden rounded-full bg-surface" aria-hidden>
      <span className="block h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
    </span>
  );
}

function Chips({ values }: { values: string[] }) {
  if (values.length === 0) return <NotRecorded />;
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((v) => (
        <span key={v} className="rounded-full border border-border px-2 py-0.5 text-[12px] capitalize">
          {v}
        </span>
      ))}
    </span>
  );
}

function numberRow(
  key: string,
  label: React.ReactNode,
  models: ModelItem[],
  pick: (m: ModelItem) => number | null,
  format: (n: number) => string,
): MatrixRow {
  const values = models.map(pick);
  const max = Math.max(0, ...values.filter((v): v is number => v !== null));
  return {
    key,
    label,
    cells: values.map((v, i) =>
      v === null ? (
        <NotRecorded key={models[i].id} />
      ) : (
        <span key={models[i].id} className="block">
          <span className="tabular-nums">{format(v)}</span>
          <Bar value={v} max={max} />
        </span>
      ),
    ),
  };
}

const perM = (n: number) => `${money(n, "USD")} / 1M`;

/* ---------------------------------------------------------------------------
   Header: one card per model, the column heads of every table below
   --------------------------------------------------------------------------- */

function ModelHeads({ models }: { models: ModelItem[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${models.length}, minmax(200px, 1fr))` }}
      >
        {models.map((m) => (
          <li key={m.id} className="flex flex-col rounded-2xl border border-border p-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface font-display text-[15px] font-semibold"
              >
                {(m.provider ?? m.name).slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{m.name}</p>
                <p className="truncate text-[12px] text-muted">by {m.provider ?? "an unrecorded provider"}</p>
              </div>
            </div>
            {m.apiModelId ? (
              <code className="mt-3 block truncate font-mono text-[11px] text-muted">{m.apiModelId}</code>
            ) : null}
            {m.description ? (
              <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted">{m.description}</p>
            ) : null}
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-[12px]">
              {m.prices.provenance.url ? (
                <a
                  href={m.prices.provenance.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  data-compare-event="source_opened"
                  data-compare-item-type="model"
                  data-compare-item-id={m.id}
                  className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-muted"
                >
                  Listing
                  <ExternalLink className="size-3" aria-hidden />
                  <span className="sr-only">for {m.name}, opens in a new tab</span>
                </a>
              ) : null}
              {m.websiteUrl ? (
                <a
                  href={m.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  data-compare-event="model_opened_from_comparison"
                  data-compare-item-type="model"
                  data-compare-item-id={m.id}
                  className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-muted"
                >
                  Provider
                  <ExternalLink className="size-3" aria-hidden />
                  <span className="sr-only">site for {m.name}, opens in a new tab</span>
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Sections
   --------------------------------------------------------------------------- */

function Glance({ models }: { models: ModelItem[] }) {
  const rows: MatrixRow[] = [
    numberRow("context", "Context window", models, (m) => m.contextWindow, (n) => `${tokens(n)} tokens`),
    numberRow("max-output", "Max output", models, (m) => m.maxOutputTokens, (n) => `${tokens(n)} tokens`),
    numberRow("input", "Input price", models, (m) => m.prices.input, perM),
    numberRow("output", "Output price", models, (m) => m.prices.output, perM),
    {
      key: "in-mod",
      label: "Input modalities",
      cells: models.map((m) => <Chips key={m.id} values={m.modalities} />),
    },
    {
      key: "out-mod",
      label: "Output modalities",
      cells: models.map((m) => <Chips key={m.id} values={m.outputModalities} />),
    },
    {
      key: "weights",
      label: "Open weights",
      cells: models.map((m) =>
        m.openWeights === true ? <Yes key={m.id} /> : m.openWeights === false ? <No key={m.id} /> : <NotRecorded key={m.id} />,
      ),
    },
  ];

  return (
    <CompareSection
      id="glance"
      title="At a glance"
      lead="The numbers most choices come down to. Each bar is scaled to the largest value in its row, so it shows size, not quality."
    >
      <Matrix caption="Models at a glance" columns={models} rows={rows} />
    </CompareSection>
  );
}

function Pricing({ models, now }: { models: ModelItem[]; now: number }) {
  const lines: [keyof ModelItem["prices"], string][] = [
    ["input", "Input"],
    ["output", "Output"],
    ["cachedInput", "Cache read"],
    ["cacheWrite", "Cache write"],
    ["batchInput", "Batch input"],
    ["batchOutput", "Batch output"],
  ];
  const rows: MatrixRow[] = lines
    .filter(([k]) => k === "input" || k === "output" || models.some((m) => m.prices[k] !== null))
    .map(([k, label]) =>
      numberRow(
        `price-${k}`,
        <>
          {label}
          <span className="block text-[11px] font-normal text-muted">USD per 1M tokens</span>
        </>,
        models,
        (m) => m.prices[k] as number | null,
        (n) => money(n, "USD"),
      ),
    );

  if (models.some((m) => m.prices.note)) {
    rows.push({
      key: "notes",
      label: "Also priced",
      cells: models.map((m) =>
        m.prices.note ? (
          <span key={m.id} className="block text-[13px] leading-relaxed">
            {m.prices.note}
          </span>
        ) : (
          <NotRecorded key={m.id} label="Nothing else recorded" />
        ),
      ),
    });
  }

  rows.push({
    key: "checked",
    label: "Checked",
    cells: models.map((m) =>
      m.prices.provenance.url || m.prices.provenance.verifiedAt ? (
        <ProvenanceLine key={m.id} provenance={m.prices.provenance} now={now} compact />
      ) : (
        <NotRecorded key={m.id} label="Source not recorded" />
      ),
    ),
  });

  return (
    <CompareSection
      id="pricing"
      title="Pricing"
      lead="Per million tokens, in US dollars. Input, output, caching and batch are priced separately and never added together."
    >
      <Matrix caption="Model pricing" columns={models} rows={rows} />
    </CompareSection>
  );
}

function Capabilities({ models, props }: { models: ModelItem[]; props: SectionProps }) {
  const rows = [
    ...factRows(models, attributesIn(props.attributes, "capabilities", "model"), props.goal, props.now),
    ...factRows(models, attributesIn(props.attributes, "deployment", "model"), props.goal, props.now),
    ...factRows(
      models,
      attributesIn(props.attributes, "technical", "model").filter((a) => a.key !== "supported_parameters"),
      props.goal,
      props.now,
    ),
  ];
  return (
    <CompareSection id="capabilities" title="Capabilities" lead="What each model is listed as supporting, with the listing it came from.">
      {!props.health.facts ? (
        <ReadFailed what="Model capabilities" />
      ) : rows.length > 0 ? (
        <>
          <Legend />
          <Matrix className="mt-4" caption="Model capabilities" columns={models} rows={rows} />
        </>
      ) : (
        <Nothing>No capabilities have been recorded for these models yet.</Nothing>
      )}
    </CompareSection>
  );
}

/*
  The API parameters each model accepts. A parameter every selected model
  accepts is shown plainly; one only some accept is marked, because that is the
  difference a developer switching between them will actually hit.
*/
function Parameters({ models }: { models: ModelItem[] }) {
  const lists = models.map((m) => factsOf(m, "supported_parameters").map((f) => f.text ?? "").filter(Boolean));
  if (lists.every((l) => l.length === 0)) {
    return (
      <CompareSection id="parameters" title="Supported parameters">
        <Nothing>No API parameters have been recorded for these models yet.</Nothing>
      </CompareSection>
    );
  }
  const shared = lists.filter((l) => l.length > 0).reduce<string[]>(
    (acc, l, i) => (i === 0 ? l : acc.filter((p) => l.includes(p))),
    [],
  );

  return (
    <CompareSection
      id="parameters"
      title="Supported parameters"
      lead="Request parameters each model accepts through the API. Outlined ones are not accepted by every model here."
    >
      <Matrix
        caption="Supported API parameters"
        columns={models}
        rows={[
          {
            key: "params",
            label: "Parameters",
            cells: lists.map((l, i) =>
              l.length === 0 ? (
                <NotRecorded key={models[i].id} />
              ) : (
                <span key={models[i].id} className="flex max-w-[240px] flex-wrap gap-1">
                  {l.sort().map((p) => (
                    <code
                      key={p}
                      className={cn(
                        "rounded-md px-1.5 py-0.5 font-mono text-[11px]",
                        shared.includes(p) ? "bg-surface text-muted" : "border border-foreground",
                      )}
                    >
                      {p}
                    </code>
                  ))}
                </span>
              ),
            ),
          },
        ]}
      />
    </CompareSection>
  );
}

export const MODEL_SECTIONS = ["glance", "pricing", "capabilities", "parameters", "benchmarks", "sources"] as const;

export function ModelsView(props: SectionProps) {
  const models = props.items.filter((i): i is ModelItem => i.type === "model");
  return (
    <>
      <div className="pt-8">
        <ModelHeads models={models} />
      </div>
      <Glance models={models} />
      <Pricing models={models} now={props.now} />
      <Capabilities models={models} props={props} />
      <Parameters models={models} />
      <BenchmarksSection {...props} />
      <SourcesSection {...props} />
    </>
  );
}
