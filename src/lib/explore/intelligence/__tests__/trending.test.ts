import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { entityMomentum } from "../momentum";
import { cand, keys, profile, run, signals, tool } from "./fixtures";

describe("explore_v1 trending", () => {
  it("high recent velocity beats a large historical total", () => {
    const old = tool("old", "writing", { facts: { viewsTotal: 50_000, views30d: 10, signals: signals({ views24h: 2, views7d: 10, viewers7d: 3, viewsPrev7d: 12, viewersPrev7d: 4 }) } });
    const hot = tool("hot", "video", { facts: { viewsTotal: 300, views30d: 200, signals: signals({ views24h: 40, views7d: 120, viewers7d: 25, saves7d: 6 }) } });
    const quiet = tool("quiet", "audio", { facts: { signals: signals() } });
    const r = run([old, hot, quiet], profile(), "trending");
    assert.equal(keys(r)[0], "tool:hot");
    assert.ok(!keys(r).includes("tool:quiet"));
  });

  it("old popularity alone does not create a trend", () => {
    const m = entityMomentum(signals({ views24h: 0, views7d: 1, viewers7d: 1 }), 0.5);
    assert.equal(m.trending, false);
    assert.equal(m.attention, 0);
  });

  it("fewer than three distinct people cannot trend, however many views", () => {
    const m = entityMomentum(signals({ views24h: 500, views7d: 900, viewers7d: 2 }), 0.5);
    assert.equal(m.trending, false);
  });

  it("posts come from the Community Intelligence trending list, in its order", () => {
    const a = cand("post", "a", { facts: { trendRank: 1 } });
    const b = cand("post", "b", { facts: { trendRank: 0 } });
    const c = cand("post", "c", { facts: { trendRank: null } });
    const r = run([a, b, c], profile(), "trending");
    assert.deepEqual(keys(r), ["post:b", "post:a"]);
  });

  it("an empty Trending shelf says why instead of inventing a trend", () => {
    const r = run([tool("x", "coding", { facts: { signals: signals() } })], profile(), "trending");
    assert.equal(r.items.length, 0);
    assert.match(r.note ?? "", /not enough activity/i);
  });
});
