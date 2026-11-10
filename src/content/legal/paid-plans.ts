import type { Doc } from "../types";
import { OPERATOR } from "../operator";

/*
  Paid Plans Terms, version 1.2 (phase CRYPTO, 2026-11-10). Paid plans are paid in
  BTC, ETH, BNB, XRP or USDT through a NOWPayments page (D256 to D262); the plan switches on when the
  signed NOWPayments webhook confirms the payment. Payoneer (D239, version 1.1)
  is no longer used. Nothing renews
  by itself (no card is stored), an ended plan returns to Free on its end date
  (D240), and the refund window is 24 hours (D243, the founder's rule,
  superseding D208's 14 days). Prices are not repeated here; the pricing page
  reads them from src/lib/pricing/plans.ts, so they cannot drift.
*/

export const paidPlans: Doc = {
  slug: "paid-plans",
  title: "Paid Plans Terms",
  description: "How Celpare's paid plans for individuals and developers are paid for in crypto, started, ended and refunded.",
  version: "1.2",
  effective: "2026-11-10",
  summary: [
    "You pay for a plan in BTC, ETH, BNB, XRP or USDT on a NOWPayments page, and your plan starts by itself once the payment is confirmed.",
    "Plans do not renew automatically. When a plan ends, your account returns to the Free plan unless you have paid for the next period.",
    "You can ask for a full refund within 24 hours of the payment being confirmed. After that, payments are not refunded except where the law requires it.",
  ],
  sections: [
    {
      id: "how",
      heading: "1. How buying a plan works",
      blocks: [
        {
          list: [
            "Choose a plan on the [pricing page](/pricing), add the details for your receipt, and you are taken to a payment page run by NOWPayments, our payment provider.",
            "You pay in one of the coins the page offers (BTC, ETH, BNB, XRP or USDT), on a network it offers for that coin, from a wallet or exchange you control. Celpare never holds or sees your wallet, keys or funds.",
            "When NOWPayments confirms the payment to us, your plan switches on by itself and we email you. This usually takes minutes, and depends on the blockchain. We never switch a plan on from a screenshot, a forwarded email or a message saying a payment was made.",
            "If less than the price arrives, the plan is not switched on. We contact you to settle it: you send the rest, or we refund what arrived.",
            "A payment page that is not paid in time expires. Nothing is charged, and you can start again.",
          ],
        },
        "Blockchain payments cannot be reversed by Celpare or by NOWPayments once sent. Check the amount, the network and the address on the payment page before you pay. Coins sent on the wrong network or to the wrong address may be lost.",
        "Celpare never asks for card details, wallet keys, seed phrases or payment screenshots by email, chat or message. If someone does, it is not us. Report it to " +
          `[${OPERATOR.contact}](mailto:${OPERATOR.contact}).`,
      ],
    },
    {
      id: "prices",
      heading: "2. Prices and what a plan includes",
      blocks: [
        "Prices are in US dollars and are shown on the pricing page with what each plan includes. You pay the same value in the coin you choose, at the rate NOWPayments locks on the payment page for a limited time. If the rate expires before your payment arrives, the page shows the new amount. Celpare pays the NOWPayments fee. The network fee for sending USDT from your wallet or exchange is yours. Yearly prices, where offered, are paid once for twelve months.",
        "Usage on paid plans is described relative to other plans. Limits are applied fairly to keep Celpare working for everyone and are shown in the app.",
      ],
    },
    {
      id: "period",
      heading: "3. When a plan starts and ends",
      blocks: [
        {
          list: [
            "A plan starts when we confirm your payment and runs for the period you paid for: one month or one year.",
            "Plans do not renew automatically, and nothing is kept on file to charge you. To keep a plan, pay for the next period before it ends; a renewal paid before the end date adds a full period after it.",
            "When a plan ends without a renewal, your account returns to the Free plan that day. Nothing you created is deleted, but the limits of the Free plan apply, and items over those limits become read only.",
            "If we change the price of a plan, the new price applies only to payments started after the change.",
          ],
        },
      ],
    },
    {
      id: "refunds",
      heading: "4. Refunds",
      blocks: [
        {
          list: [
            "Within 24 hours of the payment being confirmed, you can ask for a full refund for any reason. The plan ends when the refund is made.",
            "After that, payments are not refunded for the rest of a period, except where the law requires it or where Celpare could not provide the plan.",
            "If we close your account for breaking the [Terms](/legal/terms), the current period is not refunded.",
          ],
        },
        `Ask for a refund at [${OPERATOR.contact}](mailto:${OPERATOR.contact}) from the address on your account. Refunds are paid in USDT, whatever coin you paid in, for the US dollar price you paid, to a wallet address you give us on the same network. Network fees for the refund are paid by Celpare. Consumer rights under Kenyan law, and under the law where you live, are not affected.`,
      ],
    },
    {
      id: "records",
      heading: "5. Billing records",
      blocks: [
        "We keep each payment, its NOWPayments reference and its blockchain transaction id as a financial record, including after you delete your account, for as long as the law requires us to keep accounting records. The [Privacy Policy](/legal/privacy) explains what this includes.",
      ],
    },
    {
      id: "changes",
      heading: "6. Changes to plans",
      blocks: [
        "We may change what plans include. If a change materially reduces what you paid for, we tell you in advance and you can ask for a refund of the unused part of the period.",
      ],
    },
  ],
  changes: [
    { version: "1.2", date: "2026-11-10", note: "Plans are paid in BTC, ETH, BNB, XRP or USDT through NOWPayments and switch on when the payment is confirmed. Payoneer is no longer used. How part payments, expired payment pages, fees and refunds in USDT work." },
    { version: "1.1", date: "2026-11-07", note: "Plans are sold by invoice through Payoneer and do not renew automatically. The refund window is 24 hours from the confirmed payment. Billing records section added." },
    { version: "1.0", date: "2026-10-07", note: "First version, before paid plans open." },
  ],
};
