/*
  Shared arithmetic for the three analytics boards (post insights, developer,
  admin). Pure functions, no React, so the insight rules can be tested and the
  server and client components agree on every number.

  Every number here is derived from counted rows. Nothing is smoothed, estimated
  or projected (D13): a period with no earlier data says so instead of
  pretending a rise from zero is a percentage.
*/

export type DayPoint = { day: string; value: number };

export type Delta = {
  /* Fractional change, 0.42 for up 42%. Null when there is no baseline. */
  change: number | null;
  dir: "up" | "down" | "flat";
  /* Short, for a chip: "42%", "No earlier data". */
  text: string;
};

/* Within this band a change reads as level rather than as a movement. */
const FLAT_BAND = 0.02;
const SMALL_BASE = 5;

export function delta(now: number, before: number): Delta {
  if (before === 0) {
    return now === 0
      ? { change: 0, dir: "flat", text: "No change" }
      : { change: null, dir: "flat", text: "No earlier data" };
  }
  const change = (now - before) / before;
  if (Math.abs(change) < FLAT_BAND) return { change, dir: "flat", text: "Level" };
  /* From a tiny base a percentage overstates: 1 to 8 is "700%". Below
     SMALL_BASE the chip gives the plain difference instead. */
  if (before < SMALL_BASE) {
    const diff = now - before;
    return { change, dir: diff > 0 ? "up" : "down", text: `${diff > 0 ? "+" : "−"}${compact(Math.abs(diff))}` };
  }
  const pct = Math.abs(change) * 100;
  return {
    change,
    dir: change > 0 ? "up" : "down",
    text: `${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`,
  };
}

/* YYYY-MM-DD in UTC, the basis every SQL rollup here groups on. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/*
  One point per day for the last `days` days ending today (UTC), zeros filled
  in. A rollup only returns days that had rows, and drawn as given, three active
  days in a month look like steady daily activity.
*/
export function densifyDays(points: DayPoint[], days: number, today = new Date()): DayPoint[] {
  const byDay = new Map<string, number>();
  for (const p of points) {
    const k = p.day.slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + Number(p.value || 0));
  }
  const end = new Date(today);
  end.setUTCHours(0, 0, 0, 0);
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const k = dayKey(d);
    out.push({ day: k, value: byDay.get(k) ?? 0 });
  }
  return out;
}

/*
  A series fetched over twice the window, split into this period and the one
  before it, aligned day for day so the chart can draw them on one x axis.
*/
export function splitPeriods(
  points: DayPoint[],
  days: number,
  today = new Date(),
): { current: DayPoint[]; previous: DayPoint[] } {
  const dense = densifyDays(points, days * 2, today);
  return { previous: dense.slice(0, days), current: dense.slice(days) };
}

export function total(points: DayPoint[]): number {
  return points.reduce((s, p) => s + p.value, 0);
}

export function average(points: DayPoint[]): number {
  return points.length === 0 ? 0 : total(points) / points.length;
}

/* Axis ticks at 1, 2 or 5 times a power of ten, so the scale reads as numbers
   a person would choose. Always starts at zero and steps by at least 1:
   these are counts, and half a post is not a tick. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = Math.max(1, (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag);
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.0001; v += step) ticks.push(round(v));
  if (ticks[ticks.length - 1]! < max) ticks.push(round(ticks[ticks.length - 1]! + step));
  return ticks;
}

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

/*
  A cumulative count sampled at irregular moments, read off at regular steps
  (each step takes the highest snapshot at or before its end), so a chart's x
  axis is even time rather than even snapshots.
*/
export function resampleCumulative(
  start: string,
  snapshots: { at: string; value: number }[],
  stepMs: number,
  now = new Date(),
): DayPoint[] {
  const t0 = new Date(start).getTime();
  const end = now.getTime();
  const sorted = [...snapshots].sort((a, b) => a.at.localeCompare(b.at));
  const out: DayPoint[] = [];
  let k = 0;
  let high = 0;
  for (let t = t0; ; t += stepMs) {
    const edge = Math.min(t, end);
    while (k < sorted.length && new Date(sorted[k]!.at).getTime() <= edge) {
      high = Math.max(high, sorted[k]!.value);
      k += 1;
    }
    out.push({ day: new Date(edge).toISOString(), value: high });
    if (edge >= end) break;
  }
  return out;
}

export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs < 10_000_000 ? 1 : 0)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1000)}K`;
  if (abs >= 1_000) return `${(n / 1000).toFixed(1)}K`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function percent(fraction: number): string {
  const p = fraction * 100;
  if (p === 0) return "0%";
  if (p < 1) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

export function dayLabel(iso: string, withWeekday = false): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    timeZone: iso.length === 10 ? "UTC" : undefined,
    weekday: withWeekday ? "short" : undefined,
    day: "numeric",
    month: "short",
  });
}
