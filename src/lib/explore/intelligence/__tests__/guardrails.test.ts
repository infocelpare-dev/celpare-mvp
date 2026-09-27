import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cand, keys, profile, run, tool } from "./fixtures";

describe("explore_v1 guardrails", () => {
  it("a popular writing tool does not beat a relevant video tool for a video explorer", () => {
    const writing = tool("writer", "writing", { facts: { listingQuality: 0.95, views30d: 5000, saves: 900, ratingCount: 500, rating: 4.9 } });
    const video = tool("video", "video generation", { facts: { listingQuality: 0.7, views30d: 20, saves: 2, ratingCount: 1 } });
    const r = run([writing, video], profile({ long: { "category:video generation": 1 } }), "recommended-tools");
    assert.equal(keys(r)[0], "tool:video");
  });

  it("with a profile, relevant tools lead the Tools shelf instead of one per category (persona run)", () => {
    const coding = Array.from({ length: 4 }, (_, i) => tool(`code${i}`, "coding", { facts: { listingQuality: 0.6 } }));
    const others = Array.from({ length: 6 }, (_, i) => tool(`o${i}`, `other${i}`, { facts: { listingQuality: 0.9, views30d: 300 } }));
    const r = run([...others, ...coding], profile({ long: { "category:coding": 1 } }), "recommended-tools");
    assert.deepEqual(
      keys(r).slice(0, 3).map((k) => k.startsWith("tool:code")),
      [true, true, true],
      keys(r).join(),
    );
    assert.ok(keys(r).filter((k) => k.startsWith("tool:code")).length <= 3);
  });

  it("severe safety problems beat any popularity", () => {
    const spam = cand("post", "spam", { facts: { spam: 0.95, viewers: 5000, likeCount: 900, commentCount: 400, trendRank: 0 } });
    const fine = cand("post", "fine");
    const r = run([spam, fine], profile(), "trending");
    assert.ok(!keys(r).includes("post:spam"));
  });

  it("held and suppressed posts never reach a shelf (D154)", () => {
    const held = cand("post", "held", { facts: { stage: "held", trendRank: 0 } });
    const r = run([held], profile(), "trending");
    assert.equal(r.items.length, 0);
    assert.equal(r.dropped[0].reason, "ineligible");
  });

  it("a dismissed item is held back, then allowed to return", () => {
    const t = tool("a", "coding");
    const p = profile({ long: { "category:coding": 1 } });
    p.dismissed.set("tool:a", Date.UTC(2026, 8, 26, 11));
    assert.equal(run([t], p, "recommended-tools").items.length, 0);
    p.dismissed.set("tool:a", Date.UTC(2026, 6, 1));
    assert.equal(run([t], p, "recommended-tools").items.length, 1);
  });
});
