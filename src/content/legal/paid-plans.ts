import type { Doc } from "../types";
import { OPERATOR } from "../operator";

/*
  Paid Plans Terms, version 1.0 (phase LEGAL, 2026-10-07). No plan is on sale:
  every paid button says Coming soon (src/components/pricing/plan-card.tsx) and
  the payment provider is undecided (G5). Prices are not repeated here; the
  pricing page reads them from src/lib/pricing/plans.ts, so they cannot drift.
  The refund rule is a proposal for the founder to confirm (D208).
*/

export const paidPlans: Doc = {
  slug: "paid-plans",
  title: "Paid Plans Terms",
  description: "How Celpare's paid plans for individuals and developers will be billed, renewed, cancelled and refunded.",
  version: "1.0",
  effective: "2026-10-07",
  summary: [
    "Paid plans are not on sale yet. These terms apply from the day they are.",
    "Plans renew automatically until you cancel. Cancelling stops the next payment and you keep the plan until the period ends.",
    "If you change your mind within 14 days of your first payment for a plan, you get a full refund.",
  ],
  sections: [
    {
      id: "status",
      heading: "1. Not on sale yet",
      blocks: [
        "The [pricing page](/pricing) shows Celpare's plans for individuals (Free, Pro, Premium) and for developers (Free, Pro, Elite). Paid plans show Coming soon and cannot be bought yet. Nobody is charged for anything on Celpare today.",
        "Before paid plans open, this page will name the payment provider, and the [Privacy Policy](/legal/privacy) will add it to the list of providers.",
      ],
    },
    {
      id: "prices",
      heading: "2. Prices and what a plan includes",
      blocks: [
        "Prices are in US dollars and are shown on the pricing page with what each plan includes. Taxes that apply where you live may be added at checkout, and the total is shown before you pay. Yearly prices, where offered, are paid once for twelve months.",
        "Usage on paid plans is described relative to other plans. Limits are applied fairly to keep Celpare working for everyone and are shown in the app.",
      ],
    },
    {
      id: "billing",
      heading: "3. Billing and renewal",
      blocks: [
        {
          list: [
            "You pay at the start of each billing period, monthly or yearly.",
            "Your plan renews automatically at the end of each period at the then current price, until you cancel.",
            "If we change the price of your plan, we tell you at least 30 days before it applies to you, and you can cancel before then.",
            "If a payment fails, we will try again and tell you. If it still fails, your account moves to the Free plan. Nothing you created is deleted, but limits of the Free plan apply.",
          ],
        },
      ],
    },
    {
      id: "cancel",
      heading: "4. Cancelling",
      blocks: [
        "You can cancel at any time. You keep the paid plan until the end of the period you paid for, and you are not charged again.",
      ],
    },
    {
      id: "refunds",
      heading: "5. Refunds",
      blocks: [
        {
          list: [
            "Within 14 days of your first payment for a plan, you can ask for a full refund for any reason.",
            "After that, payments are not refunded for the rest of a period, except where the law requires it or where Celpare could not provide the plan.",
            "If we close your account for breaking the [Terms](/legal/terms), the current period is not refunded.",
          ],
        },
        `Ask for a refund at [${OPERATOR.contact}](mailto:${OPERATOR.contact}) from the address on your account. Consumer rights under Kenyan law, and under the law where you live, are not affected.`,
      ],
    },
    {
      id: "changes",
      heading: "6. Changes to plans",
      blocks: [
        "We may change what plans include. If a change materially reduces what you paid for, we tell you in advance and you can cancel for a refund of the unused part of the period.",
      ],
    },
  ],
  changes: [{ version: "1.0", date: "2026-10-07", note: "First version, before paid plans open." }],
};
