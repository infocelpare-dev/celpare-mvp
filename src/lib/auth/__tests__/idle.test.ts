import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { IDLE_LIMIT_MS, TOUCH_EVERY_MS, idleValue, idleVerdict } = await import("../idle");

const S = "4f0c1b2a-0000-4000-8000-000000000001";
const NOW = Date.UTC(2026, 10, 20, 12, 0, 0);

describe("sign out after 3 days away (D272)", () => {
  it("starts the clock for a session with no cookie yet", () => {
    assert.equal(idleVerdict(undefined, S, NOW), "touch");
    assert.equal(idleVerdict("", S, NOW), "touch");
  });

  it("keeps a session seen a moment ago without rewriting the cookie", () => {
    assert.equal(idleVerdict(idleValue(S, NOW - 60_000), S, NOW), "fresh");
  });

  it("refreshes the time once an hour has passed", () => {
    assert.equal(idleVerdict(idleValue(S, NOW - TOUCH_EVERY_MS - 1), S, NOW), "touch");
  });

  it("keeps a session away for just under 3 days", () => {
    assert.equal(idleVerdict(idleValue(S, NOW - IDLE_LIMIT_MS), S, NOW), "touch");
  });

  it("signs out a session away for more than 3 days", () => {
    assert.equal(idleVerdict(idleValue(S, NOW - IDLE_LIMIT_MS - 1), S, NOW), "expired");
    assert.equal(idleVerdict(idleValue(S, NOW - 10 * IDLE_LIMIT_MS), S, NOW), "expired");
  });

  it("never expires a new login with an old session's cookie", () => {
    const other = "4f0c1b2a-0000-4000-8000-000000000002";
    assert.equal(idleVerdict(idleValue(other, NOW - 10 * IDLE_LIMIT_MS), S, NOW), "touch");
  });

  it("restarts the clock on a value it cannot read or from the future", () => {
    assert.equal(idleVerdict(`${S}.abc`, S, NOW), "touch");
    assert.equal(idleVerdict("garbage", S, NOW), "touch");
    assert.equal(idleVerdict(idleValue(S, NOW + 60_000), S, NOW), "touch");
  });
});
