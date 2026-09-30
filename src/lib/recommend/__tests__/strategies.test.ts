import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isDuplicate, isVersion } from "../catalogue";
import { bySlug, run, slugs, snapshotIndex, userFrom } from "./helpers";

const index = snapshotIndex();
const ref = (type: "tool" | "model", slug: string) => bySlug(index, type, slug).ref;

describe("similar (tools)", () => {
  it("Cursor's similar tools are coding tools, not the most popular ones", () => {
    const r = run({ strategy: "similar", seeds: [ref("tool", "cursor")] });
    const s = slugs(r);
    assert.equal(s[0], "windsurf");
    for (const x of s) assert.ok(bySlug(index, "tool", x).attrs.category?.some((c) => c.key === "coding"), `${x} is not a coding tool`);
  });

  it("Runway's similar tools are video tools", () => {
    const s = slugs(run({ strategy: "similar", seeds: [ref("tool", "runway")] }));
    assert.ok(s.length >= 4);
    for (const x of s) assert.ok(bySlug(index, "tool", x).attrs.category?.some((c) => c.key === "video"), `${x}`);
  });

  it("never returns the seed, a fixture, or a half empty listing", () => {
    for (const seed of ["cursor", "runway", "pinecone", "zapier", "claude"]) {
      const r = run({ strategy: "similar", seeds: [ref("tool", seed)], limit: 12 });
      for (const it of r.items) {
        const e = index.entities.get(it.key)!;
        assert.notEqual(e.slug, seed);
        assert.equal(e.fixture, false, `${e.slug} is a fixture`);
        assert.ok(e.completeness >= 0.5, `${e.slug} is ${e.completeness} complete`);
      }
    }
  });

  it("a fixture can appear only when an admin asks for fixtures", () => {
    const framelift = bySlug(index, "tool", "framelift");
    const plain = run({ strategy: "similar", seeds: [ref("tool", "runway")], limit: 12 });
    assert.ok(!plain.items.some((i) => i.key === framelift.key));
    assert.ok(plain.rejected.some((x) => x.key === framelift.key && x.code === "fixture"));
  });
});

describe("alternative", () => {
  it("an alternative to a code editor is another coding tool, never a voice or search tool", () => {
    const s = slugs(run({ strategy: "alternative", seeds: [ref("tool", "cursor")] }));
    assert.ok(s.includes("windsurf"));
    for (const x of s) assert.ok(bySlug(index, "tool", x).attrs.category?.some((c) => c.key === "coding"), `${x}`);
  });

  it("a model's alternatives are never its own line (a version is not an alternative)", () => {
    const seed = bySlug(index, "model", "claude-opus-5-5");
    const r = run({ strategy: "alternative", seeds: [seed.ref], entityTypes: ["model"], surface: "model_profile" });
    for (const it of r.items) assert.equal(isVersion(seed, index.entities.get(it.key)!), null, it.key);
    assert.ok(r.rejected.some((x) => x.code === "version_of_seed"));
  });

  it("one company with two products is neither a version nor a duplicate (langchain.com)", () => {
    const langchain = bySlug(index, "tool", "langchain");
    const langsmith = bySlug(index, "tool", "langsmith");
    assert.equal(isVersion(langchain, langsmith), null);
    assert.equal(isDuplicate(langchain, langsmith), false);
  });
});

