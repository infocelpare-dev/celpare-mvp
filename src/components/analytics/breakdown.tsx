import { CircleAlert, Compass, Flag, Lightbulb, Medal, TrendingDown, TrendingUp, Percent } from "lucide-react";
import type { Insight } from "@/lib/analytics/insights";
import { percent } from "@/lib/analytics/series";
import { cn } from "@/lib/utils";

/*
  The presentational pieces of the analytics boards that need no state:
  a breakdown table, a funnel, a benchmark row and the insight list.
*/

/* --------------------------------------------------------------- panels */

export function Panel({
  title,
  lead,
  children,
  className,
  action,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-elevated", className)}>
      <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium tracking-[-0.01em]">{title}</h2>
          {lead ? <p className="mt-0.5 text-[13px] leading-snug text-muted">{lead}</p> : null}
        </div>
        {action}
      </header>
      <div className="px-4 pb-4 pt-3 sm:px-5">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------ breakdown */

export type BreakdownRow = {
  label: string;
  value: number;
  href?: string;
  /* A second measure, printed as its own column, never a second bar. */
  extra?: string | number;
};

/*
  Dimension, value and share, the table under every GA report. The bar is the
  secondary encoding; the number and the percentage are the primary one, so it
  reads in greyscale and to a screen reader. Past `limit` rows the rest fold
  into "Other" rather than scrolling into the long tail.
*/
export function Breakdown({
  rows,
  dimension,
  measure,
  extraLabel,
  limit = 8,
  empty = "Nothing recorded in this period.",
}: {
  rows: BreakdownRow[];
  dimension: string;
  measure: string;
  extraLabel?: string;
  limit?: number;
  empty?: string;
}) {
  const sorted = [...rows].filter((r) => r.value > 0 || r.extra).sort((a, b) => b.value - a.value);
  if (sorted.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">{empty}</p>;
  }
  const shown = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  if (rest.length > 0) {
    shown.push({ label: `Other (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0) });
  }
  const sum = sorted.reduce((s, r) => s + r.value, 0);
  const max = Math.max(1, ...shown.map((r) => r.value));

  return (
    <table className="w-full table-fixed text-[13px]">
      <thead>
        <tr className="border-b border-border text-[12px] text-muted">
          <th scope="col" className="pb-2 text-left font-normal">{dimension}</th>
          {extraLabel ? (
            <th scope="col" className="hidden w-[72px] pb-2 text-right font-normal sm:table-cell">{extraLabel}</th>
          ) : null}
          <th scope="col" className="w-[72px] pb-2 text-right font-normal">{measure}</th>
          <th scope="col" className="w-[92px] pb-2 text-right font-normal sm:w-[140px]">Share</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((r, i) => {
          const share = sum === 0 ? 0 : r.value / sum;
          return (
            <tr key={`${r.label}-${i}`} className="border-b border-border last:border-b-0">
              <th scope="row" className="truncate py-2.5 pe-3 text-left font-normal" title={r.label}>
                {r.href ? (
                  <a href={r.href} className="hover:underline">
                    {r.label}
                  </a>
                ) : (
                  r.label
                )}
              </th>
              {extraLabel ? (
                <td className="tnum hidden py-2.5 text-right text-muted sm:table-cell">{r.extra ?? "0"}</td>
              ) : null}
              <td className="tnum py-2.5 text-right font-medium">{r.value.toLocaleString("en-GB")}</td>
              <td className="py-2.5 ps-3">
                <span className="flex items-center justify-end gap-2">
                  <span aria-hidden className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-surface sm:block">
                    <span
                      className="block h-full rounded-full bg-[var(--chart-line)]"
                      style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
                    />
                  </span>
                  <span className="tnum w-10 text-right text-muted">{percent(share)}</span>
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* --------------------------------------------------------------- funnel */

/*
  Steps that each narrow the one before: views, plays, finishes. Each bar is
  drawn against the first step, and each step states its own conversion from
  the step before, which is the number a person acts on.
*/
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const first = Math.max(1, steps[0]?.value ?? 0);
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const before = i > 0 ? steps[i - 1]!.value : null;
        return (
          <li key={s.label}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span>{s.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="tnum font-medium">{s.value.toLocaleString("en-GB")}</span>
                {before !== null ? (
                  <span className="tnum w-[112px] text-right text-[12px] text-muted">
                    {before > 0 ? `${percent(s.value / before)} of previous` : "No previous step"}
                  </span>
                ) : (
                  <span className="w-[112px]" />
                )}
              </span>
            </div>
            <div aria-hidden className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-[var(--chart-line)]"
                style={{ width: `${s.value === 0 ? 0 : Math.max(1.5, (s.value / first) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------ benchmark */

/*
  This post's rate against the author's usual, on one scale: a bar for this
  post, a tick for the usual. Both printed as text beside it.
*/
export function Benchmark({
  rows,
}: {
  rows: { label: string; mine: number; usual: number; format?: (n: number) => string }[];
}) {
  return (
    <ul className="space-y-4">
      {rows.map((r) => {
        const f = r.format ?? percent;
        const scale = Math.max(r.mine, r.usual) * 1.15 || 1;
        const ratio = r.usual > 0 ? r.mine / r.usual : null;
        const verdict =
          ratio === null ? "" : ratio >= 1.1 ? "Above your usual" : ratio <= 0.9 ? "Below your usual" : "About your usual";
        return (
          <li key={r.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
              <span>{r.label}</span>
              <span className="text-muted">
                <span className="tnum font-medium text-foreground">{f(r.mine)}</span> this post,{" "}
                <span className="tnum">{f(r.usual)}</span> usually
                {verdict ? <span className="ms-2 text-foreground">{verdict}</span> : null}
              </span>
            </div>
            <div aria-hidden className="relative mt-2 h-2.5 rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-[var(--chart-line)]"
                style={{ width: `${(r.mine / scale) * 100}%` }}
              />
              <span
                className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-[var(--chart-prev)] ring-2 ring-elevated"
                style={{ left: `${(r.usual / scale) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* -------------------------------------------------------------- insights */

const ICON: Record<Insight["kind"], React.ComponentType<{ className?: string }>> = {
  up: TrendingUp,
  down: TrendingDown,
  peak: Medal,
  source: Compass,
  rate: Percent,
  quiet: CircleAlert,
  first: Flag,
};

export function InsightList({ insights, className }: { insights: Insight[]; className?: string }) {
  return (
    <section
      aria-labelledby="insights-title"
      className={cn("rounded-2xl border border-border bg-elevated px-4 py-4 sm:px-5", className)}
    >
      <h2 id="insights-title" className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em]">
        <Lightbulb className="size-4" aria-hidden />
        Insights
      </h2>
      {insights.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">
          Not enough activity yet to say anything that would hold up. Insights appear as the numbers grow.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {insights.map((ins) => {
            const Icon = ICON[ins.kind];
            return (
              <li key={ins.title} className="flex gap-3 rounded-xl bg-surface/60 p-3">
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full",
                    ins.kind === "up" && "bg-ok-surface text-ok-text",
                    ins.kind === "down" && "bg-danger-surface text-danger-text",
                    ins.kind !== "up" && ins.kind !== "down" && "bg-elevated text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium leading-snug">{ins.title}</span>
                  {ins.detail ? <span className="mt-0.5 block text-[13px] leading-snug text-muted">{ins.detail}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
