import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cell, fact, plan, run, tool } from "./fixtures";

describe("compare_v1 tool comparison", () => {
  it("reads capabilities as recorded, and unrecorded stays not_recorded, never false", () => {
    const a = tool("alpha", { facts: [fact("web_search", { flag: true })] });
    const b = tool("beta", { facts: [fact("web_search", { flag: false })] });
    const c = tool("gamma");
    const r = run([a, b, c]);
    assert.equal(cell(r, "fact:web_search", "alpha").state, "known");
    const vb = cell(r, "fact:web_search", "beta");
    assert.ok(vb.state === "known" && vb.value === false);
    assert.equal(cell(r, "fact:web_search", "gamma").state, "not_recorded");
  });

  it("counts recorded integrations and never counts an unrecorded one", () => {
    const a = tool("alpha", { facts: [fact("integration_github", { flag: true }), fact("integration_slack", { flag: true }), fact("integration_other", { text: "Linear" })] });
    const b = tool("beta", { facts: [fact("integration_github", { flag: true })] });
    const c = tool("gamma");
    const r = run([a, b, c]);
    const va = cell(r, "tool.integrations_count", "alpha");
    assert.ok(va.state === "known" && va.value === 3);
    assert.equal(cell(r, "tool.integrations_count", "gamma").state, "not_recorded");
    const leader = r.stats.find((s) => s.dimension === "tool.integrations_count")!.leader!;
    assert.equal(leader.label, "Most integrations recorded");
    assert.deepEqual(leader.entityIds, [a.id]);
  });

  it("compares plans tier by tier and never sums them", () => {
    const a = tool("alpha", { plans: [plan("free", 0), plan("individual", 20), plan("individual", 15), plan("team", 30, { perSeat: true })] });
    const b = tool("beta", { plans: [plan("individual", 25)] });
    const r = run([a, b]);
    const ind = cell(r, "plan:individual", "alpha");
    assert.ok(ind.state === "known" && ind.value === 15);
    assert.equal(cell(r, "plan:team", "beta").state, "not_recorded");
    const free = cell(r, "plan:free", "alpha");
    assert.ok(free.state === "known" && free.value === true);
    assert.equal(cell(r, "plan:free", "beta").state, "not_recorded", "no free plan row is not a recorded no");
    const d = r.pairwise.find((p) => p.dimension === "plan:individual")!;
    assert.equal(d.delta, -10);
  });

  it("shows a yearly only plan as written and keeps it out of numeric comparison", () => {
    const a = tool("alpha", { plans: [plan("individual", 120, { period: "year" })] });
    const b = tool("beta", { plans: [plan("individual", 12)] });
    const r = run([a, b]);
    const v = cell(r, "plan:individual", "alpha");
    assert.ok(v.state === "known" && typeof v.value === "string" && v.value.includes("per year"));
    assert.equal(r.pairwise.find((p) => p.dimension === "plan:individual")?.delta, undefined);
  });

  it("records privacy claims only where a fact exists", () => {
    const a = tool("alpha", { facts: [fact("trains_on_user_data", { text: "Not by default" })] });
    const b = tool("beta");
    const r = run([a, b]);
    assert.equal(cell(r, "fact:trains_on_user_data", "beta").state, "not_recorded");
    const v = cell(r, "fact:trains_on_user_data", "alpha");
    assert.ok(v.state === "known" && v.display === "Not by default");
  });

  it("says Not listed for a platform the listing omits, and not_recorded when nothing is listed", () => {
    const a = tool("alpha", { platforms: ["Web", "mac"] });
    const b = tool("beta", { platforms: [] });
    const r = run([a, b]);
    const win = cell(r, "platform:Windows", "alpha");
    assert.ok(win.state === "known" && win.display === "Not listed");
    const mac = cell(r, "platform:macOS", "alpha");
    assert.ok(mac.state === "known" && mac.value === true);
    assert.equal(cell(r, "platform:Web", "beta").state, "not_recorded");
  });

  it("keeps community ratings apart, with no leader and no direction", () => {
    const a = tool("alpha", { rating: 4.8, ratingCount: 2 });
    const b = tool("beta", { rating: 3.1, ratingCount: 40 });
    const r = run([a, b], { goal: "coding" });
    assert.equal(r.stats.find((s) => s.dimension === "tool.rating")!.leader, undefined);
    for (const f of r.fit!) assert.ok(![...f.strengths, ...f.tradeoffs].some((x) => x.dimension === "tool.rating"));
    assert.equal(r.evidence[`reviews:${a.id}`].sourceType, "community");
  });

  it("marks model dimensions not applicable to tools", () => {
    const r = run([tool("alpha"), tool("beta")]);
    assert.ok(!r.matrix.dimensions.some((d) => d.id === "context_window"));
  });
});
