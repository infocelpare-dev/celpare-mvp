import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { noveltyOf } from "../novelty";
import { DAY, NOW, keys, profile, run, tool } from "./fixtures";

describe("explore_v1 novelty", () => {
  it("an item already opened drops below an identical unopened one", () => {
    const pool = [tool("a", "coding"), tool("b", "coding")];
    const p = profile({ long: { "category:coding": 1 } });
    p.clicked.set("tool:a", NOW - DAY);
    const r = run(pool, p, "recommended-tools");
    assert.deepEqual(keys(r), ["tool:b", "tool:a"]);
  });

  it("consumed items resurface with time instead of vanishing", () => {
    const c = tool("a", "coding");
    const p = profile({ long: { "category:coding": 1 } });
    p.clicked.set("tool:a", NOW - DAY);
    const soon = noveltyOf(c, p, NOW).novelty;
    p.clicked.set("tool:a", NOW - 60 * DAY);
    const later = noveltyOf(c, p, NOW).novelty;
    assert.ok(soon < 0.35, `soon ${soon}`);
    assert.ok(later > 0.8, `later ${later}`);
  });

  it("owned items sink furthest", () => {
    const c = tool("a", "coding");
    const p = profile({ long: { "category:coding": 1 } });
    p.owned.add("tool:a");
    assert.ok(noveltyOf(c, p, NOW).novelty <= 0.15);
  });

  it("a new, good entity outside the profile earns an exploration slot in For you", () => {
    const near = Array.from({ length: 14 }, (_, i) => tool(`c${i}`, "coding"));
    const far = tool("health", "healthcare research", { createdAt: NOW - 2 * DAY, facts: { listingQuality: 0.9, views30d: 30, saves: 6 } });
    const r = run([...near, far], profile({ long: { "category:coding": 1 } }), "for-you");
    const hit = r.items.find((s) => s.candidate.key === "tool:health");
    assert.ok(hit, keys(r).join());
    assert.equal(hit.exploration, true);
    assert.equal(hit.band, "far");
  });
});
