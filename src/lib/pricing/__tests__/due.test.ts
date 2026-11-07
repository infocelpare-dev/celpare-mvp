import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFreeForPlans } from "../due";

describe("isFreeForPlans", () => {
  it("shows the plans to a free individual", () => {
    assert.equal(isFreeForPlans({ plan: "free", developerPlan: "free", isDeveloper: false }), true);
  });

  it("does not show them to a paying individual", () => {
    assert.equal(isFreeForPlans({ plan: "pro", developerPlan: "free", isDeveloper: false }), false);
    assert.equal(isFreeForPlans({ plan: "premium", developerPlan: "free", isDeveloper: false }), false);
  });

  it("ignores the developer plan when Developer Mode is off", () => {
    assert.equal(isFreeForPlans({ plan: "pro", developerPlan: "free", isDeveloper: true }), true);
    assert.equal(isFreeForPlans({ plan: "pro", developerPlan: "free", isDeveloper: false }), false);
  });

  it("shows them to a developer on a free developer plan with a paid individual plan", () => {
    assert.equal(isFreeForPlans({ plan: "premium", developerPlan: "free", isDeveloper: true }), true);
  });

  it("does not show them when both plans are paid", () => {
    assert.equal(isFreeForPlans({ plan: "pro", developerPlan: "elite", isDeveloper: true }), false);
  });

  it("treats a failed read as not free", () => {
    assert.equal(isFreeForPlans(null), false);
    assert.equal(isFreeForPlans({ plan: null, developerPlan: null, isDeveloper: true }), false);
    assert.equal(isFreeForPlans({ plan: null, developerPlan: "pro", isDeveloper: true }), false);
  });
});
