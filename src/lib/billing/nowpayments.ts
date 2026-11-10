import { createHmac, timingSafeEqual } from "node:crypto";

/*
  NOWPayments, the crypto checkout (phase CRYPTO, D256 to D263).

  Server only. The API key and the IPN secret never leave this module: they are
  read from the environment on each call and never logged.

    NOWPAYMENTS_API_KEY     x-api-key on every API call
    NOWPAYMENTS_IPN_SECRET  signs the webhook (HMAC-SHA512)
    NOWPAYMENTS_API_BASE    optional, default https://api.nowpayments.io/v1

  Source: the NOWPayments Postman collection (read 2026-11-10): POST /invoice
  returns invoice_url; the webhook carries x-nowpayments-sig, an HMAC-SHA512 of
  the body with its keys sorted recursively; GET /payment/:id re-reads a payment.
*/

const DEFAULT_BASE = "https://api.nowpayments.io/v1";

export function nowpaymentsConfigured(): boolean {
  return Boolean(process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET);
}

function base(): string {
  const b = (process.env.NOWPAYMENTS_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
  /* Only NOWPayments hosts, so a mistyped variable cannot send the key elsewhere. */
  if (!/^https:\/\/api(-sandbox)?\.nowpayments\.io\/v1$/.test(b)) throw new Error("NOWPAYMENTS_API_BASE is not a NOWPayments API URL");
  return b;
}

/* ------------------------------------------------------------------ webhook */

/* The documented signing input: keys sorted at every depth, then JSON.stringify. */
export function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((out, k) => {
        out[k] = sortDeep((value as Record<string, unknown>)[k]);
        return out;
      }, {});
  }
  return value;
}

export function signIpn(body: unknown, secret: string): string {
  return createHmac("sha512", secret).update(JSON.stringify(sortDeep(body))).digest("hex");
}

/* Constant time. A missing secret or header is a refusal, never a pass. */
export function verifyIpn(body: unknown, signature: string | null, secret = process.env.NOWPAYMENTS_IPN_SECRET): boolean {
  if (!secret || !signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const expected = Buffer.from(signIpn(body, secret), "hex");
  const given = Buffer.from(signature.toLowerCase(), "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/* ------------------------------------------------------------------ API */

export type NowInvoice = { id: string; invoice_url: string };

export type NowPayment = {
  payment_id: number;
  invoice_id: number | string | null;
  payment_status: string;
  price_amount: number | string | null;
  price_currency: string | null;
  pay_amount?: number | string | null;
  actually_paid?: number | string | null;
  pay_currency: string | null;
  order_id: string | null;
  outcome_amount?: number | string | null;
  outcome_currency?: string | null;
  payin_hash?: string | null;
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error("NOWPAYMENTS_API_KEY is not set");
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { "x-api-key": key, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`NOWPayments ${path.split("?")[0]} ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

/* The body we send, kept pure so a test pins it. Celpare absorbs the fees
   (D258), so the customer is asked for exactly the plan price. */
export function invoiceBody(input: {
  requestId: string;
  amountCents: number;
  description: string;
  origin: string;
  /* The coin the customer chose on Celpare (D263); the page opens on it. */
  payCurrency?: string;
}) {
  return {
    ...(input.payCurrency ? { pay_currency: input.payCurrency } : {}),
    price_amount: Number((input.amountCents / 100).toFixed(2)),
    price_currency: "usd",
    order_id: input.requestId,
    order_description: input.description.slice(0, 200),
    ipn_callback_url: `${input.origin}/api/billing/nowpayments/ipn`,
    success_url: `${input.origin}/settings/billing?checkout=paid`,
    cancel_url: `${input.origin}/settings/billing?checkout=cancelled`,
    partially_paid_url: `${input.origin}/settings/billing?checkout=partial`,
    is_fee_paid_by_user: false,
    is_fixed_rate: false,
  };
}

export async function createInvoice(input: Parameters<typeof invoiceBody>[0]): Promise<NowInvoice> {
  const inv = await call<NowInvoice>("/invoice", { method: "POST", body: JSON.stringify(invoiceBody(input)) });
  if (!inv?.id || !isNowpaymentsUrl(inv.invoice_url)) throw new Error("NOWPayments returned no usable invoice");
  return { id: String(inv.id), invoice_url: inv.invoice_url };
}

/* The coins switched on in the NOWPayments dashboard ("Coins settings"),
   read at most every 10 minutes. Null when it cannot be read: the caller then
   offers every coin Celpare accepts. */
let coinsCache: { at: number; coins: string[] } | null = null;
export async function enabledCoins(): Promise<string[] | null> {
  if (!process.env.NOWPAYMENTS_API_KEY) return null;
  if (coinsCache && Date.now() - coinsCache.at < 10 * 60_000) return coinsCache.coins;
  try {
    const r = await call<{ selectedCurrencies?: unknown; currencies?: unknown }>("/merchant/coins");
    const list = Array.isArray(r.selectedCurrencies) ? r.selectedCurrencies : Array.isArray(r.currencies) ? r.currencies : null;
    if (!list) return null;
    const coins = list.filter((c): c is string => typeof c === "string").map((c) => c.toLowerCase());
    coinsCache = { at: Date.now(), coins };
    return coins;
  } catch (e) {
    console.error("[billing] NOWPayments coin list failed", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function getPayment(paymentId: string | number): Promise<NowPayment> {
  const id = String(paymentId);
  if (!/^\d{1,20}$/.test(id)) throw new Error("bad payment id");
  return call<NowPayment>(`/payment/${id}`);
}

/* We only ever send people to a NOWPayments page (the database checks too). */
export function isNowpaymentsUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length > 500) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "nowpayments.io" || u.hostname.endsWith(".nowpayments.io"));
  } catch {
    return false;
  }
}
