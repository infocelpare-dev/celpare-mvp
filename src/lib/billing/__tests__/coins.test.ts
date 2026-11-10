import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PAY_COINS, coinLabel, isPayCoin, offeredCoins } from "../coins";
import { invoiceBody } from "../nowpayments";

/* The same pattern as invoices_pay_currency_check and billing_crypto_update (D261, D263). */
const DB_ACCEPTS = /^(btc|eth|bnb[a-z0-9]*|xrp|usdt[a-z0-9]*)$/;

describe("checkout coins (D263)", () => {
  it("offers only coins the database accepts", () => {
    for (const c of PAY_COINS) assert.match(c.id, DB_ACCEPTS, c.id);
  });

  it("accepts only listed tickers", () => {
    assert.equal(isPayCoin("usdttrc20"), true);
    for (const bad of ["ltc", "BTC", "", null, 1, "btc "]) assert.equal(isPayCoin(bad), false, String(bad));
  });

  it("names USDT with its network and other coins by symbol", () => {
    assert.equal(coinLabel("usdttrc20"), "USDT on Tron (TRC20)");
    assert.equal(coinLabel("btc"), "BTC");
    assert.equal(coinLabel("doge"), "DOGE");
    assert.equal(coinLabel(null), "");
  });

  it("shows the coins switched on in NOWPayments, and all of ours when that list is unusable", () => {
    assert.deepEqual(offeredCoins(["BTC", "usdttrc20", "ltc"]).map((c) => c.id), ["btc", "usdttrc20"]);
    assert.equal(offeredCoins(null).length, PAY_COINS.length);
    assert.equal(offeredCoins(["ltc"]).length, PAY_COINS.length);
  });

  it("sends the chosen coin as pay_currency, and leaves it out when none was chosen", () => {
    const base = { requestId: "r1", amountCents: 799, description: "Celpare Pro", origin: "https://celpare.com" };
    assert.equal(invoiceBody({ ...base, payCurrency: "xrp" }).pay_currency, "xrp");
    assert.equal("pay_currency" in invoiceBody(base), false);
  });
});
