import type { Doc } from "../types";
import { OPERATOR } from "../operator";

/*
  Sponsorship Terms, version 1.2 (phase CRYPTO, 2026-11-10). The offer is D204,
  the ranking D205 (docs/context/18-sponsored-tools.md). Paid in USDT through
  NOWPayments like the paid plans (D256): /pricing/sponsored says Pay with USDT
  while features.billing_requests is on, Coming soon otherwise.
*/

export const sponsorship: Doc = {
  slug: "sponsorship",
  title: "Sponsorship Terms",
  description: "How sponsored tools work on Celpare: what a sponsorship buys, how sponsored tools are chosen and labelled, and the rules for sponsors.",
  version: "1.2",
  effective: "2026-11-10",
  summary: [
    "A sponsorship buys eligibility for a labelled Sponsored slot, never a position. There is no bidding.",
    "Among sponsors that match what someone searched or asked, Celpare orders them by relevance and quality, the same way for every sponsor.",
    "Sponsored tools are always labelled, and paying never changes a tool's place in organic results.",
    "A sponsorship runs for one month from the confirmed payment and does not renew automatically.",
  ],
  sections: [
    {
      id: "offer",
      heading: "1. What a sponsorship is",
      blocks: [
        "A sponsorship is a flat monthly price, shown on the [sponsorship page](/pricing/sponsored), for an approved tool you own on Celpare. It makes the tool eligible to appear in a slot labelled Sponsored in Search results and in Ask Celpare answers. There is no bid, cost per click, cost per view, budget or tier.",
        "A sponsorship is paid in USDT through NOWPayments, and runs for one month from the moment the payment is confirmed. It does not renew automatically: when it ends, the tool stops being eligible for the Sponsored slot until a new month is paid. The [Paid Plans Terms](/legal/paid-plans) apply to payment, part payments and refunds.",
      ],
    },
    {
      id: "ranking",
      heading: "2. How sponsored tools are chosen",
      blocks: [
        {
          list: [
            "A sponsored tool can appear only when it is relevant to what the person searched or asked. If no sponsor is relevant, no sponsored slot is shown.",
            "Among relevant sponsors, Celpare orders them by relevance, quality, fit, performance, verification and freshness. Every sponsor pays the same and is ranked by the same rules.",
            "At most three sponsored tools appear for one search or answer, often fewer.",
            "How often the same person sees a sponsored tool is limited, and a person who hides or reports one does not see it again for 30 days.",
            "Sponsorship never changes organic results, Explore, Compare, the feed or recommendations. A sponsored tool keeps its normal organic place as well.",
          ],
        },
      ],
    },
    {
      id: "labelling",
      heading: "3. Labelling",
      blocks: [
        "Every sponsored placement is labelled Sponsored. Viewers can hide it, or report it with a reason.",
      ],
    },
    {
      id: "eligibility",
      heading: "4. Who can sponsor, and what may be sponsored",
      blocks: [
        {
          list: [
            "The tool must be approved and listed on Celpare, owned by an active developer account, and have a secure (https) website.",
            "The listing must be accurate and follow the [Developer Terms](/legal/developer-terms) and the [Acceptable Use Policy](/legal/acceptable-use).",
            "Celpare may refuse a sponsorship, or suspend a placement, if the tool gathers reports, its quality falls below the threshold, or it breaks these terms. A suspended placement is not shown until it is restored.",
          ],
        },
      ],
    },
    {
      id: "reporting",
      heading: "5. What sponsors see",
      blocks: [
        "When sponsor reporting is available, sponsors will see only aggregate numbers for their placements, such as how often they were shown and clicked. They will never see who viewed or clicked.",
      ],
    },
    {
      id: "contact",
      heading: "6. Contact",
      blocks: [`Questions about sponsorship: [${OPERATOR.submissions}](mailto:${OPERATOR.submissions}).`],
    },
  ],
  changes: [
    { version: "1.2", date: "2026-11-10", note: "Sponsorship is paid in USDT through NOWPayments. Payoneer is no longer used." },
    { version: "1.1", date: "2026-11-07", note: "Sponsorship is paid by invoice through Payoneer, runs one month from the confirmed payment and does not renew automatically." },
    { version: "1.0", date: "2026-10-07", note: "First version, before sponsorship opens." },
  ],
};
