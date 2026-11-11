import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkoutFunnel, collected, monthlyCents, recurring, type PaidInvoice, type PaidRequest } from "../revenue";

const NOW = new Date("2026-11-11T12:00:00Z");
const FUTURE = "2026-12-11T00:00:00Z";
const PAST = "2026-11-01T00:00:00Z";

function req(over: Partial<PaidRequest>): PaidRequest {
  return {
    user_id: "u1",
    kind: "individual",
    plan: "pro",
    period: "monthly",
    amount_cents: 999,
    currency: "USD",
    activated_at: "2026-11-10T00:00:00Z",
    subscription_id: "s1",
    subscriptions: { status: "active", current_period_end: FUTURE },
    ...over,
  };
}

describe("monthlyCents", () => {
  it("counts a yearly plan as a twelfth a month", () => {
    assert.equal(monthlyCents(999, "monthly"), 999);
    assert.equal(monthlyCents(9588, "yearly"), 799);
  });
});

describe("recurring", () => {
  it("adds running plans and multiplies by twelve for ARR", () => {
    const r = recurring(
      [req({}), req({ user_id: "u2", subscription_id: "s2", period: "yearly", amount_cents: 12000 })],
      NOW,
    );
    assert.equal(r.mrrCents, 999 + 1000);
    assert.equal(r.arrCents, (999 + 1000) * 12);
    assert.equal(r.payingAccounts, 2);
    assert.equal(r.runningPlans, 2);
  });

  it("leaves out ended, expired and unactivated plans and other currencies", () => {
    const r = recurring(
      [
        req({ subscriptions: { status: "active", current_period_end: PAST } }),
        req({ subscription_id: "s2", subscriptions: { status: "expired", current_period_end: FUTURE } }),
        req({ subscription_id: "s3", activated_at: null }),
        req({ subscription_id: "s4", currency: "EUR" }),
        req({ subscription_id: "s5", subscriptions: null }),
      ],
      NOW,
    );
    assert.equal(r.mrrCents, 0);
    assert.equal(r.payingAccounts, 0);
  });

  it("counts a subscription bought twice once, at its latest price", () => {
    const r = recurring(
      [req({ amount_cents: 500, activated_at: "2026-10-01T00:00:00Z" }), req({ amount_cents: 999 })],
      NOW,
    );
    assert.equal(r.mrrCents, 999);
    assert.equal(r.runningPlans, 1);
  });

  it("reads the subscription when PostgREST returns a list", () => {
    const r = recurring([req({ subscriptions: [{ status: "active", current_period_end: FUTURE }] })], NOW);
    assert.equal(r.mrrCents, 999);
  });
});

function inv(paid_at: string, cents = 1000): PaidInvoice {
  return { amount_cents: cents, currency: "USD", paid_at, billing_requests: { kind: "individual", plan: "pro", period: "monthly" } };
}

describe("collected", () => {
  it("splits the last 30 days from the 30 before and keeps all time", () => {
    const c = collected([inv("2026-11-10T00:00:00Z"), inv("2026-10-01T00:00:00Z", 500), inv("2025-01-01T00:00:00Z", 200)], NOW);
    assert.equal(c.last30Cents, 1000);
    assert.equal(c.previous30Cents, 500);
    assert.equal(c.allTimeCents, 1700);
    assert.equal(c.payments, 3);
  });

  it("gives twelve months, empty ones included, oldest first", () => {
    const c = collected([inv("2026-11-10T00:00:00Z")], NOW);
    assert.equal(c.byMonth.length, 12);
    assert.equal(c.byMonth[0]!.month, "2025-12");
    assert.equal(c.byMonth[11]!.month, "2026-11");
    assert.equal(c.byMonth[11]!.cents, 1000);
    assert.equal(c.byMonth[10]!.cents, 0);
  });

  it("ignores future dates and other currencies", () => {
    const c = collected([inv("2027-01-01T00:00:00Z"), { ...inv("2026-11-10T00:00:00Z"), currency: "EUR" }], NOW);
    assert.equal(c.allTimeCents, 0);
  });
});

describe("checkoutFunnel", () => {
  it("counts NOWPayments checkouts in the window and the paid ones", () => {
    const f = checkoutFunnel(
      [
        { status: "paid", created_at: "2026-11-05T00:00:00Z", provider: "nowpayments" },
        { status: "expired", created_at: "2026-11-06T00:00:00Z", provider: "nowpayments" },
        { status: "paid", created_at: "2026-11-06T00:00:00Z", provider: "payoneer" },
        { status: "paid", created_at: "2026-08-01T00:00:00Z", provider: "nowpayments" },
      ],
      NOW,
      30,
    );
    assert.deepEqual(f, { started: 2, paid: 1 });
  });
});
