import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIndex } from "../catalogue";
import { explainReason } from "../reasons";
import { ground } from "../ml";
import { STRATEGIES, type Strategy } from "../types";
import { bySlug, NOW, run, snapshotIndex, snapshotInputs } from "./helpers";

const index = snapshotIndex();
const cursor = bySlug(index, "tool", "cursor");
const runway = bySlug(index, "tool", "runway");

describe("guardrails (D179, D173)", () => {
  it("no item carries a universal score, a winner or a best flag", () => {
    for (const strategy of STRATEGIES) {
      const r = run({ strategy: strategy as Strategy, seeds: [cursor.ref], entityTypes: ["tool", "model"], limit: 6, query: "coding" });
      for (const it of r.items) {
        for (const banned of ["score", "total", "winner", "best", "overall", "value"]) assert.ok(!(banned in it), `${strategy} item has ${banned}`);
      }
      assert.ok(!("winner" in r));
    }
  });

  it("the engine only ever returns tools and models", () => {
    for (const strategy of STRATEGIES) {
      const r = run({ strategy: strategy as Strategy, seeds: [runway.ref], entityTypes: ["tool", "model"], limit: 12 });
      for (const it of r.items) assert.ok(it.ref.type === "tool" || it.ref.type === "model");
    }
  });

  it("every item has a reason backed by a signal, or none at all", () => {
    const r = run({ strategy: "similar", seeds: [cursor.ref], limit: 8 });
    for (const it of r.items) {
      if (!it.reason) continue;
      const text = explainReason(it.reason);
      assert.ok(text.length > 0);
      if (it.reason.code === "similar_capabilities") assert.ok(it.reason.labels.length >= 2);
      if (it.reason.code === "often_compared_with") assert.ok((it.reason.count ?? 0) >= 3);
    }
  });

  it("social proof is a count, never a person (D155)", () => {
    const withNetwork = buildIndex({
      entities: snapshotInputs().map((e) => (e.slug === "kling" ? { ...e, networkSavers: 3 } : e)),
      generation: "net",
      now: NOW,
    });
    const r = run({ strategy: "personalized", surface: "explore", limit: 24 }, { index: withNetwork });
    for (const it of r.items) {
      if (it.reason?.code !== "network_saved") continue;
      assert.equal(it.reason.labels.length, 0);
      assert.match(explainReason(it.reason), /^Saved by \d+ people you follow$/);
    }
  });

  it("co-occurrence from one person is never evidence (k floor)", () => {
    const one = buildIndex({
      entities: snapshotInputs(),
      cooccurrence: [{ a: cursor.key, b: runway.key, people: 1, source: "co_compared" }],
      generation: "co1",
      now: NOW,
    });
    assert.equal(one.cooccurrence(cursor.key, runway.key), null);
    const three = buildIndex({
      entities: snapshotInputs(),
      cooccurrence: [{ a: cursor.key, b: bySlug(index, "tool", "windsurf").key, people: 3, source: "co_compared" }],
      generation: "co3",
      now: NOW,
    });
    const r = run({ strategy: "similar", seeds: [cursor.ref], limit: 6 }, { index: three });
    const w = r.items.find((i) => i.key === bySlug(index, "tool", "windsurf").key)!;
    assert.equal(w.reason?.code, "often_compared_with");
    assert.equal(w.reason?.count, 3);
  });

  it("grounding drops anything that is not a catalogue entry (GenerativeCandidateProvider)", () => {
    const refs = ground([{ name: "Cursor" }, { name: "Totally Real AI 9000" }, { name: "windsurf" }, { name: "framelift" }], index);
    assert.deepEqual(refs.map((r) => index.entities.get(`${r.type}:${r.id}`)!.slug), ["cursor", "windsurf"]);
  });

  it("an unknown seed says so instead of recommending something", () => {
    const r = run({ strategy: "similar", seeds: [{ type: "tool", id: "00000000-0000-4000-8000-00000000dead" }] });
    assert.equal(r.items.length, 0);
    assert.ok(r.note);
  });

  it("results are deterministic: the same request gives the same list", () => {
    const a = run({ strategy: "similar", seeds: [cursor.ref] }).items.map((i) => i.key);
    const b = run({ strategy: "similar", seeds: [cursor.ref] }).items.map((i) => i.key);
    assert.deepEqual(a, b);
  });
});
