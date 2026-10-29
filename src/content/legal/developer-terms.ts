import type { Doc } from "../types";
import { OPERATOR } from "../operator";

/*
  Developer Terms, version 1.0 (phase LEGAL, 2026-10-07). The full version of
  the gate at /developer/terms (src/components/developer/terms-gate.tsx), and
  consistent with it: D75 (authorization is the terms record), review before
  publication, D201 (blue tick on request), D202 and D203 (launches, tools post
  as themselves), hard rule 3 (submitted_at and source on every listing).
*/

export const developerTerms: Doc = {
  slug: "developer-terms",
  title: "Developer Terms",
  description: "The rules for listing AI tools and models on Celpare as a developer: accuracy, review, verification, launches and removal.",
  version: "1.0",
  effective: "2026-10-07",
  summary: [
    "List only tools and models you build or officially represent, and describe them accurately.",
    "Celpare reviews every submission before it is public. You cannot approve your own.",
    "Keep listings current. Celpare can correct, unpublish or remove a listing that is inaccurate or breaks these terms.",
    "These terms add to the [Terms of Service](/legal/terms), which still apply.",
  ],
  sections: [
    {
      id: "developer-mode",
      heading: "1. Developer Mode",
      blocks: [
        "Developer Mode is a switch on your ordinary Celpare account. You become a developer when you accept these terms, and the time you accepted them is recorded. Turning it on gives you the developer workspace; it does not make you an administrator or give you any moderation ability.",
        "You can turn Developer Mode off while you have nothing in the catalogue. Once you have submitted a tool or model it stays on, because those records exist and are attributed to you.",
      ],
    },
    {
      id: "what-you-may-list",
      heading: "2. What you may list",
      blocks: [
        {
          list: [
            "AI tools you build or officially represent, and AI models you own or represent.",
            "One listing per tool. Duplicates are rejected.",
            "Not someone else's product, and not a product you are not authorised to represent.",
          ],
        },
      ],
    },
    {
      id: "accuracy",
      heading: "3. Accuracy",
      blocks: [
        {
          list: [
            "Describe the tool accurately. Pricing, features, platforms and links are read by people deciding what to use, and by Ask Celpare when it answers questions.",
            "Keep the listing current. Update prices and features when they change.",
            "No misleading claims, invented benchmarks, fake reviews, or describing a competitor's product as your own.",
            "Media you upload (logos, screenshots, videos) must be yours to use and must show the actual product.",
          ],
        },
        "Celpare records when and from where every listing was submitted, and may add facts from public sources, such as the tool's own pricing page, with their source and date.",
      ],
    },
    {
      id: "review",
      heading: "4. Review and publication",
      blocks: [
        {
          list: [
            "A new submission is a private draft until you send it for review.",
            "While it is in review you cannot edit it.",
            "A review approves it, rejects it, or sends it back asking for changes.",
            "You cannot approve, verify or publish your own submission. This is enforced by the database, not only by policy.",
          ],
        },
      ],
    },
    {
      id: "verification",
      heading: "5. Ownership and the verified tick",
      blocks: [
        "Celpare may check that you own or represent a tool, for example through its domain, before treating you as its owner.",
        "The blue verified tick is requested by the developer and granted only when a Celpare admin accepts the request. Requesting it is part of the Elite developer plan. The tick means Celpare confirmed the listing is managed by the tool's owner. It is not an endorsement or a ranking.",
      ],
    },
    {
      id: "launches",
      heading: "6. Launches and posting as a tool",
      blocks: [
        "From a tool's page you can announce a new feature to the tool page only, or to the tool page and the community feed. Posts made for a tool appear under the tool's name with a Tool label, not under your personal profile. They follow the [Acceptable Use Policy](/legal/acceptable-use) and the [Community Guidelines](/legal/community-guidelines).",
      ],
    },
    {
      id: "data",
      heading: "7. Analytics and data",
      blocks: [
        "Developer analytics are part of the Pro and Elite developer plans. They show aggregate numbers about your listings, such as views over time and how people arrived, and the search terms people used before opening your listing. They never identify the individual people who viewed it, and you may not try to identify them.",
        `Your listing's contact email is used by Celpare to reach you about the listing and is not shown publicly. Submission emails come from ${OPERATOR.submissions}.`,
      ],
    },
    {
      id: "licence",
      heading: "8. Licence to show your listing",
      blocks: [
        "You keep your rights in your listing's text and media. You give Celpare a worldwide, non exclusive, royalty free licence to display, store, reproduce and adapt them to show the listing across Celpare, including Search, Explore, Compare, recommendations and Ask Celpare answers, and to use your tool's name and logo to identify it.",
        "If you delete your Celpare account, approved listings stay in the catalogue as unowned entries, without your contact email, because other people rely on them. You can ask us to remove a listing instead before you delete your account.",
      ],
    },
    {
      id: "removal",
      heading: "9. Removal",
      blocks: [
        "Celpare can correct, unpublish or remove a listing that is inaccurate, out of date, duplicated, or breaks these terms, and can suspend Developer Mode for repeated breaches.",
        `To have a listing removed, email [${OPERATOR.submissions}](mailto:${OPERATOR.submissions}) from the address on your account.`,
      ],
    },
    {
      id: "plans",
      heading: "10. Developer plans",
      blocks: [
        "Developer plans and their limits are shown on the pricing page. Paid developer plans are not on sale yet; when they are, the [Paid Plans Terms](/legal/paid-plans) apply. Sponsorship is covered by the [Sponsorship Terms](/legal/sponsorship).",
      ],
    },
  ],
  changes: [{ version: "1.0", date: "2026-10-07", note: "First version." }],
};
