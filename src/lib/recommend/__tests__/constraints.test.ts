import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateConstraint, parseConstraints, resolveMentions } from "../constraints";
import { bySlug, run, slugs, snapshotIndex } from "./helpers";

const index = snapshotIndex();
const kinds = (q: string) => parseConstraints(q, index).constraints.map((c) => `${c.kind}=${c.value}`);

describe("constraint parsing (D182)", () => {
  it("reads budget, platform, openness, context and capability", () => {
    const k = kinds("an open source tool under $15 that runs on Linux");
    assert.ok(k.includes("budget_max=15"));
    assert.ok(k.includes("platform=linux"));
    assert.ok(k.includes("open=open_source"));
    assert.ok(k.includes("entity_type=tool"));
    assert.ok(kinds("a model with 1M token context").includes("min_context=1000000"));
    assert.ok(kinds("models with function calling").includes("capability=tool_calling"));
  });

  it('"tool calling" asks about models, not tools', () => {
    const p = parseConstraints("which model is best for agents with tool calling", index);
    assert.deepEqual(p.entityTypes, ["model"]);
  });

  it("resolves named products to catalogue entries, longest name first", () => {
    const m = resolveMentions("is Claude Code better than Cursor?", index).map((e) => e.slug);
    assert.deepEqual(m, ["claude-code", "cursor"]);
  });

  it("a product we do not carry is reported, never guessed", () => {
    const p = parseConstraints("something cheaper than Zorblax Pro for coding", index);
    assert.ok(p.unresolved.some((u) => u.includes("zorblax")));
    assert.ok(!p.constraints.some((c) => c.kind === "cheaper_than"));
  });
});

describe("constraint evaluation", () => {
  it("unknown is never a violation: a tool with no plan price is kept", () => {
    const q = parseConstraints("a video tool under $10 a month", index);
    const budget = q.constraints.find((c) => c.kind === "budget_max")!;
    const pika = bySlug(index, "tool", "pika");
    const status = evaluateConstraint(pika, budget, index).status;
    assert.notEqual(status, "violated");
  });

  it("a recorded no is a violation: a closed model fails open weights", () => {
    const c = { kind: "open" as const, value: "open_weights", hard: true, phrase: "open weights" };
    assert.equal(evaluateConstraint(bySlug(index, "model", "deepseek-v4-1-flash"), c, index).status, "satisfied");
    const claude = bySlug(index, "model", "claude-opus-5-5");
    const expected = claude.openWeights === "not_recorded" ? "unknown" : "violated";
    assert.equal(evaluateConstraint(claude, c, index).status, expected);
  });

  it("a platform missing from a listing is not listed, not unsupported", () => {
    const c = { kind: "platform" as const, value: "linux", hard: true, phrase: "linux" };
    const r = evaluateConstraint(bySlug(index, "tool", "midjourney"), c, index);
    assert.notEqual(r.status, "violated");
  });
});

describe("fit (Ask Celpare)", () => {
  it('"cheaper than Cursor" excludes Cursor and anything not cheaper', () => {
    const q = "I need a cheap AI coding tool for TypeScript, cheaper than Cursor";
    const p = parseConstraints(q, index);
    const r = run({ strategy: "fit", surface: "ask", query: q, constraints: p.constraints, entityTypes: p.entityTypes, limit: 5 });
    const s = slugs(r);
    assert.ok(!s.includes("cursor"));
    assert.ok(s.length >= 3);
    for (const it of r.items) {
      const cheaper = it.fit!.constraints.find((c) => c.constraint.kind === "cheaper_than")!;
      assert.notEqual(cheaper.status, "violated", it.key);
    }
    assert.ok(r.rejected.some((x) => x.code === "failed_constraint"));
  });

  it("returns only catalogue entries, each with a fit report and no score", () => {
    const q = "open weights model with 1M context for long documents";
    const p = parseConstraints(q, index);
    const r = run({ strategy: "fit", surface: "ask", query: q, constraints: p.constraints, entityTypes: p.entityTypes, limit: 5 });
    assert.equal(slugs(r)[0], "deepseek-v4-1-flash");
    for (const it of r.items) {
      assert.ok(index.entities.has(it.key));
      assert.ok(it.fit);
      assert.ok(!("score" in it));
    }
    /* A model with a recorded context under 1M is ruled out by the hard constraint. */
    assert.ok(r.rejected.some((x) => x.key === bySlug(index, "model", "grok-4-7").key && x.code === "failed_constraint"));
  });
});
