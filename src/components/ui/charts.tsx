import { cn } from "@/lib/utils";

/*
  Moved out of components/admin on 2026-09-18, unchanged. Nothing in here was
  ever admin specific: they are presentational, they take numbers and render
  them, and the developer analytics board needs the same three forms. One set
  of charts, so the two dashboards cannot drift apart.

  Three chart forms, which is all either dashboard's data actually needs.

  The form is chosen from the job the numbers do, not from what looks varied:

    TimeSeries   change over time. One measure per chart, one bar per day.
    RankedBars   magnitude with identity. Ordered rows, label and value in text.

  There is no third form and no library. Every series here is a single measure,
  or a measure with a failure share, so a categorical palette never arises: the
  bars are the lime accent the brand already has, and the only second colour is
  the reserved danger red used for exactly what it means, something failing.
  That sidesteps the usual chart colour problem rather than solving it.

  Built from CSS boxes rather than SVG. A bar chart is a row of rectangles with
  heights, which CSS does natively and responsively; an SVG needs a viewBox, and
  a viewBox that scales to fit 390px and 1440px scales the axis labels with it.
  Flex boxes keep the type at its real size at every width.

  A value is never colour alone. Every bar carries its number in the title
  attribute, the ranked rows print theirs in text beside the bar, and the axis
  states its own maximum. The chart and its table are the same object.
*/

function niceMax(values: number[]): number {
  const max = Math.max(0, ...values);
  if (max === 0) return 1;
  // Round up to 1, 2 or 5 times a power of ten, so the axis reads as a number a
  // person would have chosen rather than 8,317.
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const scaled = max / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

function shortNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return String(Math.round(n));
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export type SeriesPoint = {
  day: string;
  value: number;
  /* The share of `value` that failed. Drawn as a red cap on the same bar rather
     than as a second series, because it is a part of the whole and a second bar
     beside it would imply the two add up to something. */
  failed?: number;
};

/*
  One bar per day in the window, including the empty ones.

  The daily rollups group over rows that exist, so a thirty day window with
  three active days comes back as three points. Rendered as they arrive, those
  three become three bars stretched across the whole chart, which reads as
  activity every day at a steady level: the exact opposite of what happened.

  So the window is filled in here. A day with nothing becomes a zero, which the
  chart draws as a hairline on the baseline rather than as nothing at all, and
  the gaps become visible as gaps.

  Dates are compared as YYYY-MM-DD in UTC, which is the same basis the SQL
  groups on, so a point never lands a day either side of where it belongs.
*/
function densify(points: SeriesPoint[], days: number): SeriesPoint[] {
  const byDay = new Map(points.map((p) => [p.day.slice(0, 10), p]));
  const out: SeriesPoint[] = [];

  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(byDay.get(key) ?? { day: key, value: 0, failed: 0 });
  }
  return out;
}

