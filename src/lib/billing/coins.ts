/*
  The coins a customer can pick at checkout (D261, D263). The id is the
  NOWPayments ticker sent as the invoice pay_currency; the database accepts
  the same set (invoices_pay_currency_check, billing_crypto_update). The
  request page shows only the ones also switched on in the NOWPayments
  dashboard, when it can read that list.

  Safe for the browser: names and tickers only.
*/

export const PAY_COINS = [
  { id: "btc", symbol: "BTC", name: "Bitcoin", network: "Bitcoin" },
  { id: "eth", symbol: "ETH", name: "Ethereum", network: "Ethereum" },
  { id: "bnbbsc", symbol: "BNB", name: "BNB", network: "BNB Smart Chain (BEP20)" },
  { id: "xrp", symbol: "XRP", name: "XRP", network: "XRP Ledger" },
  { id: "usdterc20", symbol: "USDT", name: "Tether", network: "Ethereum (ERC20)" },
  { id: "usdttrc20", symbol: "USDT", name: "Tether", network: "Tron (TRC20)" },
  { id: "usdtbsc", symbol: "USDT", name: "Tether", network: "BNB Smart Chain (BEP20)" },
] as const;

export type PayCoin = (typeof PAY_COINS)[number];
export type PayCoinId = PayCoin["id"];

export function isPayCoin(id: unknown): id is PayCoinId {
  return typeof id === "string" && PAY_COINS.some((c) => c.id === id);
}

/* "USDT on Tron (TRC20)", "BTC". For admin pages and emails. Unknown
   tickers (an old payment) are shown upper cased as NOWPayments sent them. */
export function coinLabel(id: string | null | undefined): string {
  if (!id) return "";
  const c = PAY_COINS.find((x) => x.id === id.toLowerCase());
  if (!c) return id.toUpperCase();
  return c.symbol === "USDT" ? `USDT on ${c.network}` : c.symbol;
}

/* The checkout list: our coins that are also on in the NOWPayments dashboard.
   If that list could not be read, or shares nothing with ours, offer all of
   ours rather than an empty choice; NOWPayments refuses an unavailable coin
   when the invoice is created, and the person is told to pick another. */
export function offeredCoins(enabled: string[] | null): PayCoin[] {
  if (!enabled?.length) return [...PAY_COINS];
  const on = new Set(enabled.map((e) => e.toLowerCase()));
  const both = PAY_COINS.filter((c) => on.has(c.id));
  return both.length ? both : [...PAY_COINS];
}
