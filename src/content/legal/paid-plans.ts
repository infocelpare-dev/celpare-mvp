import type { Doc } from "../types";
import { OPERATOR } from "../operator";

/*
  Paid Plans Terms, version 1.1 (phase BILL, 2026-11-07). Paid plans are sold
  by manual invoice through Payoneer (D239): a request, a review, an invoice,
  a payment the founder verifies in Payoneer, then activation. Nothing renews
  by itself (no card is stored), an ended plan returns to Free on its end date
  (D240), and the refund window is 24 hours (D243, the founder's rule,
  superseding D208's 14 days). Prices are not repeated here; the pricing page
  reads them from src/lib/pricing/plans.ts, so they cannot drift.
*/

export const paidPlans: Doc = {
  slug: "paid-plans",
  title: "Paid Plans Terms",
  description: "How Celpare's paid plans for individuals and developers are requested, invoiced, started, ended and refunded.",
  version: "1.1",
  effective: "2026-11-07",
  summary: [
    "You request a paid plan, we send an invoice through Payoneer, and your plan starts once we confirm the payment.",
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
            "Choose a plan on the [pricing page](/pricing) and send a request with your billing details. Nothing is charged when you send it.",
            "We review the request by hand. If we can accept it, we send an invoice for the price shown to your billing email through Payoneer.",
            "You pay the invoice from the link in the email from Payoneer.",
            "When we have confirmed the payment in our Payoneer account, we switch the plan on and email you. We never switch a plan on from a screenshot, a forwarded email or a message saying a payment was made.",
          ],
        },
        "We may decline a request, for example when a payment cannot be invoiced under Payoneer's rules. We tell you why, and you are not charged.",
        "Celpare never asks for card details, bank logins or payment screenshots by email, chat or message. If someone does, it is not us. Report it to " +
          `[${OPERATOR.contact}](mailto:${OPERATOR.contact}).`,
      ],
    },
    {
      id: "prices",
      heading: "2. Prices and what a plan includes",
      blocks: [
        "Prices are in US dollars and are shown on the pricing page with what each plan includes. The amount on your invoice is the price shown when you sent the request. Yearly prices, where offered, are paid once for twelve months. Payoneer or your bank may add their own fees or currency conversion.",
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
            "Plans do not renew automatically, and no card is kept on file. To keep a plan, request a new invoice before it ends; a renewal paid before the end date adds a full period after it.",
            "When a plan ends without a renewal, your account returns to the Free plan that day. Nothing you created is deleted, but the limits of the Free plan apply, and items over those limits become read only.",
            "If we change the price of a plan, the new price applies only to requests sent after the change.",
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
        `Ask for a refund at [${OPERATOR.contact}](mailto:${OPERATOR.contact}) from the address on your account. Refunds are paid back through Payoneer to the payer. Consumer rights under Kenyan law, and under the law where you live, are not affected.`,
      ],
    },
    {
      id: "records",
      heading: "5. Billing records",
      blocks: [
        "We keep each request, invoice and payment reference as a financial record, including after you delete your account, for as long as the law requires us to keep accounting records. The [Privacy Policy](/legal/privacy) explains what this includes.",
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
    { version: "1.1", date: "2026-11-07", note: "Plans are sold by invoice through Payoneer and do not renew automatically. The refund window is 24 hours from the confirmed payment. Billing records section added." },
    { version: "1.0", date: "2026-10-07", note: "First version, before paid plans open." },
  ],
};
