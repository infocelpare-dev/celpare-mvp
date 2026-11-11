import type { Doc } from "../types";
import { OPERATOR } from "../operator";

/* Help: developers and sponsorship (phase LEGAL, 2026-10-07). D75, D200 to D205, phases 4S to 4AC. */

export const developers: Doc = {
  slug: "developers",
  title: "Listing a tool as a developer",
  description: "Turn on Developer Mode, submit a tool or model, get it reviewed, verify it, launch features and read your analytics.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "start",
      heading: "Become a developer",
      blocks: [
        "From your profile, turn on Developer Mode and accept the [Developer Terms](/legal/developer-terms). It is the same account; you get a developer workspace and a public developer profile, which can be your company.",
      ],
    },
    {
      id: "submit",
      heading: "Submit a tool or model",
      blocks: [
        {
          steps: [
            "In the developer workspace, create a submission: name, description, pricing, features, platforms, links, logo, screenshots and videos.",
            "It stays a private draft until you send it for review.",
            "A Celpare reviewer approves it, rejects it, or sends it back asking for changes. You are emailed the decision.",
            "Once approved, it is public on its tool page and can appear in Search, Explore, Compare and Ask Celpare.",
          ],
        },
        "Keep it accurate and current. You can edit your listings from the workspace.",
      ],
    },
    {
      id: "verify",
      heading: "The verified tick",
      blocks: [
        "On the Elite developer plan, request the blue verified tick for a tool from its page. A Celpare admin reviews the request. A verified tool shows the tick wherever it appears, including on its posts.",
      ],
    },
    {
      id: "launch",
      heading: "Launch a new feature",
      blocks: [
        "From your tool's page, announce a new feature to the tool page only, or to the tool page and the community feed. Launch posts appear under the tool's own name with a Tool label.",
      ],
    },
    {
      id: "analytics",
      heading: "Analytics",
      blocks: [
        "Analytics is on the Pro and Elite developer plans. The board shows views of your listings over time, how people arrived, and the search terms that led them to your tool, for the last 24 hours, 7 days or 30 days. It never shows who viewed.",
      ],
    },
  ],
};

/*
  A tool Celpare added itself (admin_seed, D40, D266) has no developer. Its owner
  writes to submission@ from an address at the tool's own domain, which is the
  proof of ownership: anyone can open a free mailbox, nobody else can send from
  the company's domain. There is no in app claim flow yet, so a handover is done
  by hand by a Celpare admin.
*/
export const listedTool: Doc = {
  slug: "your-tool-is-listed",
  title: "Your tool is listed, but you did not add it",
  description: "How the people behind a tool can correct, take over or remove a listing that Celpare added.",
  version: "1.0",
  effective: "2026-11-11",
  sections: [
    {
      id: "why",
      heading: "Why your tool is on Celpare",
      blocks: [
        "Celpare adds some widely used tools itself, from public information such as the tool's own website, so people can find and compare them. A tool page says when a listing was added by Celpare rather than submitted by the people who build it.",
        "If it is your tool, you can ask us to correct the details, hand the listing over to you, or remove it.",
      ],
    },
    {
      id: "how",
      heading: "How to send a request",
      blocks: [
        {
          steps: [
            `Email [${OPERATOR.submissions}](mailto:${OPERATOR.submissions}).`,
            "Send it from an email address at your tool's own domain, the same domain as the website on the listing. If the listing links to example.com, write from an address such as name@example.com.",
            "Include the link to the tool's page on Celpare, your name and your role, and what you want: a correction (say what is wrong and link a public page that shows the right information), a handover to your Celpare account (give the email of that account), or removal.",
          ],
        },
        "We cannot act on a request sent from a free mailbox such as Gmail or Outlook, or from a different domain, because anyone can open one of those. The address on your company's domain is how we know the request comes from the people who run the tool.",
      ],
    },
    {
      id: "after",
      heading: "What happens next",
      blocks: [
        {
          list: [
            `We reply from ${OPERATOR.submissions}. We may write back to the address you used to confirm the request.`,
            "Corrections are made to the listing once we can see the right information on a public page.",
            "For a handover, your Celpare account needs Developer Mode switched on and the [Developer Terms](/legal/developer-terms) accepted. The listing then moves to your developer workspace, where you can edit it, launch features and request the verified tick.",
            "A removed listing disappears from Celpare, including Search, Explore, Compare and Ask Celpare.",
          ],
        },
        "We never ask for a password, a payment or a verification code to change a listing. An email asking for any of those is not from Celpare.",
      ],
    },
  ],
};

export const sponsoredTools: Doc = {
  slug: "sponsored-tools",
  title: "Sponsored tools",
  description: "How sponsored placements are chosen and shown, for people searching and for developers.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "viewers",
      heading: "If you see one",
      blocks: [
        "A Sponsored label means the tool's developer pays for the chance to appear when it is relevant to your search or question. It is chosen by relevance and quality, never by who pays more, and organic results are not changed. Hide it, or report it with a reason.",
      ],
    },
    {
      id: "developers",
      heading: "If you want to sponsor",
      blocks: [
        "Sponsorship is a flat monthly price per tool on the [sponsorship page](/pricing/sponsored), shown to developers. There you choose which of your tools to sponsor: a tool can be chosen once it is approved, has a secure (https) website and is not already sponsored, and any other tool shows what it still needs. Sponsor this tool on your tool page opens the page with that tool chosen. You pay for each month in crypto through NOWPayments, and it does not renew by itself. The rules are in the [Sponsorship Terms](/legal/sponsorship).",
      ],
    },
  ],
};
