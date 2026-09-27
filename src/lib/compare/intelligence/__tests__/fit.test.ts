import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRESETS, resolveGoal } from "../goals";
import { evaluation, fact, model, run, tool } from "./fixtures";
import type { CompareGoal } from "../../types";

const coder = () =>
  model("coder", {
    contextWindow: 1_000_000,
    prices: { input: 5, output: 25 },
    facts: [fact("tool_calling", { flag: true }), fact("fit_coding", { text: "strong" })],
    evaluations: [evaluation("Bench X", 84)],
  });
const cheap = () =>
  model("cheap", {
    contextWindow: 200_000,
    prices: { input: 1, output: 4 },
    facts: [fact("tool_calling", { flag: false })],
    evaluations: [evaluation("Bench X", 70)],
  });

describe("compare_v1 fit", () => {
  it("no goal and no weights means no fit and no explanation", () => {
    const r = run([coder(), cheap()]);
    assert.equal(r.fit, null);
    assert.equal(r.goal, null);
    assert.equal(r.explanation, null);
  });

  it("a goal gives per item strengths and tradeoffs with reasons and evidence", () => {
    const r = run([coder(), cheap()], { goal: "coding" });
    const fc = r.fit!.find((f) => f.entityId === r.matrix.entities[0].id)!;
    const fk = r.fit!.find((f) => f.entityId === r.matrix.entities[1].id)!;
    const s = fc.strengths.map((x) => x.text);
    assert.ok(s.includes("Higher Bench X result"), s.join("|"));
    assert.ok(s.includes("Larger context window"));
    assert.ok(s.some((x) => x.startsWith("Strong fit")));
    assert.ok(fc.tradeoffs.some((x) => x.text === "Higher listed output price"));
    assert.ok(fk.strengths.some((x) => x.text === "Lower listed output price"));
    assert.ok(fk.tradeoffs.some((x) => x.text === "Tool calling: recorded no"));
    for (const x of [...fc.strengths, ...fc.tradeoffs]) {
      assert.ok(x.reason.length > 0);
      assert.ok(x.evidence.length > 0);
    }
  });

  it("orders by importance: coding evidence before price for the coding goal", () => {
    const r = run([coder(), cheap()], { goal: "coding" });
    const fc = r.fit!.find((f) => f.entityId === r.matrix.entities[0].id)!;
    assert.equal(fc.strengths[0].importance, 3);
  });

  it("weights change fit only: the matrix is identical", () => {
    const items = [coder(), cheap()];
    const plain = run(items);
    const weighted = run(items, { weights: { price: 5, quality: 0 } });
    assert.deepEqual(JSON.stringify(weighted.matrix), JSON.stringify(plain.matrix));
    assert.equal(weighted.goal!.key, "custom");
    const fk = weighted.fit!.find((f) => f.entityId === weighted.matrix.entities[1].id)!;
    assert.ok(fk.strengths.some((x) => x.text === "Lower listed input price"));
    assert.ok(!weighted.goal!.requirements.some((q) => q.dimension.startsWith("bench:")), "quality 0 removes benchmarks");
  });

  it("a weight of zero removes a preset group", () => {
    const r = run([coder(), cheap()], { goal: "coding", weights: { price: 0 } });
    assert.ok(!r.goal!.requirements.some((q) => q.dimension.startsWith("price_")));
  });

  it("a single priority reads as one, not as weighed equally", () => {
    const r = run([coder(), cheap()], { weights: { privacy: 5 } });
    assert.equal(r.explanation, "Your priorities put the weight on privacy.");
  });

  it("the explanation describes priorities and names no product", () => {
    const r = run([coder(), cheap()], { goal: "coding" });
    assert.match(r.explanation!, /put more weight on/);
    assert.ok(!r.explanation!.includes("coder") && !r.explanation!.includes("cheap"));
  });

  it("every preset resolves on a model set and a tool set without throwing", () => {
    const models = run([coder(), cheap()]);
    const tools = run([tool("a"), tool("b")]);
    for (const key of Object.keys(PRESETS) as CompareGoal[]) {
      assert.ok(resolveGoal(key, null, models.matrix));
      assert.ok(resolveGoal(key, null, tools.matrix));
    }
  });

  it("unrecorded is missing evidence, never a tradeoff", () => {
    const r = run([coder(), model("blank")], { goal: "coding" });
    const fb = r.fit!.find((f) => f.entityId === r.matrix.entities[1].id)!;
    assert.equal(fb.tradeoffs.length, 0);
    assert.ok(fb.missingEvidence.includes("context_window"));
  });

  it("values within 5% are neither strength nor tradeoff", () => {
    const r = run([model("a", { contextWindow: 1_000_000 }), model("b", { contextWindow: 980_000 })], { goal: "long_context" });
    for (const f of r.fit!) assert.ok(![...f.strengths, ...f.tradeoffs].some((x) => x.dimension === "context_window"));
  });

  it("dimensions nobody has are listed once as shared missing", () => {
    const r = run([model("a"), model("b")], { goal: "coding" });
    assert.ok(r.sharedMissing.includes("perf:ttft_ms"));
  });
});
