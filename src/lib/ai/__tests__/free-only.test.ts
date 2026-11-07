import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFreeModel, paidModelRefusal } from "../providers/free-only";

const FREE = "nvidia/nemotron-3-ultra-550b-a55b:free";
const PAID = "nvidia/nemotron-3-ultra-550b-a55b";

describe("free only lock (D229)", () => {
  it("allows the free Nemotron 3 Ultra slug", () => {
    assert.equal(isFreeModel(FREE), true);
    assert.equal(paidModelRefusal(FREE, {}), null);
  });

  it("allows the OpenRouter free router", () => {
    assert.equal(paidModelRefusal("openrouter/free", {}), null);
  });

  it("refuses the paid slug of the same model", () => {
    const why = paidModelRefusal(PAID, {});
    assert.ok(why);
    assert.match(why, /nemotron-3-ultra-550b-a55b"/);
  });

  it("allows a paid slug only with OPENROUTER_ALLOW_PAID=on", () => {
    assert.equal(paidModelRefusal(PAID, { OPENROUTER_ALLOW_PAID: "on" }), null);
    assert.ok(paidModelRefusal(PAID, { OPENROUTER_ALLOW_PAID: "yes" }));
    assert.ok(paidModelRefusal(PAID, { OPENROUTER_ALLOW_PAID: "" }));
  });

  it("refuses an empty or missing slug", () => {
    assert.ok(paidModelRefusal("", {}));
    assert.ok(paidModelRefusal(undefined, {}));
  });

  it("is not mistaken for a retryable upstream error", () => {
    const why = paidModelRefusal(PAID, {}) ?? "";
    assert.doesNotMatch(why, /overload|temporarily|rate.?limit|timeout|unavailable|capacity|try again/i);
    assert.doesNotMatch(why, /\b(408|409|429|500|502|503|504|529)\b/);
  });
});
