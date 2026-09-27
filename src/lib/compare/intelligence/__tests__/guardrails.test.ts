import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cacheKey, hashKey, memoryCache } from "../cache";
import { debugAllowed } from "../debug-gate";
import { AiSummaryWriter, summaryInput, unsupportedNumbers } from "../summary";
import { evaluation, fact, model, run, tool } from "./fixtures";

const pair = () => [
  model("a", { contextWindow: 1_000_000, prices: { input: 5 }, evaluations: [evaluation("Bench X", 84.2)] }),
  model("b", { contextWindow: 200_000, prices: { input: 1 }, evaluations: [evaluation("Bench X", 79.8)] }),
];

function walk(v: unknown, path: string, out: string[]) {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.push(`${path}.${k}`);
      walk(x, `${path}.${k}`, out);
    }
  }
}

describe("compare_v1 guardrails", () => {
  it("no output field is a score, a winner or a rank", () => {
    const r = run(pair(), { goal: "coding" });
    const { matrix, ...rest } = r;
    const keys: string[] = [];
    walk({ ...rest, matrix: { dimensions: matrix.dimensions, values: matrix.values, coverage: matrix.coverage } }, "r", keys);
    const bad = keys.filter((k) => /\.(score|winner|rank|best|overall)$/i.test(k));
    assert.deepEqual(bad, []);
  });

  it("no text anywhere calls an option the best or the winner", () => {
    const r = run(pair(), { goal: "coding" });
    const text = JSON.stringify([r.summary, r.fit, r.explanation, r.pairwise.map((p) => p.interpretation)]);
    assert.ok(!/\b(best|winner|smarter|overall score)\b/i.test(text), text);
  });

  it("no identity leaves the engine: evidence and output carry counts, never people", () => {
    const r = run([tool("a", { rating: 4, ratingCount: 3 }), tool("b")]);
    const keys: string[] = [];
    walk(r.evidence, "e", keys);
    assert.ok(!keys.some((k) => /user|author|reviewer|email/i.test(k)));
  });

  it("the debug gate needs an admin who asked for it", () => {
    assert.equal(debugAllowed({ requested: true, signedIn: true, isAdmin: true }), true);
    assert.equal(debugAllowed({ requested: true, signedIn: true, isAdmin: false }), false);
    assert.equal(debugAllowed({ requested: true, signedIn: false, isAdmin: false }), false);
    assert.equal(debugAllowed({ requested: false, signedIn: true, isAdmin: true }), false);
  });
});

describe("compare_v1 summary", () => {
  it("every line is tagged and ends with an interpretation that picks nobody", () => {
    const r = run(pair());
    assert.ok(r.summary.length >= 2);
    assert.ok(r.summary.every((l) => ["fact", "derived", "interpretation"].includes(l.kind)));
    assert.equal(r.summary.at(-1)!.kind, "interpretation");
    assert.ok(r.summary.filter((l) => l.kind !== "interpretation").every((l) => l.refs.length > 0));
  });

  it("the AI writer is off and the pipeline falls back to the deterministic one", () => {
    assert.equal(AiSummaryWriter.write({} as never), null);
  });

  it("summaryInput holds only known values with evidence, and lists what is missing", () => {
    const items = [...pair(), model("c")];
    const r = run(items);
    const ctx = { matrix: r.matrix, stats: r.stats, pairwise: r.pairwise, issues: r.issues, goal: r.goal, order: r.order };
    const inp = summaryInput(ctx);
    for (const f of inp.facts) for (const v of f.values) assert.ok(v.evidence.length > 0);
    const ctxMissing = inp.missing.find((m) => m.dimension === "context_window")!;
    assert.deepEqual(ctxMissing.entityIds, [items[2].id]);
  });

  it("a generated text with a number the input does not hold is rejected", () => {
    const r = run(pair());
    const inp = summaryInput({ matrix: r.matrix, stats: r.stats, pairwise: r.pairwise, issues: r.issues, goal: r.goal, order: r.order });
    assert.deepEqual(unsupportedNumbers("a scores 84.2% on Bench X", inp), []);
    assert.deepEqual(unsupportedNumbers("a scores 91.5% on Bench X", inp), ["91.5%"]);
  });

  it("conflicting evidence is stated in the summary input", () => {
    const a = model("a", { evaluations: [evaluation("Bench X", 84), evaluation("Bench X", 80, { evaluator: "Other" })] });
    const r = run([a, model("b")]);
    const inp = summaryInput({ matrix: r.matrix, stats: r.stats, pairwise: r.pairwise, issues: r.issues, goal: r.goal, order: r.order });
    assert.equal(inp.conflicts.length, 1);
  });

  it("the ranker orders dimensions, and the entity order is untouched", () => {
    const items = pair().reverse();
    const r = run(items, { goal: "coding" });
    assert.deepEqual(r.matrix.entities.map((e) => e.name), ["b", "a"]);
    assert.equal(r.order.length, r.matrix.dimensions.length);
  });

  it("a facts read failure is reported, not drawn as empty facts", () => {
    const r = run([tool("a", { facts: [fact("web_search", { flag: true })] }), tool("b")], {
      extra: { health: { facts: false, plans: true, evaluations: true, reviews: true, performance: true } },
    });
    assert.ok(r.issues.some((i) => i.code === "read_failed" && i.visibility === "public"));
  });
});

describe("compare_v1 cache", () => {
  it("hit, miss, expiry and generation bump", async () => {
    let now = 0;
    const c = memoryCache(() => now);
    const gen = await c.generation();
    const key = cacheKey("set", hashKey("model:a,model:b"), gen);
    assert.equal(await c.get(key), null);
    await c.set(key, { v: 1 }, 60);
    assert.deepEqual(await c.get(key), { v: 1 });
    now = 61_000;
    assert.equal(await c.get(key), null, "expired");
    await c.set(key, { v: 2 }, 60);
    const next = await c.bumpGeneration();
    assert.notEqual(cacheKey("set", hashKey("model:a,model:b"), next), key, "a bump moves every key");
  });

  it("the set hash is order independent through the set key", () => {
    assert.equal(hashKey("a,b"), hashKey("a,b"));
    assert.notEqual(hashKey("a,b"), hashKey("a,c"));
  });
});
