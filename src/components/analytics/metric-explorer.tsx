"use client";

import { useState } from "react";
import { compact, delta, type DayPoint } from "@/lib/analytics/series";
import { cn } from "@/lib/utils";
import { KpiBody } from "./kpi";
import { TrendChart } from "./trend-chart";

/*
  The Google Analytics overview card: a row of metric tabs, each with its total
  and change, and one chart below for whichever tab is selected. Choosing a tab
  swaps the chart rather than stacking seven small charts nobody compares.

  A real tablist: arrow keys move between tabs, the chart is the tabpanel.
*/

export type ExplorerMetric = {
  key: string;
  label: string;
  /* Plural, for the chart readout: "posts". */
  noun: string;
  current: DayPoint[];
  previous?: DayPoint[];
  /* How the headline is computed from the days. Sum for counts, average for a
     daily level such as active people. */
  aggregate?: "sum" | "avg";
  goodWhen?: "up" | "down";
};

export function MetricExplorer({
  metrics,
  currentLabel,
  previousLabel,
  className,
}: {
  metrics: ExplorerMetric[];
  /* "Last 30 days", "Previous 30 days". */
  currentLabel: string;
  previousLabel: string;
  className?: string;
}) {
  const [selected, setSelected] = useState(metrics[0]?.key);
  const metric = metrics.find((m) => m.key === selected) ?? metrics[0];
  if (!metric) return null;

  const agg = (pts: DayPoint[] | undefined, how: ExplorerMetric["aggregate"]) => {
    if (!pts || pts.length === 0) return 0;
    const sum = pts.reduce((s, p) => s + p.value, 0);
    return how === "avg" ? sum / pts.length : sum;
  };

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-elevated", className)}>
      <div
        role="tablist"
        aria-label="Metric"
        /* One row, GA style. Wider than the card, it scrolls sideways rather
           than wrapping into a ragged second row. */
        className="flex overflow-x-auto border-b border-border [scrollbar-width:thin]"
      >
        {metrics.map((m, i) => {
          const now = agg(m.current, m.aggregate);
          const before = m.previous ? agg(m.previous, m.aggregate) : null;
          const on = m.key === metric.key;
          return (
            <button
              key={m.key}
              id={`tab-${m.key}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="metric-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setSelected(m.key)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = metrics[(i + (e.key === "ArrowRight" ? 1 : metrics.length - 1)) % metrics.length]!;
                setSelected(next.key);
                document.getElementById(`tab-${next.key}`)?.focus();
              }}
              className={cn(
                "relative min-w-[136px] flex-1 basis-0 cursor-pointer border-border px-4 pb-3.5 pt-4 text-left transition-colors duration-200 ease-out",
                "[&:not(:last-child)]:border-e",
                on ? "bg-elevated" : "bg-surface/50 hover:bg-surface",
              )}
            >
              {/* The selected tab's top rule, GA style. */}
              <span
                aria-hidden
                className={cn("absolute inset-x-0 top-0 h-[3px]", on ? "bg-foreground" : "bg-transparent")}
              />
              <KpiBody
                label={m.label}
                value={m.aggregate === "avg" ? now.toFixed(now < 10 ? 1 : 0) : compact(now)}
                delta={before !== null ? delta(now, before) : undefined}
                goodWhen={m.goodWhen}
                stacked
                against={previousLabel.toLowerCase()}
              />
            </button>
          );
        })}
      </div>

      <div id="metric-panel" role="tabpanel" aria-labelledby={`tab-${metric.key}`} className="p-4 sm:p-5">
        <TrendChart
          key={metric.key}
          current={metric.current}
          previous={metric.previous}
          noun={metric.noun}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
        />
      </div>
    </div>
  );
}
