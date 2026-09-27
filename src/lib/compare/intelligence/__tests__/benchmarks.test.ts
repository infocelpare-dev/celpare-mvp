import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cell, daysAgo, evaluation, model, run } from "./fixtures";

describe("compare_v1 benchmarks", () => {
  it("keeps provenance on the value: version, harness, dataset, reporter", () => {
    const a = model("a", { evaluations: [evaluation("Bench X", 84.2, { reporterRelation: "competitor" })] });
    const b = model("b", { evaluations: [evaluation("Bench X", 79.8)] });
    const r = run([a, b]);
    const v = cell(r, "bench:bench-x:resolved", "a");
    assert.ok(v.state === "known");
    assert.deepEqual(v.method, { modelVersion: "v1", harness: "standard", datasetVersion: "1", reporter: "competitor" });
    const ev = r.evidence[v.evidence[0]];
    assert.equal(ev.sourceType, "benchmark");
  });

  it("collapses identical duplicates into one value with every source", () => {
    const a = model("a", { evaluations: [evaluation("Bench X", 84.2), evaluation("Bench X", 84.2, { evaluator: "Other" })] });
    const r = run([a, model("b")]);
    const v = cell(r, "bench:bench-x:resolved", "a");
    assert.ok(v.state === "known" && v.evidence.length === 2);
    assert.ok(r.issues.some((i) => i.code === "duplicate_benchmark" && i.visibility === "debug"));
  });

  it("shows conflicting results as a conflict, never picking one", () => {
    const a = model("a", { evaluations: [evaluation("Bench X", 84.2), evaluation("Bench X", 81.0, { evaluator: "Other" })] });
    const r = run([a, model("b")]);
    const v = cell(r, "bench:bench-x:resolved", "a");
    assert.equal(v.state, "conflict");
    assert.ok(r.issues.some((i) => i.code === "conflicting_values" && i.visibility === "public"));
    assert.ok(r.summary.some((l) => l.text.includes("Sources report different")));
  });

  it("uses the newest model version and names the older one", () => {
    const a = model("a", {
      evaluations: [evaluation("Bench X", 70, { modelVersion: "v1", evaluatedAt: "2026-01-01" }), evaluation("Bench X", 80, { modelVersion: "v2", evaluatedAt: "2026-09-01" })],
    });
    const r = run([a, model("b")]);
    const v = cell(r, "bench:bench-x:resolved", "a");
    assert.ok(v.state === "known" && v.value === 80 && v.note?.includes("v1"));
  });

  it("marks old results stale and still shows them", () => {
    const a = model("a", { evaluations: [evaluation("Bench X", 70, { evaluatedAt: daysAgo(500).slice(0, 10) })] });
    const r = run([a, model("b")]);
    const v = cell(r, "bench:bench-x:resolved", "a");
    assert.ok(v.state === "known" && v.freshness === "stale");
  });

  it("a model with no result is not ranked below one that has a result", () => {
    const a = model("a", { evaluations: [evaluation("Bench X", 50)] });
    const b = model("b");
    const r = run([a, b], { goal: "coding" });
    const s = r.stats.find((x) => x.dimension === "bench:bench-x:resolved")!;
    assert.equal(s.leader, undefined, "one known value leads nothing");
    const fb = r.fit!.find((f) => f.entityId === b.id)!;
    assert.ok(!fb.tradeoffs.some((t) => t.dimension === "bench:bench-x:resolved"));
    assert.ok(fb.missingEvidence.includes("bench:bench-x:resolved"));
  });

  it("flags results produced differently as not like for like", () => {
    const a = model("a", { evaluations: [evaluation("Bench X", 84, { harness: "agent-a" })] });
    const b = model("b", { evaluations: [evaluation("Bench X", 80, { harness: "agent-b" })] });
    const r = run([a, b]);
    const d = r.pairwise.find((p) => p.dimension === "bench:bench-x:resolved")!;
    assert.match(d.caveat!, /Not like for like: different harnesses/);
  });

  it("never combines unrelated benchmarks into one number", () => {
    const a = model("a", { evaluations: [evaluation("Bench X", 84), evaluation("Bench Y", 20, { domain: "math" })] });
    const r = run([a, model("b")]);
    assert.ok(!r.matrix.dimensions.some((d) => /overall|aggregate|average/i.test(d.id + d.label)));
  });
});
