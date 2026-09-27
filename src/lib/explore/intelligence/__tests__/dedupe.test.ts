import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { H, NOW, cand, keys, profile, run } from "./fixtures";

describe("explore_v1 duplicates and the same story", () => {
  it("the same story clusters to one representative and nothing is deleted", () => {
    const pool = [
      cand("post", "a", { createdAt: NOW - H, facts: { body: "Claude released a new Projects feature for teams today", engagementQuality: 0.9 } }),
      cand("post", "b", { createdAt: NOW - 2 * H, facts: { body: "Claude Projects feature for teams released, a new announcement" } }),
      cand("post", "c", { createdAt: NOW - 3 * H, facts: { body: "Kling video generation keeps getting sharper at motion" } }),
    ];
    const before = pool.length;
    const r = run(pool, profile(), "discussions");
    const claude = keys(r).filter((k) => k === "post:a" || k === "post:b");
    assert.equal(claude.length, 1);
    assert.ok(keys(r).includes("post:c"));
    assert.equal(pool.length, before);
    assert.ok(r.dropped.some((d) => d.reason === "duplicate"));
  });

  it("an upload marked as a near duplicate sits behind its original", () => {
    const pool = [
      cand("post", "orig", { facts: { body: "orig text one" } }),
      cand("post", "copy", { facts: { body: "unrelated wording two", nearDuplicateOf: "orig" } }),
    ];
    const r = run(pool, profile(), "discussions");
    assert.equal(keys(r).filter((k) => k === "post:orig" || k === "post:copy").length, 1);
  });

  it("a model family is represented by its newest version", () => {
    const pool = [
      cand("model", "old", { createdAt: NOW - 400 * 24 * H, facts: { family: "Claude", listingQuality: 0.9 } }),
      cand("model", "new", { createdAt: NOW - 20 * 24 * H, facts: { family: "Claude", listingQuality: 0.6 } }),
      cand("model", "other", { facts: { family: "Gemini" } }),
    ];
    const r = run(pool, profile(), "recommended-models");
    assert.ok(keys(r).includes("model:new"));
    assert.ok(!keys(r).includes("model:old"));
  });
});