export function TimeSeries({
  points: given,
  label,
  failedLabel = "Failed",
  unit,
  /* The window the data was asked for. Given, the chart shows every day in it
     rather than only the days something happened. */
  windowDays,
  className,
}: {
  points: SeriesPoint[];
  label: string;
  failedLabel?: string;
  unit?: string;
  windowDays?: number;
  className?: string;
}) {
  const points = windowDays ? densify(given, windowDays) : given;

  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted">
        Nothing recorded in this window.
      </div>
    );
  }

  const max = niceMax(points.map((p) => p.value));
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const anyFailed = points.some((p) => (p.failed ?? 0) > 0);

  return (
    <figure className={cn("rounded-xl border border-border p-4", className)}>
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="tnum text-[12px] text-muted">
          {total.toLocaleString("en-GB")}
          {unit ? ` ${unit}` : ""} over {points.length} days
        </span>
      </figcaption>

      <div className="flex gap-2">
        {/* The axis states its own maximum rather than leaving the reader to
            infer scale from bar heights. Two ticks, not five: this is a shape,
            and a gridded plot at this size is more furniture than information. */}
        <div
          aria-hidden
          className="tnum flex w-9 shrink-0 flex-col justify-between py-0.5 text-right text-[10px] leading-none text-muted"
        >
          <span>{shortNumber(max)}</span>
          <span>0</span>
        </div>

        <div className="min-w-0 flex-1">
          <ul className="flex h-[132px] items-end gap-[2px]">
            {points.map((p) => {
              const height = max === 0 ? 0 : (p.value / max) * 100;
              const failed = p.failed ?? 0;
              const failedShare = p.value === 0 ? 0 : (failed / p.value) * 100;

              return (
                <li
                  key={p.day}
                  className="flex h-full min-w-0 flex-1 items-end"
                  title={`${dayLabel(p.day)}: ${p.value.toLocaleString("en-GB")}${
                    unit ? ` ${unit}` : ""
                  }${failed > 0 ? `, ${failed.toLocaleString("en-GB")} failed` : ""}`}
                >
                  {/*
                    A day with nothing in it is a 1px rule on the baseline, not a
                    zero height bar that vanishes. An empty day and a missing day
                    look different, which at launch is most of this chart.
                  */}
                  {p.value === 0 ? (
                    <span className="block h-px w-full bg-border" />
                  ) : (
                    <span
                      className="flex w-full flex-col justify-end overflow-hidden rounded-[2px] bg-accent"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    >
                      {failedShare > 0 ? (
                        <span
                          className="block w-full bg-danger"
                          style={{ height: `${Math.max(failedShare, 6)}%` }}
                        />
                      ) : null}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-[10px] text-muted">
            <span>{dayLabel(points[0]!.day)}</span>
            <span>{dayLabel(points[points.length - 1]!.day)}</span>
          </div>
        </div>
      </div>

      {/* A legend only where there are two things to tell apart. One series is
          named by the caption above it. */}
      {anyFailed ? (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-accent" aria-hidden />
            {label}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-danger" aria-hidden />
            {failedLabel}
          </span>
        </div>
      ) : null}
    </figure>
  );
}

export type RankedRow = {
  label: string;
  value: number;
  /* A second number shown in text beside the first. Never a second bar: two
     bars of different measures in one row is a dual axis wearing a disguise. */
  secondary?: string;
  href?: string;
  tone?: "accent" | "danger";
};

export function RankedBars({
  rows,
  valueLabel,
  emptyMessage = "Nothing recorded in this window.",
  max: explicitMax,
  className,
}: {
  rows: RankedRow[];
  valueLabel: string;
  emptyMessage?: string;
  max?: number;
  className?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-[13px] text-muted">
        {emptyMessage}
      </div>
    );
  }

  const max = explicitMax ?? Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className={cn("rounded-xl border border-border", className)}>
      <ul>
        {rows.map((row, i) => {
          const width = (row.value / max) * 100;
          return (
            <li
              key={`${row.label}-${i}`}
              className="border-b border-border px-4 py-2.5 last:border-b-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[13px]" title={row.label}>
                  {row.href ? (
                    <a href={row.href} className="hover:underline">
                      {row.label}
                    </a>
                  ) : (
                    row.label
                  )}
                </span>
                <span className="tnum shrink-0 text-[13px] font-medium">
                  {row.value.toLocaleString("en-GB")}
                  {row.secondary ? (
                    <span className="ml-2 font-normal text-muted">{row.secondary}</span>
                  ) : null}
                </span>
              </div>
              {/* The bar is the secondary encoding here. The number above it is
                  the primary one, which is why this reads correctly in
                  greyscale, in forced colours, and to a screen reader. */}
              <div
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface"
                role="img"
                aria-label={`${row.value.toLocaleString("en-GB")} ${valueLabel}`}
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    row.tone === "danger" ? "bg-danger" : "bg-accent",
                  )}
                  style={{ width: `${Math.max(width, 1.5)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/*
  A share bar: one row broken into named parts.

  Used for things like plan mix, where the parts are a whole and the question is
  proportion rather than magnitude. Every segment is labelled underneath, so the
  fill is never the only thing carrying the identity.
*/
export function ShareBar({
  parts,
  className,
}: {
  parts: { label: string; value: number }[];
  className?: string;
}) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (total === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
        Nothing to divide yet.
      </div>
    );
  }

  /* Opacity steps of one accent rather than several hues. The parts are ordered
     and related, so a single hue light to dark is the right encoding, and it
     keeps the palette at one colour. */
  const shades = ["bg-accent", "bg-accent/70", "bg-accent/45", "bg-accent/25"];

  return (
    <div className={cn("rounded-xl border border-border p-4", className)}>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {parts.map((p, i) => (
          <div
            key={p.label}
            className={cn("h-full first:rounded-l-full last:rounded-r-full", shades[i % shades.length])}
            style={{ width: `${(p.value / total) * 100}%` }}
            title={`${p.label}: ${p.value.toLocaleString("en-GB")}`}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px]">
        {parts.map((p, i) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <span
              className={cn("size-2.5 shrink-0 rounded-[2px]", shades[i % shades.length])}
              aria-hidden
            />
            <span className="text-muted">{p.label}</span>
            <span className="tnum font-medium">{p.value.toLocaleString("en-GB")}</span>
            <span className="tnum text-muted">
              {Math.round((p.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
