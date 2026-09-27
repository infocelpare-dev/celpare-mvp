import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { explainExploreReason } from "../reasons";
import { NO_NETWORK } from "../types";
import { profile, run, tool } from "./fixtures";

describe("explore_v1 privacy", () => {
  it("one followed saver is never shown; three are, as a count", () => {
    const p = profile({ long: { "category:coding": 1 } });
    const one = run([tool("a", "coding", { facts: { network: { ...NO_NETWORK, savers: 1 } } })], p, "recommended-tools");
    assert.notEqual(one.items[0].reason?.code, "network_saved");
    const three = run([tool("a", "coding", { facts: { network: { ...NO_NETWORK, savers: 3 } } })], p, "recommended-tools");
    assert.equal(three.items[0].reason?.code, "network_saved");
    assert.equal(explainExploreReason(three.items[0].reason!), "3 people you follow saved this");
  });

  it("likes rank but never explain", () => {
    const r = run([tool("a", "coding", { facts: { network: { ...NO_NETWORK, likers: 5 } } })], profile({ long: { "category:coding": 1 } }), "for-you");
    const code = r.items[0].reason?.code ?? "";
    assert.ok(!["network_saved", "network_reviewed", "network_posted", "network_commented", "network_reposted"].includes(code));
  });

  it("no reason text carries a score or the name of a person", () => {
    const r = run([tool("a", "coding", { facts: { network: { ...NO_NETWORK, reviewers: 1 } } })], profile({ long: { "category:coding": 1 } }), "recommended-tools");
    const text = explainExploreReason(r.items[0].reason!);
    assert.equal(text, "1 person you follow reviewed this");
    assert.doesNotMatch(text, /0\.\d/);
  });
});
