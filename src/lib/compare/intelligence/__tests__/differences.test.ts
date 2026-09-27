import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paretoFront } from "../pareto";
import { evaluation, fact, model, run, tool } from "./fixtures";

describe("compare_v1 differences", () => {
  it("absolute and percentage difference, worded by rule", () => {
    const r = run([model("a", { contextWindow: 200_000 }), model("b", { contextWindow: 128_000 })]);
    const d = r.pairwise.find((p) => p.dimension === "context_window")!;
    assert.equal(d.delta, 72_000);
    assert.equal(Math.round(d.deltaPercent!), 56);
    assert.match(d.interpretation, /a is 72K tokens higher/);
  });

  it("equal values say so", () => {
    const r = run([model("a", { contextWindow: 128_000 }), model("b", { contextWindow: 128_000 })]);
    assert.match(r.pairwise.find((p) => p.dimension === "context_window")!.interpretation, /record the same/);
  });

  it("non numeric: flags and text", () => {
    const a = tool("a", { facts: [fact("web_search", { flag: true }), fact("trains_on_user_data", { text: "No" })] });
    const b = tool("b", { facts: [fact("web_search", { flag: false }), fact("trains_on_user_data", { text: "Opt out" })] });
    const r = run([a, b]);
    assert.match(r.pairwise.find((p) => p.dimension === "fact:web_search")!.interpretation, /recorded yes for a, recorded no for b/);
    assert.match(r.pairwise.find((p) => p.dimension === "fact:trains_on_user_data")!.interpretation, /a No; b Opt out/);
  });

  it("missing data is never a difference", () => {
    const r = run([model("a", { contextWindow: 200_000 }), model("b")]);
    assert.equal(r.pairwise.find((p) => p.dimension === "context_window"), undefined);
    const s = r.stats.find((x) => x.dimension === "context_window")!;
    assert.equal(s.known, 1);
    assert.equal(s.leader, undefined, "fewer than two known values leads nothing");
  });

  it("multi entity stats: min, max, median, range, coverage", () => {
    const r = run([model("a", { prices: { input: 3 } }), model("b", { prices: { input: 1 } }), model("c", { prices: { input: 2 } }), model("d")]);
    const s = r.stats.find((x) => x.dimension === "price_input")!;
    assert.deepEqual([s.min, s.max, s.median, s.range, s.known, s.total], [1, 3, 2, 2, 3, 4]);
    assert.equal(s.leader!.label, "Lowest listed input price");
  });

  it("no leader on a dimension with no direction", () => {
    const r = run([model("a", { provider: "X" }), model("b", { provider: "Y" })]);
    assert.equal(r.stats.find((x) => x.dimension === "model.provider")!.leader, undefined);
  });
});

describe("compare_v1 tradeoffs (Pareto)", () => {
  it("finds the non dominated options over price and a benchmark", () => {
    const mk = (n: string, price: number, score: number) => model(n, { prices: { output: price }, evaluations: [evaluation("Bench X", score)] });
    const r = run([mk("cheap", 1, 60), mk("strong", 10, 90), mk("worse", 12, 80), mk("mid", 5, 75)]);
    assert.ok(r.pareto);
    const dominated = r.pareto!.points.filter((p) => p.dominated).map((p) => r.matrix.entities.find((e) => e.id === p.entityId)!.name);
    assert.deepEqual(dominated, ["worse"]);
  });

  it("leaves out entities missing either value and needs three points", () => {
    const r = run([model("a", { prices: { input: 1 }, contextWindow: 100 }), model("b", { prices: { input: 2 } }), model("c", { contextWindow: 5 })]);
    assert.equal(paretoFront(r.matrix, "price_input", "context_window"), null);
    const r2 = run([
      model("a", { prices: { input: 1 }, contextWindow: 100_000 }),
      model("b", { prices: { input: 2 }, contextWindow: 200_000 }),
      model("c", { prices: { input: 3 }, contextWindow: 150_000 }),
      model("d"),
    ]);
    const p = paretoFront(r2.matrix, "price_input", "context_window")!;
    assert.equal(p.missing.length, 1);
    assert.deepEqual(p.points.filter((x) => x.dominated).length, 1);
  });
});
