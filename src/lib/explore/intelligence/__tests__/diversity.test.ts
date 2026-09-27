import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cand, keys, profile, run, tool } from "./fixtures";

describe("explore_v1 diversity", () => {
  it("a mixed shelf never runs three of one type while others remain", () => {
    const tools = Array.from({ length: 10 }, (_, i) => tool(`t${i}`, `cat${i}`, { facts: { listingQuality: 0.95, views30d: 80 } }));
    const others = [cand("model", "m1"), cand("post", "p1"), cand("topic", "x1"), cand("person", "u1")];
    const r = run([...tools, ...others], profile(), "for-you");
    const types = keys(r).map((k) => k.split(":")[0]);
    for (let i = 2; i < types.length; i++) {
      const run3 = types[i] === types[i - 1] && types[i] === types[i - 2];
      const othersLeft = types.slice(i).some((t) => t !== types[i]);
      assert.ok(!(run3 && othersLeft), types.join());
    }
    assert.ok(new Set(types).size >= 4, types.join());
  });

  it("no category takes more than three places on the Tools shelf", () => {
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => tool(`v${i}`, "video", { facts: { listingQuality: 0.95 } })),
      ...Array.from({ length: 6 }, (_, i) => tool(`o${i}`, `other${i}`, { facts: { listingQuality: 0.4 } })),
    ];
    const r = run(pool, profile({ long: { "category:video": 1 } }), "recommended-tools");
    assert.ok(keys(r).filter((k) => k.startsWith("tool:v")).length <= 3, keys(r).join());
    assert.equal(r.items.length, 8);
  });

  it("no creator takes more than two places on a shelf", () => {
    const posts = Array.from({ length: 6 }, (_, i) =>
      cand("post", `same${i}`, { owner: "prolific", facts: { body: `distinct ${i} ${"abcdefghij"[i]}zz words ${i * 7}` } }),
    );
    const others = Array.from({ length: 4 }, (_, i) => cand("post", `o${i}`, { facts: { body: `other voice ${i} ${"klmnop"[i]}yy text` } }));
    const r = run([...posts, ...others], profile(), "discussions");
    assert.ok(r.items.filter((s) => s.candidate.ownerId === "prolific").length <= 2);
  });

  it("For you mixes near and far items for a viewer with a profile", () => {
    const near = Array.from({ length: 10 }, (_, i) => tool(`n${i}`, "coding", { keys: ["tag:code"] }));
    const far = Array.from({ length: 3 }, (_, i) => tool(`f${i}`, `far${i}`, { facts: { listingQuality: 0.9, views30d: 60, saves: 8 } }));
    const r = run([...near, ...far], profile({ long: { "category:coding": 1 } }), "for-you");
    const bands = new Set(r.items.map((s) => s.band));
    assert.ok(bands.has("near"));
    assert.ok(bands.has("far"), r.items.map((s) => `${s.candidate.key}:${s.band}`).join());
  });
});
