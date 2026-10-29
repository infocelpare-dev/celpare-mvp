import type { Doc } from "../types";

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
        "Sponsorship is a flat monthly price per tool on the [sponsorship page](/pricing/sponsored), shown to developers. There you choose which of your tools to sponsor: a tool can be chosen once it is approved, has a secure (https) website and is not already sponsored, and any other tool shows what it still needs. Sponsor this tool on your tool page opens the page with that tool chosen. It is not on sale yet. The rules are in the [Sponsorship Terms](/legal/sponsorship).",
      ],
    },
  ],
};
