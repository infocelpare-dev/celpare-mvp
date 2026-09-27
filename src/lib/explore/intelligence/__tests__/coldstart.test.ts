import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyExploreProfile } from "../profile";
import { DAY, NOW, cand, runAll, tool } from "./fixtures";

describe("explore_v1 cold start", () => {
  it("a signed out visitor still gets full shelves wherever candidates exist", () => {
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => tool(`t${i}`, `c${i}`, { createdAt: NOW - (i + 1) * DAY })),
      ...Array.from({ length: 3 }, (_, i) => cand("model", `m${i}`, { keys: [`provider:p${i}`], group: `provider:p${i}` })),
      ...Array.from({ length: 3 }, (_, i) =>
        cand("post", `p${i}`, { createdAt: NOW - (i + 1) * 3_600_000, facts: { body: `cold post ${i} ${"xyz"[i]}q unique words` } }),
      ),
      ...Array.from({ length: 2 }, (_, i) => cand("video", `v${i}`, { facts: { body: `cold video ${i} ${"uv"[i]}w clip` } })),
      cand("person", "u1"),
      cand("topic", "x1"),
      cand("category", "c1"),
    ];
    const all = runAll(pool, emptyExploreProfile(null));
    for (const id of ["for-you", "new-and-recent", "recommended-tools", "recommended-models", "people", "topics", "discussions", "videos"] as const) {
      assert.ok((all.get(id)?.items.length ?? 0) > 0, `${id} is empty`);
    }
    assert.equal(all.get("continue-exploring")?.items.length, 0);
  });
});
