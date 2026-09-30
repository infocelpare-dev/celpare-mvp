import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tieBreak, tieGroups } from "../tiebreak";

/* Search stays query first (D181). */
describe("search tie-break", () => {
  const ranked = [
    { key: "exact", relevance: 1.0 },
    { key: "a", relevance: 0.6 },
    { key: "b", relevance: 0.59 },
    { key: "c", relevance: 0.585 },
    { key: "far", relevance: 0.3 },
  ];

  it("groups only results within 5% of the group's first", () => {
    assert.deepEqual(
      tieGroups(ranked).map((g) => g.map((x) => x.key)),
      [["exact"], ["a", "b", "c"], ["far"]],
    );
  });

  it("an exact match stays first however much the person prefers something else", () => {
    const out = tieBreak(ranked, (k) => (k === "far" ? 1 : k === "c" ? 0.9 : 0));
    assert.equal(out[0].key, "exact");
    assert.equal(out[out.length - 1].key, "far", "a favourite cannot jump a clearly more relevant result");
  });

  it("inside a tie, the person's context decides; otherwise the ranked order holds", () => {
    const out = tieBreak(ranked, (k) => (k === "c" ? 0.9 : 0));
    assert.deepEqual(out.map((x) => x.key), ["exact", "c", "a", "b", "far"]);
    const none = tieBreak(ranked, () => 0);
    assert.deepEqual(none.map((x) => x.key), ranked.map((x) => x.key));
  });
});
