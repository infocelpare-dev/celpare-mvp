import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareExplore, rankExplore } from "../pipeline";
import { DAY, NOW, cand, profile, signals, tool } from "./fixtures";

describe("explore_v1 performance", () => {
  it("ranks every shelf over 600 candidates quickly", () => {
    const pool = [
      ...Array.from({ length: 250 }, (_, i) =>
        tool(`t${i}`, `cat${i % 20}`, {
          keys: [`tag:t${i % 30}`],
          createdAt: NOW - (i % 40) * DAY,
          facts: { signals: signals({ views7d: i % 13, viewers7d: i % 5, views24h: i % 4 }) },
        }),
      ),
      ...Array.from({ length: 100 }, (_, i) => cand("model", `m${i}`, { keys: [`provider:p${i % 8}`], group: `provider:p${i % 8}` })),
      ...Array.from({ length: 200 }, (_, i) =>
        cand("post", `p${i}`, { owner: `a${i % 30}`, keys: [`topic:x${i % 11}`], group: `topic:x${i % 11}`, facts: { body: `post number ${i} about theme ${i % 11} with words ${i * 3}` } }),
      ),
      ...Array.from({ length: 50 }, (_, i) => cand("person", `u${i}`)),
    ];
    const p = profile({ long: { "category:cat3": 1, "tag:t4": 0.6, "topic:x2": 0.8 } });
    const start = performance.now();
    const prepared = prepareExplore({ pool, profile: p, now: NOW, salt: "perf" });
    const all = rankExplore(prepared);
    const ms = performance.now() - start;
    assert.ok(all.get("for-you")!.items.length > 0);
    assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`);
  });
});
