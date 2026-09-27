import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCENARIO_LABEL } from "../pricing";
import { cell, fact, model, plan, run, tool } from "./fixtures";

describe("compare_v1 mixed sets", () => {
  it("keeps only shared dimensions and maps the shared concepts", () => {
    const t = tool("cursor", { facts: [fact("code_generation", { flag: true }), fact("deploy_api", { flag: false })] });
    const m = model("opus", { facts: [fact("coding", { flag: true }), fact("deploy_api", { flag: true })] });
    const r = run([t, m]);
    assert.equal(r.request.strategy, "mixed");
    const ids = r.matrix.dimensions.map((d) => d.id);
    assert.ok(ids.includes("concept:coding"));
    assert.ok(ids.includes("fact:deploy_api"));
    assert.ok(!ids.some((id) => id.startsWith("price_") || id.startsWith("plan:")), "a plan and a token price never share a table");
    assert.ok(!ids.includes("fact:web_search"), "a tool only attribute is not a shared dimension");
    const vt = cell(r, "concept:coding", "cursor");
    const vm = cell(r, "concept:coding", "opus");
    assert.ok(vt.state === "known" && vt.value === true && vm.state === "known" && vm.value === true);
  });

  it("draws no tradeoff chart across types", () => {
    const r = run([tool("a", { plans: [plan("individual", 20)] }), model("b", { prices: { input: 1 } }), model("c", { prices: { input: 2 } })]);
    assert.equal(r.pareto, null);
  });
});

describe("compare_v1 pricing", () => {
  it("computes a scenario cost only from explicit assumptions and labels it an estimate", () => {
    const a = model("a", { prices: { input: 2.5, output: 12 } });
    const b = model("b", { prices: { input: 0.8, output: null } });
    const r = run([a, b], { scenario: { inputTokens: 1_000_000, outputTokens: 250_000 } });
    assert.equal(r.scenario!.label, SCENARIO_LABEL);
    const ca = r.scenario!.costs.find((c) => c.entityId === a.id)!;
    assert.equal(ca.cost, 5.5);
    const cb = r.scenario!.costs.find((c) => c.entityId === b.id)!;
    assert.equal(cb.cost, null, "a missing price is never free");
    assert.deepEqual(cb.missing, ["output"]);
  });

  it("has no scenario without assumptions", () => {
    assert.equal(run([model("a", { prices: { input: 1 } }), model("b")]).scenario, null);
  });

  it("does not compare prices in different currencies", () => {
    const a = tool("a", { plans: [plan("individual", 20, { currency: "EUR" })] });
    const b = tool("b", { plans: [plan("individual", 20)] });
    const r = run([a, b]);
    const d = r.pairwise.find((p) => p.dimension === "plan:individual")!;
    assert.equal(d.delta, undefined);
    assert.match(d.interpretation, /Different currencies/);
    assert.equal(r.stats.find((s) => s.dimension === "plan:individual")!.leader, undefined);
  });

  it("marks a price older than 90 days stale and keeps showing it", () => {
    const a = model("a", { prices: { input: 1, provenance: { label: "x", url: "https://openrouter.ai/a", verifiedAt: "2026-01-01T00:00:00Z" } } });
    const r = run([a, model("b", { prices: { input: 2 } })]);
    const v = cell(r, "price_input", "a");
    assert.ok(v.state === "known" && v.freshness === "stale");
    assert.equal(r.evidence[`price:${a.id}`].confidence, "low");
  });
});
