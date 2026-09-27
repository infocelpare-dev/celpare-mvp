import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { entityMomentum } from "../momentum";
import { keys, profile, runAll, signals, tool } from "./fixtures";

describe("explore_v1 rising", () => {
  it("acceleration matters: this week far above last week rises", () => {
    const up = entityMomentum(signals({ views7d: 20, viewers7d: 5, viewsPrev7d: 2, viewersPrev7d: 1 }), 0.5);
    const flat = entityMomentum(signals({ views7d: 20, viewers7d: 5, viewsPrev7d: 20, viewersPrev7d: 5 }), 0.5);
    assert.equal(up.rising, true);
    assert.equal(flat.rising, false);
    assert.ok(up.acceleration > flat.acceleration);
  });

  it("a small entity can rise: size is never an input", () => {
    const small = tool("small", "audio", { facts: { viewsTotal: 4, views30d: 4, saves: 0, ratingCount: 0, signals: signals({ views7d: 4, viewers7d: 3, viewsPrev7d: 0 }) } });
    const big = tool("big", "writing", { facts: { viewsTotal: 90_000, views30d: 900, saves: 400, ratingCount: 300, signals: signals({ views7d: 300, viewers7d: 80, viewsPrev7d: 310, viewersPrev7d: 82 }) } });
    const r = runAll([small, big], profile()).get("rising")!;
    assert.ok(keys(r).includes("tool:small"), keys(r).join());
    assert.ok(!keys(r).includes("tool:big"));
  });

  it("anything already Trending is left out of Rising", () => {
    const both = tool("both", "video", { facts: { signals: signals({ views24h: 60, views7d: 100, viewers7d: 30, viewsPrev7d: 5, viewersPrev7d: 2 }) } });
    const all = runAll([both, tool("filler", "x", { facts: { signals: signals() } })], profile());
    assert.ok(keys(all.get("trending")!).includes("tool:both"));
    assert.ok(!keys(all.get("rising")!).includes("tool:both"));
    assert.equal(all.get("rising")!.dropped.find((d) => d.key === "tool:both")?.reason, "already_trending");
  });
});
