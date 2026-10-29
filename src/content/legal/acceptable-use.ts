import type { Doc } from "../types";
import { OPERATOR } from "../operator";

/* Acceptable Use Policy, version 1.0 (phase LEGAL, 2026-10-07). Enforcement follows D33. */

export const acceptableUse: Doc = {
  slug: "acceptable-use",
  title: "Acceptable Use Policy",
  description: "What you may not post, send, submit or do on Celpare, and what happens if you do.",
  version: "1.0",
  effective: "2026-10-07",
  summary: [
    "No illegal content, harassment, hate, sexual content involving minors, spam, scams or malware.",
    "No faking: no fake accounts, fake reviews, fake engagement or misleading tool listings.",
    "No abusing the platform: no scraping, no getting around limits, no attacking Celpare or its users.",
    "Breaking these rules can lead to content removal, a suspension, or the account being closed.",
  ],
  sections: [
    {
      id: "content",
      heading: "1. Content you may not post or send",
      blocks: [
        "This applies to posts, comments, direct messages, profiles, media, reviews, Ask Celpare questions and tool submissions.",
        {
          list: [
            "Anything illegal in Kenya or where you are, or that promotes illegal activity.",
            "Sexual content involving anyone under 18. We remove it, close the account, and report it to the authorities.",
            "Sexual or intimate images of a person shared without their consent, and pornography.",
            "Harassment, bullying, threats, or encouraging violence or self harm.",
            "Hate: attacking people for their race, ethnicity, tribe, national origin, religion, caste, sex, gender, sexual orientation, disability or serious disease.",
            "Other people's private information, such as their address, phone number, ID numbers or private messages, without their consent.",
            "Impersonating a person, a company or Celpare, or a tool you do not represent.",
            "Spam: repeated, unsolicited or automated posts and messages, engagement bait, and off topic promotion.",
            "Scams, phishing, malware, or links that lead to them.",
            "Content that infringes copyright, trademarks or other rights.",
            "Deliberately false claims about tools or models, invented benchmarks, and fake reviews, including reviews of your own tool or a competitor's.",
          ],
        },
      ],
    },
    {
      id: "platform",
      heading: "2. Things you may not do",
      blocks: [
        {
          list: [
            "Scrape, crawl or bulk download Celpare, its catalogue or its users' content, except search engines following robots.txt.",
            "Get around usage limits, plan limits, rate limits or the bot check, including by creating extra accounts.",
            "Create fake accounts, buy or sell accounts, or use automation to post, follow, like, view or message.",
            "Manipulate rankings, view counts, trending lists or recommendations.",
            "Try to make Ask Celpare reveal its instructions or configuration, produce content outside its purpose, or attack other users through it.",
            "Probe, scan or test the security of Celpare without permission, or interfere with how it runs. If you find a vulnerability, report it as described on the [Security](/legal/security) page.",
            "Reverse engineer the service, or use it to build a competing product or dataset.",
            "Use Celpare to send messages to people who do not want them.",
          ],
        },
      ],
    },
    {
      id: "reporting",
      heading: "3. Reporting",
      blocks: [
        "Every post, comment and tool has a Report option. Choose the reason that fits: spam, abuse, harassment, off topic, illegal content, or a security risk.",
        `You can also email [${OPERATOR.reports}](mailto:${OPERATOR.reports}). If someone is in immediate danger, contact your local emergency services first.`,
      ],
    },
    {
      id: "enforcement",
      heading: "4. What happens",
      blocks: [
        {
          list: [
            "Content that receives three reports is hidden automatically until a person reviews it. It is restored if it does not break the rules.",
            "We may remove content, limit its reach, or ask you to change it.",
            "We may suspend an account for a period, or close it. A suspended account cannot post or message, but can still delete its own content.",
            "Serious breaches, such as sexual content involving minors, threats of violence or scams, lead to immediate closure and may be reported to the authorities.",
          ],
        },
        `To appeal, email [${OPERATOR.contact}](mailto:${OPERATOR.contact}) from the address on your account. A person reviews every appeal.`,
      ],
    },
  ],
  changes: [{ version: "1.0", date: "2026-10-07", note: "First version." }],
};
