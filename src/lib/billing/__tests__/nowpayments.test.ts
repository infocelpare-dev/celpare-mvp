import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { invoiceBody, isNowpaymentsUrl, signIpn, sortDeep, verifyIpn } from "../nowpayments";

const SECRET = "example-ipn-secret";

/* The webhook example from the NOWPayments docs, keys deliberately out of order. */
const body = {
  payment_status: "finished",
  payment_id: 123456789,
  invoice_id: null,
  fee: { serviceFee: 0, currency: "btc", depositFee: 0.09, withdrawalFee: 0 },
  price_amount: 1,
  price_currency: "usd",
  pay_currency: "usdttrc20",
  order_id: "4c1d6c4e-0000-4000-8000-000000000000",
};

describe("NOWPayments webhook signature", () => {
  it("matches the documented algorithm: sorted keys at every depth, HMAC-SHA512 hex", () => {
    const docs = createHmac("sha512", SECRET)
      .update(
        JSON.stringify({
          fee: { currency: "btc", depositFee: 0.09, serviceFee: 0, withdrawalFee: 0 },
          invoice_id: null,
          order_id: body.order_id,
          pay_currency: "usdttrc20",
          payment_id: 123456789,
          payment_status: "finished",
          price_amount: 1,
          price_currency: "usd",
        }),
      )
      .digest("hex");
    assert.equal(signIpn(body, SECRET), docs);
  });

  it("accepts a correct signature in either case", () => {
    const sig = signIpn(body, SECRET);
    assert.equal(verifyIpn(body, sig, SECRET), true);
    assert.equal(verifyIpn(body, sig.toUpperCase(), SECRET), true);
  });

  it("refuses a changed body, a wrong secret, junk and a missing secret", () => {
    const sig = signIpn(body, SECRET);
    assert.equal(verifyIpn({ ...body, payment_status: "partially_paid" }, sig, SECRET), false);
    assert.equal(verifyIpn({ ...body, price_amount: 1000 }, sig, SECRET), false);
    assert.equal(verifyIpn(body, signIpn(body, "other"), SECRET), false);
    for (const bad of [null, "", "abc", "z".repeat(128), sig.slice(0, 127)]) assert.equal(verifyIpn(body, bad, SECRET), false);
    assert.equal(verifyIpn(body, sig, ""), false);
    assert.equal(verifyIpn(body, sig, undefined), false);
  });

  it("sorts nested arrays of objects too", () => {
    assert.deepEqual(JSON.stringify(sortDeep({ b: [{ z: 1, a: 2 }], a: 1 })), '{"a":1,"b":[{"a":2,"z":1}]}');
  });
});

describe("NOWPayments invoice", () => {
  it("asks for exactly the plan price in USD, fees on Celpare (D258), our own return URLs", () => {
    const b = invoiceBody({ requestId: "r1", amountCents: 1999, description: "Celpare Pro, Monthly", origin: "https://celpare.com" });
    assert.equal(b.price_amount, 19.99);
    assert.equal(b.price_currency, "usd");
    assert.equal(b.order_id, "r1");
    assert.equal(b.is_fee_paid_by_user, false);
    assert.equal(b.ipn_callback_url, "https://celpare.com/api/billing/nowpayments/ipn");
    assert.ok(b.success_url.startsWith("https://celpare.com/settings/billing"));
  });

  it("only treats nowpayments.io pages as a place to send people", () => {
    assert.equal(isNowpaymentsUrl("https://nowpayments.io/payment/?iid=1"), true);
    assert.equal(isNowpaymentsUrl("https://sandbox.nowpayments.io/payment/?iid=1"), true);
    for (const bad of ["http://nowpayments.io/x", "https://nowpayments.io.evil.com/x", "https://evilnowpayments.io/x", "javascript:alert(1)", 5, null]) {
      assert.equal(isNowpaymentsUrl(bad), false, String(bad));
    }
  });
});
