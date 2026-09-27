import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cell, daysAgo, evaluation, model, perf, run } from "./fixtures";

describe("compare_v1 model comparison", () => {
  it("compares context and names the largest, with ties named", () => {
    const a = model("a", { contextWindow: 1_000_000 });
    const b = model("b", { contextWindow: 200_000 });
    const c = model("c", { contextWindow: 1_000_000 });
    const r = run([a, b, c]);
    const s = r.stats.find((x) => x.dimension === "context_window")!;
    assert.equal(s.leader!.label, "Largest context window");
    assert.deepEqual(s.leader!.entityIds.sort(), [a.id, c.id].sort());
    assert.equal(s.min, 200_000);
    assert.equal(s.median, 1_000_000);
  });

  it("names values within 0.5% of the leader as a tie (1,048,576 and 1,050,000 both read 1.05M)", () => {
    const a = model("a", { contextWindow: 1_050_000 });
    const b = model("b", { contextWindow: 1_048_576 });
    const c = model("c", { contextWindow: 200_000 });
    const r = run([a, b, c]);
    assert.deepEqual(r.stats.find((x) => x.dimension === "context_window")!.leader!.entityIds.sort(), [a.id, b.id].sort());
  });

  it("a shared top value is named as the same, never compared with itself", () => {
    const r = run([model("a", { maxOutputTokens: 128_000 }), model("b", { maxOutputTokens: 128_000 }), model("c", { maxOutputTokens: 64_000 })], { weights: { context: 5 } });
    const s = r.fit![0].strengths.find((x) => x.dimension === "max_output")!;
    assert.match(s.reason, /128K vs 64K \(c\); the same as b\./);
  });

  it("a close value is called close with its number, never the same (53.3% is not 54.4%)", () => {
    const mk = (n: string, s: number) => model(n, { evaluations: [evaluation("Bench X", s)] });
    const r = run([mk("a", 54.4), mk("b", 53.3), mk("c", 40)], { goal: "coding" });
    const fb = r.fit!.find((f) => f.entityId === r.matrix.entities[1].id)!;
    const s = fb.strengths.find((x) => x.dimension === "bench:bench-x:resolved")!;
    assert.match(s.reason, /within 5% of 54\.4% \(a\)/);
    assert.ok(!s.reason.includes("the same as"));
  });

  it("keeps six prices apart and never merges them", () => {
    const a = model("a", { prices: { input: 2.5, output: 12, cachedInput: 0.25 } });
    const b = model("b", { prices: { input: 0.8, output: 4 } });
    const r = run([a, b]);
    const ids = r.matrix.dimensions.filter((d) => d.section === "pricing").map((d) => d.id);
    assert.deepEqual(ids, ["price_input", "price_cached_input", "price_cache_write", "price_output", "price_batch_input", "price_batch_output"]);
    assert.equal(cell(r, "price_cached_input", "b").state, "not_recorded");
    const d = r.pairwise.find((p) => p.dimension === "price_input")!;
    assert.equal(Number(d.delta!.toFixed(2)), 1.7);
    assert.match(d.interpretation, /\$1\.70 higher/);
  });

  it("reads modalities as lists and states the set difference", () => {
    const a = model("a", { modalities: ["text", "image"] });
    const b = model("b", { modalities: ["text", "audio"] });
    const r = run([a, b]);
    const d = r.pairwise.find((p) => p.dimension === "modalities_in")!;
    assert.match(d.interpretation, /only a lists image/);
    assert.match(d.interpretation, /only b lists audio/);
  });

  it("performance is not_measured when nobody measured it, and never estimated", () => {
    const r = run([model("a"), model("b")]);
    assert.equal(cell(r, "perf:ttft_ms", "a").state, "not_measured");
    assert.ok(r.summary.some((l) => l.text.includes("No performance measurements")));
  });

  it("performance uses the latest measurement and says so", () => {
    const a = model("a");
    const b = model("b");
    const rows = [perf("a", "ttft_ms", 300, { measuredAt: daysAgo(40) }), perf("a", "ttft_ms", 200), perf("b", "ttft_ms", 500)];
    const r = run([a, b], { extra: { performance: rows } });
    const v = cell(r, "perf:ttft_ms", "a");
    assert.ok(v.state === "known" && v.value === 200 && v.note?.includes("1 other measurement"));
    assert.equal(r.stats.find((s) => s.dimension === "perf:ttft_ms")!.leader!.entityIds[0], a.id);
  });

  it("flags invalid context as an issue and does not show it", () => {
    const r = run([model("a", { contextWindow: -5 }), model("b", { contextWindow: 128_000 })]);
    assert.equal(cell(r, "context_window", "a").state, "not_recorded");
    assert.ok(r.issues.some((i) => i.code === "invalid_context"));
  });

  it("refuses a negative price and flags an implausible one", () => {
    const r = run([model("a", { prices: { input: -1 } }), model("b", { prices: { input: 5000 } })]);
    assert.equal(cell(r, "price_input", "a").state, "not_recorded");
    assert.ok(r.issues.some((i) => i.code === "negative_price"));
    assert.ok(r.issues.some((i) => i.code === "implausible_price"));
    assert.equal(cell(r, "price_input", "b").state, "known");
  });

  it("builds one dimension per benchmark and metric", () => {
    const a = model("a", { evaluations: [evaluation("Bench X", 84.2), evaluation("Bench Y", 60, { metric: "pass@1", domain: "reasoning" })] });
    const b = model("b", { evaluations: [evaluation("Bench X", 79.8)] });
    const r = run([a, b]);
    const bench = r.matrix.dimensions.filter((d) => d.kind === "benchmark").map((d) => d.id);
    assert.deepEqual(bench.sort(), ["bench:bench-x:resolved", "bench:bench-y:pass-1"]);
    assert.equal(cell(r, "bench:bench-y:pass-1", "b").state, "not_recorded");
  });
});
