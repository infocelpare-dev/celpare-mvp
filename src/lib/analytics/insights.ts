import { dayLabel, delta, percent, total, type DayPoint } from "./series";

/*
  Plain language findings for the analytics boards, the way Google Analytics
  surfaces "Users up 20%" above its charts. Founder, 2026-10-01: professional
  insight, not only characters and numbers.

  THE RULES ARE DELIBERATELY NARROW. Each one states a fact that the counted
  rows support and nothing more: a change against the previous period of the
  same length, the best day, where most of something came from, a rate. No
  forecasts, no "you should", no rise from zero dressed as a percentage (D13).
  A rule that has too little to go on returns nothing rather than a weak claim.
*/

export type InsightKind = "up" | "down" | "peak" | "source" | "rate" | "quiet" | "first";

export type Insight = {
  kind: InsightKind;
  title: string;
  detail?: string;
  /* Higher shows first. */
  weight: number;
};

/* Below this a percentage change is noise worth not mentioning. */
const MIN_CHANGE = 0.1;
/* And below this many events either side, so is any percentage. */
const MIN_COUNT = 5;

/*
  The movement of one measure against the period before it, and its best day.
  `noun` is the plural the sentence uses, "views", "posts".
*/
export function trendInsights({
  noun,
  current,
  previous,
  periodLabel,
}: {
  noun: string;
  current: DayPoint[];
  previous?: DayPoint[];
  /* "7 days", used as "the previous 7 days". */
  periodLabel: string;
}): Insight[] {
  const out: Insight[] = [];
  const now = total(current);
  const before = previous ? total(previous) : null;

  if (now === 0) {
    out.push({
      kind: "quiet",
      title: `No ${noun} in the last ${periodLabel}`,
      detail:
        before && before > 0
          ? `The ${periodLabel} before had ${before.toLocaleString("en-GB")}.`
          : undefined,
      weight: 60,
    });
    return out;
  }

  if (before !== null) {
    if (before === 0) {
      out.push({
        kind: "first",
        title: `First ${noun} in this period`,
        detail: `${now.toLocaleString("en-GB")} in the last ${periodLabel}, none in the ${periodLabel} before, so there is no percentage to give yet.`,
        weight: 70,
      });
    } else if (Math.max(now, before) >= MIN_COUNT) {
      const d = delta(now, before);
      if (d.change !== null && Math.abs(d.change) >= MIN_CHANGE) {
        out.push({
          kind: d.dir === "up" ? "up" : "down",
          title:
            before < MIN_COUNT
              ? `${cap(noun)}: ${now}, ${d.dir === "up" ? "up" : "down"} from ${before} in the previous ${periodLabel}`
              : `${cap(noun)} ${d.dir === "up" ? "up" : "down"} ${d.text} on the previous ${periodLabel}`,
          detail:
            before < MIN_COUNT
              ? "Small numbers, so no percentage."
              : `${now.toLocaleString("en-GB")} against ${before.toLocaleString("en-GB")}.`,
          weight: 90 + Math.min(9, Math.abs(d.change) * 10),
        });
      }
    }
  }

  /* A best day is only a finding when there are days to choose between and the
     best one stands out from the rest. */
  const active = current.filter((p) => p.value > 0);
  if (current.length >= 3 && active.length >= 2) {
    const best = current.reduce((a, b) => (b.value > a.value ? b : a));
    const share = best.value / now;
    if (share >= 0.25) {
      out.push({
        kind: "peak",
        title: `Best day was ${dayLabel(best.day, true)}`,
        detail: `${best.value.toLocaleString("en-GB")} ${noun}, ${percent(share)} of the period.`,
        weight: 50,
      });
    }
  }

  return out;
}

/*
  Where most of something came from: a surface, a tool, a topic. Only said when
  one part clearly leads.
*/
export function concentrationInsight({
  rows,
  noun,
  verb,
}: {
  rows: { label: string; value: number }[];
  noun: string;
  /* "brought", "drew". */
  verb: string;
}): Insight[] {
  const sum = rows.reduce((s, r) => s + r.value, 0);
  if (rows.length < 2 || sum < MIN_COUNT) return [];
  const top = rows.reduce((a, b) => (b.value > a.value ? b : a));
  const share = top.value / sum;
  if (share < 0.4) return [];
  const others = rows.filter((r) => r !== top && r.value > 0).length;
  return [
    {
      kind: "source",
      title: `${top.label} ${verb} ${percent(share)} of ${noun}`,
      detail:
        others > 0
          ? `The rest came from ${others} other ${others === 1 ? "source" : "sources"}.`
          : undefined,
      weight: 70,
    },
  ];
}

/*
  A rate with its comparison, "3.1% of views ended in a save". `before` is the
  same rate over the previous period, or a usual level.
*/
export function rateInsight({
  numerator,
  denominator,
  sentence,
  before,
  beforeLabel,
}: {
  numerator: number;
  denominator: number;
  /* Given the formatted rate, returns the title. */
  sentence: (rate: string) => string;
  before?: number | null;
  /* "the previous 7 days", "your usual". */
  beforeLabel: string;
}): Insight[] {
  /* A zero rate is said by the caller in its own words ("none of the 34
     views..."), never as "0% of". */
  if (denominator < MIN_COUNT || numerator === 0) return [];
  const rate = numerator / denominator;
  let detail: string | undefined;
  let weight = 40;
  if (before != null && before > 0) {
    const ratio = rate / before;
    if (ratio >= 1.25) {
      detail = `${ratio.toFixed(1)} times ${beforeLabel} (${percent(before)}).`;
      weight = 80;
    } else if (ratio <= 0.8) {
      detail = `Below ${beforeLabel} of ${percent(before)}.`;
      weight = 75;
    } else {
      detail = `In line with ${beforeLabel} of ${percent(before)}.`;
    }
  }
  return [{ kind: "rate", title: sentence(percent(rate)), detail, weight }];
}

/* The strongest few, strongest first. */
export function rank(insights: Insight[], limit = 4): Insight[] {
  return [...insights].sort((a, b) => b.weight - a.weight).slice(0, limit);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
