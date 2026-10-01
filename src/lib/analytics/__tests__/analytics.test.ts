import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { delta, densifyDays, niceTicks, resampleCumulative, splitPeriods, total } from "../series";
import { concentrationInsight, rank, rateInsight, trendInsights } from "../insights";

const TODAY = new Date("2026-10-01T12:00:00Z");
const days = (values: number[], endDay = "2026-10-01") => {
  const end = new Date(`${endDay}T00:00:00Z`);
  return values.map((value, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (values.length - 1 - i));
    return { day: d.toISOString().slice(0, 10), value };
  });
};

describe("series", () => {
  it("never turns a rise from zero into a percentage", () => {
    assert.deepEqual(delta(12, 0), { change: null, dir: "flat", text: "No earlier data" });
    assert.equal(delta(0, 0).text, "No change");
  });

  it("states real changes and calls tiny ones level", () => {
    assert.equal(delta(142, 100).text, "42%");
    assert.equal(delta(142, 100).dir, "up");
    assert.equal(delta(95, 100).text, "5.0%");
    assert.equal(delta(101, 100).dir, "flat");
  });

  it("gives a plain difference from a tiny base", () => {
    assert.equal(delta(8, 1).text, "+7");
    assert.equal(delta(1, 3).text, "−2");
    assert.equal(delta(8, 1).dir, "up");
  });

  it("fills empty days with zeros, ending today", () => {
    const dense = densifyDays([{ day: "2026-09-29", value: 3 }], 4, TODAY);
    assert.deepEqual(dense.map((p) => p.value), [0, 3, 0, 0]);
    assert.equal(dense[3]!.day, "2026-10-01");
  });

  it("splits a doubled window into aligned periods", () => {
    const { current, previous } = splitPeriods(days([1, 2, 3, 4, 5, 6]), 3, TODAY);
    assert.deepEqual(previous.map((p) => p.value), [1, 2, 3]);
    assert.deepEqual(current.map((p) => p.value), [4, 5, 6]);
  });

  it("picks round axis ticks that cover the max", () => {
    assert.deepEqual(niceTicks(87), [0, 20, 40, 60, 80, 100]);
    assert.deepEqual(niceTicks(0), [0, 1]);
    assert.ok(niceTicks(3).at(-1)! >= 3);
    assert.deepEqual(niceTicks(2), [0, 1, 2]);
  });

  it("reads a cumulative count at even steps", () => {
    const pts = resampleCumulative(
      "2026-09-28T00:00:00Z",
      [
        { at: "2026-09-28T10:00:00Z", value: 2 },
        { at: "2026-09-28T20:00:00Z", value: 5 },
        { at: "2026-09-30T08:00:00Z", value: 4 },
      ],
      86_400_000,
      new Date("2026-09-30T12:00:00Z"),
    );
    assert.deepEqual(pts.map((p) => p.value), [0, 5, 5, 5]);
  });
});

describe("insights", () => {
  it("reports a real rise with both counts", () => {
    const out = trendInsights({
      noun: "views",
      current: days([10, 20, 30]),
      previous: days([10, 10, 10], "2026-09-28"),
      periodLabel: "3 days",
    });
    const up = out.find((i) => i.kind === "up");
    assert.ok(up);
    assert.equal(up.title, "Views up 100% on the previous 3 days");
    assert.equal(up.detail, "60 against 30.");
  });

  it("says a series started rather than inventing a percentage", () => {
    const out = trendInsights({
      noun: "views",
      current: days([0, 4, 2]),
      previous: days([0, 0, 0]),
      periodLabel: "3 days",
    });
    assert.equal(out[0]!.kind, "first");
    assert.ok(!out.some((i) => i.title.includes("%")));
  });

  it("stays quiet about tiny counts and small moves", () => {
    const small = trendInsights({
      noun: "posts",
      current: days([1, 1, 0]),
      previous: days([1, 0, 0]),
      periodLabel: "3 days",
    });
    assert.ok(!small.some((i) => i.kind === "up" || i.kind === "down"));
    const level = trendInsights({
      noun: "posts",
      current: days([50, 50, 51]),
      previous: days([50, 50, 50]),
      periodLabel: "3 days",
    });
    assert.ok(!level.some((i) => i.kind === "up"));
  });

  it("names an empty period as empty", () => {
    const out = trendInsights({ noun: "likes", current: days([0, 0, 0]), periodLabel: "3 days" });
    assert.equal(out.length, 1);
    assert.equal(out[0]!.title, "No likes in the last 3 days");
  });

  it("only names a leading source when one clearly leads", () => {
    const lead = concentrationInsight({
      rows: [
        { label: "For you", value: 63 },
        { label: "Search", value: 20 },
        { label: "Explore", value: 17 },
      ],
      noun: "views",
      verb: "brought",
    });
    assert.equal(lead[0]!.title, "For you brought 63% of views");
    const even = concentrationInsight({
      rows: [
        { label: "A", value: 34 },
        { label: "B", value: 33 },
        { label: "C", value: 33 },
      ],
      noun: "views",
      verb: "brought",
    });
    assert.equal(even.length, 0);
  });

  it("compares a rate with its baseline, and needs a denominator", () => {
    const out = rateInsight({
      numerator: 6,
      denominator: 100,
      sentence: (r) => `${r} of views ended in a save`,
      before: 0.02,
      beforeLabel: "your usual",
    });
    assert.equal(out[0]!.title, "6% of views ended in a save");
    assert.equal(out[0]!.detail, "3.0 times your usual (2%).");
    assert.equal(
      rateInsight({ numerator: 1, denominator: 3, sentence: (r) => r, beforeLabel: "x" }).length,
      0,
    );
    assert.equal(
      rateInsight({ numerator: 0, denominator: 50, sentence: (r) => r, beforeLabel: "x" }).length,
      0,
    );
  });

  it("ranks strongest first and caps the list", () => {
    const ranked = rank(
      [
        { kind: "peak", title: "a", weight: 50 },
        { kind: "up", title: "b", weight: 95 },
        { kind: "rate", title: "c", weight: 40 },
      ],
      2,
    );
    assert.deepEqual(ranked.map((i) => i.title), ["b", "a"]);
    assert.equal(total([]), 0);
  });
});