describe("similar and alternative (models)", () => {
  it("similar models share recorded capabilities and include other providers", () => {
    const r = run({ strategy: "similar", seeds: [ref("model", "claude-opus-5-5")], entityTypes: ["model"], surface: "model_profile" });
    const providers = new Set(r.items.map((i) => index.entities.get(i.key)!.provider));
    assert.ok(providers.size >= 3, [...providers].join());
    assert.ok(r.items.every((i) => i.ref.type === "model"));
  });

  it("at most two models per provider (diversity cap)", () => {
    const r = run({ strategy: "similar", seeds: [ref("model", "gpt-6-sol")], entityTypes: ["model"], limit: 8 });
    const counts = new Map<string, number>();
    for (const i of r.items) {
      const p = index.entities.get(i.key)!.provider ?? "";
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    for (const [p, n] of counts) assert.ok(n <= 2, `${p} ${n}`);
  });
});

describe("related (cross-type, D176)", () => {
  it("a model's related tools are only those whose listing names its maker or line", () => {
    const r = run({ strategy: "related", seeds: [ref("model", "claude-opus-5-5")], entityTypes: ["tool"], surface: "model_profile" });
    assert.deepEqual(slugs(r).sort(), ["claude", "claude-code"]);
    for (const it of r.items) assert.ok(it.relation, "every related item states its evidence");
  });

  it("no evidence, no relation: Cursor has no related models", () => {
    const r = run({ strategy: "related", seeds: [ref("tool", "cursor")], entityTypes: ["model"] });
    assert.equal(r.items.length, 0);
    assert.ok(r.note);
  });

  it("tools never appear in a model only request, and the reverse", () => {
    const m = run({ strategy: "similar", seeds: [ref("model", "gpt-6-sol")], entityTypes: ["model"] });
    assert.ok(m.items.every((i) => i.ref.type === "model"));
    const t = run({ strategy: "similar", seeds: [ref("tool", "claude")], entityTypes: ["tool"] });
    assert.ok(t.items.every((i) => i.ref.type === "tool"));
  });
});

describe("personalized", () => {
  it("a cold visitor still gets a varied, good list (cold start)", () => {
    const r = run({ strategy: "personalized", surface: "explore", limit: 8 });
    assert.equal(r.items.length, 8);
    const categories = new Set(r.items.map((i) => index.entities.get(i.key)!.attrs.category?.[0]?.key ?? "none"));
    assert.ok(categories.size >= 4, [...categories].join());
  });

  it("interests lead: a person who saves and opens video tools gets video tools", () => {
    const user = userFrom([
      { surface: "tool_profile", event: "open", entityType: "tool", entityId: ref("tool", "runway").id, query: null },
      { surface: "saved", event: "save", entityType: "tool", entityId: ref("tool", "kling").id, query: null },
      { surface: "tool_profile", event: "open", entityType: "tool", entityId: ref("tool", "pika").id, query: null },
    ]);
    const r = run({ strategy: "personalized", surface: "explore", limit: 6 }, { user });
    const video = r.items.filter((i) => index.entities.get(i.key)!.attrs.category?.some((c) => c.key === "video")).length;
    assert.ok(video >= 3, slugs(r).join());
  });

  it("context gates personalization (D180): a coding fan on a video page gets video tools", () => {
    const user = userFrom([
      ...["cursor", "windsurf", "cline", "replit"].map((s) => ({ surface: "saved", event: "save", entityType: "tool" as const, entityId: ref("tool", s).id, query: null })),
    ], index, 60 * 24);
    const r = run({ strategy: "personalized", surface: "tool_profile", seeds: [ref("tool", "runway")], limit: 6 }, { user });
    for (const it of r.items) {
      const e = index.entities.get(it.key)!;
      assert.ok(!e.attrs.category?.some((c) => c.key === "coding"), `${e.slug} is a coding tool on a video page`);
    }
    assert.ok(r.rejected.some((x) => x.code === "context_gate"));
  });

  it("a dismissed tool is not recommended again", () => {
    const pika = ref("tool", "pika");
    const user = userFrom([
      { surface: "tool_profile", event: "open", entityType: "tool", entityId: ref("tool", "runway").id, query: null },
      { surface: "explore", event: "not_interested", entityType: "tool", entityId: pika.id, query: null },
    ]);
    const r = run({ strategy: "personalized", surface: "explore", limit: 12 }, { user });
    assert.ok(!r.items.some((i) => i.ref.id === pika.id));
    assert.ok(r.rejected.some((x) => x.key === `tool:${pika.id}` && x.code === "dismissed"));
  });

  it("holds one exploration slot, in the middle, never the top", () => {
    const user = userFrom(["cursor", "windsurf", "cline"].map((s) => ({ surface: "saved", event: "save", entityType: "tool" as const, entityId: ref("tool", s).id, query: null })), index, 60 * 24 * 3);
    const r = run({ strategy: "personalized", surface: "explore", limit: 8 }, { user });
    const slots = r.items.filter((i) => i.exploration);
    assert.ok(slots.length <= 1);
    if (slots.length) assert.ok(slots[0].rank > 0);
  });

  it("a search in the session shapes the list (session intent)", () => {
    const user = userFrom([
      { surface: "search", event: "query", entityType: null, entityId: null, query: "vector database for rag" },
      { surface: "tool_profile", event: "open", entityType: "tool", entityId: ref("tool", "pinecone").id, query: null },
    ]);
    const r = run({ strategy: "personalized", surface: "explore", limit: 6 }, { user });
    const data = r.items.filter((i) => index.entities.get(i.key)!.attrs.category?.some((c) => c.key === "backend-and-data")).length;
    assert.ok(data >= 3, slugs(r).join());
  });
});

describe("contextual (Compare, worth comparing)", () => {
  it("suggests entries like the comparison, and never one already in it", () => {
    const seeds = [ref("tool", "cursor"), ref("tool", "windsurf")];
    const r = run({ strategy: "contextual", surface: "compare", seeds, limit: 4 });
    assert.ok(r.items.length > 0);
    for (const it of r.items) assert.ok(!seeds.some((s) => s.id === it.ref.id));
    for (const it of r.items) assert.ok(index.entities.get(it.key)!.attrs.category?.some((c) => c.key === "coding"), it.key);
  });
});
