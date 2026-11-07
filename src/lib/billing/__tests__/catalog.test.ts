import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  displayStatus,
  formatMoney,
  isCountryCode,
  isPaidPlan,
  NEXT_STEP,
  periodsFor,
  planLabel,
} from "../catalog";

describe("displayStatus", () => {
  it("maps each request status to its label", () => {
    assert.equal(displayStatus({ status: "pending" }), "Pending");
    assert.equal(displayStatus({ status: "under_review" }), "Under Review");
    assert.equal(displayStatus({ status: "invoice_sent" }), "Invoice Sent");
    assert.equal(displayStatus({ status: "paid", activated_at: null }), "Paid");
    assert.equal(displayStatus({ status: "rejected" }), "Rejected");
  });

  it("is Active once activated, and Expired when the subscription ended", () => {
    const req = { status: "paid" as const, activated_at: "2026-11-07T00:00:00Z" };
    assert.equal(displayStatus(req, { status: "active" }), "Active");
    assert.equal(displayStatus(req, { status: "expired" }), "Expired");
  });

  it("has a next step for every label", () => {
    for (const label of ["Pending", "Under Review", "Invoice Sent", "Paid", "Active", "Rejected", "Expired"] as const) {
      assert.ok(NEXT_STEP[label].length > 0, label);
    }
  });
});

describe("plans", () => {
  it("accepts only paid plans for each kind", () => {
    assert.equal(isPaidPlan("individual", "pro"), true);
    assert.equal(isPaidPlan("individual", "elite"), false);
    assert.equal(isPaidPlan("developer", "elite"), true);
    assert.equal(isPaidPlan("sponsorship", "sponsored"), true);
    assert.equal(isPaidPlan("individual", "free"), false);
    assert.equal(isPaidPlan("enterprise", "pro"), false);
  });

  it("sells sponsorship monthly only", () => {
    assert.deepEqual(periodsFor("sponsorship"), ["monthly"]);
    assert.deepEqual(periodsFor("individual"), ["monthly", "yearly"]);
  });

  it("names plans for people", () => {
    assert.equal(planLabel("developer", "pro"), "Developer Pro");
    assert.equal(planLabel("individual", "premium"), "Premium");
  });
});

describe("formatMoney", () => {
  it("formats integer cents exactly", () => {
    assert.equal(formatMoney(799), "$7.99");
    assert.equal(formatMoney(19999), "$199.99");
    assert.equal(formatMoney(60000), "$600.00");
    assert.equal(formatMoney(14999), "$149.99");
    assert.equal(formatMoney(123456789), "$1,234,567.89");
  });
});

describe("isCountryCode", () => {
  it("takes two letters only", () => {
    assert.equal(isCountryCode("KE"), true);
    assert.equal(isCountryCode("ke"), true);
    assert.equal(isCountryCode("KEN"), false);
    assert.equal(isCountryCode("K1"), false);
  });
});
