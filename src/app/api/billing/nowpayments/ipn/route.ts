import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { getPayment, nowpaymentsConfigured, verifyIpn, type NowPayment } from "@/lib/billing/nowpayments";
import { activationEmailInfo, requestSummary } from "@/lib/billing/notify";
import type { BillingAlertEvent } from "@/lib/email/messages";
import { emailBillingAlert, emailBillingCustomer } from "@/lib/email/dispatch";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";

/*
  The NOWPayments webhook (phase CRYPTO, D257). The only thing that turns a
  crypto payment into an active plan.

  1. The body must carry a valid x-nowpayments-sig (HMAC-SHA512, IPN secret).
  2. The payment is then RE-READ from the NOWPayments API with our API key, and
     only that answer is used, so a replayed or crafted body cannot set the
     status, the amount or the coin.
  3. order_id is the Celpare request; billing_crypto_update (service role only)
     checks the invoice id, the USD price and that it was paid in USDT, and is
     idempotent, so NOWPayments retrying the same event changes nothing.

  Answers 200 once handled or once it is clear a retry cannot help, 401 on a bad
  signature, 5xx only when a retry might work (NOWPayments re-sends).
*/

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!nowpaymentsConfigured() || !hasServiceRole()) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const raw = await request.text();
  if (raw.length > 20_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  if (!verifyIpn(body, request.headers.get("x-nowpayments-sig"))) {
    console.warn("[billing] NOWPayments webhook with a bad signature refused");
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const paymentId = String(body.payment_id ?? "");
  if (!/^\d{1,20}$/.test(paymentId)) return NextResponse.json({ ok: true, ignored: "no payment id" });

  let payment: NowPayment;
  try {
    payment = await getPayment(paymentId);
  } catch (e) {
    console.error("[billing] NOWPayments re-read failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "re-read failed" }, { status: 502 });
  }

  const requestId = String(payment.order_id ?? "");
  if (!UUID.test(requestId) || String(payment.payment_id) !== paymentId) {
    console.error("[billing] NOWPayments payment has no Celpare order", paymentId);
    return NextResponse.json({ ok: true, ignored: "not a Celpare order" });
  }

  const { data: outcome, error } = await createAdminClient().rpc("billing_crypto_update", {
    p_request: requestId,
    p_payment: payment,
  });
  if (error) {
    /* 22023 and P0002 are permanent (mismatched invoice, unknown request): a
       retry cannot help, so they are logged for the admin and acknowledged. */
    console.error("[billing] billing_crypto_update refused", paymentId, error.code, error.message);
    const permanent = error.code === "22023" || error.code === "P0002";
    return NextResponse.json({ ok: permanent, error: "not applied" }, { status: permanent ? 200 : 500 });
  }

  const result = String(outcome ?? "");
  const alert: BillingAlertEvent | null =
    result === "activated" ? "paid" : result === "partial" ? "partial" : result === "mismatch" ? "mismatch" : result === "refunded" ? "refunded" : null;

  if (alert) {
    after(async () => {
      const s = await requestSummary(requestId);
      if (!s) return;
      const paid = payment.actually_paid != null && payment.pay_currency ? `${payment.actually_paid} ${String(payment.pay_currency).toUpperCase()}` : undefined;
      await emailBillingAlert({
        ...s.email,
        event: alert,
        billingName: s.row.billing_name,
        billingEmail: s.row.billing_email,
        country: s.row.country,
        requestId,
        paymentId,
        paid,
      });
      if (result === "activated") {
        const { data: r } = await createAdminClient()
          .from("billing_requests")
          .select("subscription_id")
          .eq("id", requestId)
          .maybeSingle<{ subscription_id: string | null }>();
        const info = r?.subscription_id ? await activationEmailInfo(requestId, r.subscription_id) : null;
        if (info) await emailBillingCustomer(info.userId, "activated", info.email);
      }
    });
  }

  return NextResponse.json({ ok: true, result });
}
