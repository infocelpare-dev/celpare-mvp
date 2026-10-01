"use client";

import { useEffect, useId, useRef, useState } from "react";
import { compact, dayLabel, niceTicks, type DayPoint } from "@/lib/analytics/series";
import { cn } from "@/lib/utils";

/*
  The analytics line chart, in the Google Analytics manner: this period as a
  solid line over a lime wash, the period before it as a muted dashed line on
  the same x axis, a crosshair and readout on hover.

  SVG drawn at the measured pixel width rather than a scaled viewBox, so axis
  type stays its real size at 390px and at 1440px. One measure per chart and
  one y axis, always (no dual axis). Straight segments, not a smoothed curve:
  a spline invents values between the days.

  The readout enhances, it never gates: every value is also in the table that a
  screen reader gets, and the arrow keys walk the days for a keyboard.
*/

const M = { top: 12, right: 12, bottom: 28, left: 40 };

export function TrendChart({
  current,
  previous,
  noun,
  currentLabel,
  previousLabel,
  height = 240,
  xFormat = "day",
  className,
}: {
  current: DayPoint[];
  previous?: DayPoint[];
  /* Plural measure for the readout, "views". */
  noun: string;
  currentLabel?: string;
  previousLabel?: string;
  height?: number;
  /* "time" for points closer than a day apart. */
  xFormat?: "day" | "time";
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = current.length;
  const prev = previous && previous.length === n ? previous : undefined;
  const max = Math.max(0, ...current.map((p) => p.value), ...(prev ?? []).map((p) => p.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const innerW = Math.max(0, width - M.left - M.right);
  const innerH = height - M.top - M.bottom;
  const x = (i: number) => M.left + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => M.top + innerH - (top === 0 ? 0 : (v / top) * innerH);
  const fmt = (iso: string) =>
    xFormat === "time"
      ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : dayLabel(iso, true);
  const axisFmt = (iso: string) =>
    xFormat === "time"
      ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short" })
      : dayLabel(iso);

  const line = (pts: DayPoint[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join("");
  const area = n > 1 ? `${line(current)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";

  /* About one x label per 90px, always including both ends. */
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 90))));
  const xLabels = current
    .map((p, i) => ({ i, p }))
    .filter(({ i }) => i % labelEvery === 0 || i === n - 1)
    .filter(({ i }, k, arr) => !(i !== n - 1 && k === arr.length - 2 && n - 1 - i < labelEvery * 0.6));

  function indexAt(clientX: number) {
    const rect = wrap.current!.getBoundingClientRect();
    const px = clientX - rect.left - M.left;
    if (n <= 1) return 0;
    return Math.min(n - 1, Math.max(0, Math.round((px / innerW) * (n - 1))));
  }

  const a = active !== null && active < n ? active : null;
  const empty = max === 0;

  return (
    <div className={className}>
      <div
        ref={wrap}
        className="relative outline-none"
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`${noun} chart. Use the arrow keys to read each point.`}
        aria-describedby={tableId}
        onPointerMove={(e) => width > 0 && setActive(indexAt(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const step = e.key === "ArrowRight" ? 1 : -1;
            setActive((cur) => Math.min(n - 1, Math.max(0, (cur ?? (step > 0 ? -1 : n)) + step)));
          } else if (e.key === "Escape") {
            setActive(null);
          }
        }}
      >
        {width > 0 ? (
          <svg width={width} height={height} aria-hidden className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
                <text
                  x={M.left - 8}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted text-[11px]"
                >
                  {compact(t)}
                </text>
              </g>
            ))}

            {xLabels.map(({ i, p }) => (
              <text
                key={`${p.day}-${i}`}
                x={x(i)}
                y={height - 8}
                textAnchor={n <= 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
                className="fill-muted text-[11px]"
              >
                {axisFmt(p.day)}
              </text>
            ))}

            {!empty && n > 1 ? <path d={area} fill="var(--chart-area)" /> : null}

            {prev && n > 1 ? (
              <path
                d={line(prev)}
                fill="none"
                stroke="var(--chart-prev)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                strokeLinejoin="round"
              />
            ) : null}

            {n > 1 ? (
              <path
                d={line(current)}
                fill="none"
                stroke="var(--chart-line)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : (
              <circle cx={x(0)} cy={y(current[0]?.value ?? 0)} r={4} fill="var(--chart-line)" />
            )}

            {a !== null ? (
              <g>
                <line x1={x(a)} x2={x(a)} y1={M.top} y2={M.top + innerH} stroke="var(--muted)" strokeWidth={1} />
                {prev ? (
                  <circle cx={x(a)} cy={y(prev[a]!.value)} r={3.5} fill="var(--elevated)" stroke="var(--chart-prev)" strokeWidth={1.5} />
                ) : null}
                <circle cx={x(a)} cy={y(current[a]!.value)} r={4.5} fill="var(--chart-line)" stroke="var(--elevated)" strokeWidth={2} />
              </g>
            ) : null}
          </svg>
        ) : null}

        {empty && width > 0 ? (
          <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-[13px] text-muted">
            No {noun} in this period
          </p>
        ) : null}

        {a !== null && width > 0 ? (
          <Readout
            left={x(a)}
            width={width}
            date={fmt(current[a]!.day)}
            value={current[a]!.value}
            prevDate={prev ? fmt(prev[a]!.day) : undefined}
            prevValue={prev ? prev[a]!.value : undefined}
            noun={noun}
          />
        ) : null}
      </div>

      {prev ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-muted">
          <span className="inline-flex items-center gap-2">
            <svg width="18" height="4" aria-hidden>
              <line x1="0" x2="18" y1="2" y2="2" stroke="var(--chart-line)" strokeWidth="2" />
            </svg>
            {currentLabel ?? "This period"}
          </span>
          <span className="inline-flex items-center gap-2">
            <svg width="18" height="4" aria-hidden>
              <line x1="0" x2="18" y1="2" y2="2" stroke="var(--chart-prev)" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            {previousLabel ?? "Previous period"}
          </span>
        </div>
      ) : null}

      <table id={tableId} className="sr-only">
        <caption>{noun} by {xFormat === "time" ? "time" : "day"}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">{currentLabel ?? "This period"}</th>
            {prev ? <th scope="col">{previousLabel ?? "Previous period"}</th> : null}
          </tr>
        </thead>
        <tbody>
          {current.map((p, i) => (
            <tr key={`${p.day}-${i}`}>
              <th scope="row">{fmt(p.day)}</th>
              <td>{p.value}</td>
              {prev ? <td>{prev[i]!.value}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Readout({
  left,
  width,
  date,
  value,
  prevDate,
  prevValue,
  noun,
}: {
  left: number;
  width: number;
  date: string;
  value: number;
  prevDate?: string;
  prevValue?: number;
  noun: string;
}) {
  /* Sits to the right of the crosshair, flipping left near the edge. */
  const flip = left > width - 190;
  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-xl border border-border bg-elevated px-3 py-2 text-[12px]",
      )}
      style={flip ? { right: width - left + 10 } : { left: left + 10 }}
    >
      <p className="text-muted">{date}</p>
      <p className="mt-1 flex items-center gap-2">
        <svg width="12" height="4" aria-hidden>
          <line x1="0" x2="12" y1="2" y2="2" stroke="var(--chart-line)" strokeWidth="2" />
        </svg>
        <span className="text-[15px] font-medium text-foreground">{value.toLocaleString("en-GB")}</span>
        <span className="text-muted">{noun}</span>
      </p>
      {prevValue !== undefined ? (
        <p className="mt-1 flex items-center gap-2 text-muted">
          <svg width="12" height="4" aria-hidden>
            <line x1="0" x2="12" y1="2" y2="2" stroke="var(--chart-prev)" strokeWidth="1.5" strokeDasharray="3 2" />
          </svg>
          <span className="font-medium text-foreground">{prevValue.toLocaleString("en-GB")}</span>
          <span>{prevDate}</span>
        </p>
      ) : null}
    </div>
  );
}
