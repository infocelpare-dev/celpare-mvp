import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderSections } from "../sections";
import { buildExploreProfile } from "../profile";
import { NOW, keys, profile, run, runAll, tool } from "./fixtures";

const pool = [
  tool("vid1", "video generation", { keys: ["tag:video"] }),
  tool("vid2", "video generation", { keys: ["tag:video"] }),
  tool("code1", "ai coding", { keys: ["tag:code"] }),
  tool("code2", "ai coding", { keys: ["tag:code"] }),
  tool("write1", "writing", { keys: ["tag:text"] }),
];

describe("explore_v1 personalization", () => {
  it("two people with different interests get different For you order", () => {
    const video = run(pool, profile({ long: { "category:video generation": 1 } }), "for-you");
    const coding = run(pool, profile({ long: { "category:ai coding": 1 } }), "for-you");
    assert.ok(keys(video)[0].startsWith("tool:vid"), keys(video).join());
    assert.ok(keys(coding)[0].startsWith("tool:code"), keys(coding).join());
    assert.notDeepEqual(keys(video), keys(coding));
  });

  it("Explore activity in this sitting lifts matching items", () => {
    const r = run(pool, profile({ session: { "category:video generation": 1 } }), "recommended-tools");
    assert.ok(keys(r)[0].startsWith("tool:vid"));
  });

  it("long term interests shape For you when the session is empty", () => {
    const r = run(pool, profile({ long: { "tag:code": 1 } }), "for-you");
    assert.ok(keys(r)[0].startsWith("tool:code"));
  });

  it("an Explore click becomes interest in the taxonomy of that tool", () => {
    const byKey = new Map(pool.map((c) => [c.key, c.featureKeys]));
    const p = buildExploreProfile({
      userId: "u",
      community: null,
      affinity: null,
      history: [
        { entityType: "tool", entityId: "vid1", entityKey: null, event: "click", section: "for-you", at: NOW - 5 * 60_000 },
        { entityType: "tool", entityId: "vid2", entityKey: null, event: "save", section: "for-you", at: NOW - 60_000 },
        { entityType: "tool", entityId: "code1", entityKey: null, event: "impression", section: "for-you", at: NOW - 60_000 },
      ],
      owned: [],
      keysOf: (k) => byKey.get(k),
      now: NOW,
    });
    assert.ok((p.session.get("category:video generation") ?? 0) > 0);
    assert.ok(p.owned.has("tool:vid2"));
    assert.equal(p.sessionSeeds[0].key, "tool:vid2");
    assert.ok(p.served.has("tool:code1"));
    assert.equal(p.cold, false);
  });

  it("a single dismiss is a partial negative, not a full one", () => {
    const byKey = new Map(pool.map((c) => [c.key, c.featureKeys]));
    const p = buildExploreProfile({
      userId: "u",
      community: null,
      affinity: null,
      history: [{ entityType: "tool", entityId: "vid1", entityKey: null, event: "dismiss", section: "for-you", at: NOW - 60_000 }],
      owned: [],
      keysOf: (k) => byKey.get(k),
      now: NOW,
    });
    const neg = p.negative.get("category:video generation") ?? 0;
    assert.ok(neg > 0 && neg < 0.5, `negative ${neg}`);
    assert.ok(p.dismissed.has("tool:vid1"));
  });

  it("section order keeps For you first and Continue exploring last", () => {
    const p = profile({ long: { "category:video generation": 1 } });
    p.clicked.set("tool:vid1", NOW);
    const order = orderSections(runAll(pool, p), p);
    assert.equal(order[0], "for-you");
    assert.equal(order[order.length - 1], "continue-exploring");
    assert.equal(new Set(order).size, order.length);
  });
});
