import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DAY, NOW, cand, keys, profile, run, tool } from "./fixtures";

describe("explore_v1 new and recently added", () => {
  it("new entities appear, at most three per type", () => {
    const tools = Array.from({ length: 6 }, (_, i) => tool(`t${i}`, `cat${i}`, { createdAt: NOW - (i + 1) * DAY }));
    const posts = [cand("post", "p1", { createdAt: NOW - 3 * 3_600_000 }), cand("post", "p2", { createdAt: NOW - 5 * 3_600_000 })];
    const old = tool("old", "cat", { createdAt: NOW - 200 * DAY });
    const r = run([...tools, ...posts, old], profile(), "new-and-recent");
    const types = keys(r).map((k) => k.split(":")[0]);
    assert.ok(types.filter((t) => t === "tool").length <= 3);
    assert.ok(keys(r).includes("post:p1"));
    assert.ok(!keys(r).includes("tool:old"));
  });

  it("a low quality new entity is gated rather than handed exposure", () => {
    const bad = tool("bad", "cat", { createdAt: NOW - DAY, facts: { listingQuality: 0.05, listingPenalty: 0.6 } });
    const good = tool("good", "cat2", { createdAt: NOW - DAY });
    const r = run([bad, good], profile(), "new-and-recent");
    assert.deepEqual(keys(r), ["tool:good"]);
    assert.equal(r.dropped.find((d) => d.key === "tool:bad")?.reason, "below_quality_floor");
  });
});
