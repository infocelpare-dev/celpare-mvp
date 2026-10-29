import type { Doc } from "../types";

/* Community Guidelines, version 1.0 (phase LEGAL, 2026-10-07). The plain language companion to the Acceptable Use Policy. */

export const communityGuidelines: Doc = {
  slug: "community-guidelines",
  title: "Community Guidelines",
  description: "How to take part in the Celpare community: the feed, comments and messages.",
  version: "1.0",
  effective: "2026-10-07",
  summary: [
    "Celpare's community is for sharing what you build, use and learn about AI tools and models.",
    "Be useful, be honest, be kind. The formal rules are in the [Acceptable Use Policy](/legal/acceptable-use).",
  ],
  sections: [
    {
      id: "be-useful",
      heading: "Be useful",
      blocks: [
        {
          list: [
            "Post about AI tools, models, software and what you did with them: results, comparisons, tips, questions, launches.",
            "Show your work. Screenshots, videos and real numbers help people choose.",
            "Stay on topic. The feed is not the place for unrelated content.",
          ],
        },
      ],
    },
    {
      id: "be-honest",
      heading: "Be honest",
      blocks: [
        {
          list: [
            "Say when you built, work for, or are paid by a tool you post about.",
            "Do not invent results, benchmarks or reviews.",
            "Developers: a tool's own posts are labelled Tool. Use your tool's account for launches, and your personal account for yourself.",
          ],
        },
      ],
    },
    {
      id: "be-kind",
      heading: "Be kind",
      blocks: [
        {
          list: [
            "Disagree with ideas, not people. No harassment, insults or pile ons.",
            "Respect privacy. Do not share someone's personal details or private messages.",
            "Messages are for friends: you can start a conversation only with people who follow you back. Do not use them to promote or spam.",
          ],
        },
      ],
    },
    {
      id: "your-tools",
      heading: "Tools to shape your feed",
      blocks: [
        {
          list: [
            "Not interested shows you less like a post. Mute hides a person or topic.",
            "Make your profile private, and choose what visitors can see, in [Settings](/settings).",
            "Report anything that breaks the rules. Reports are confidential: the person reported is not told who reported them.",
          ],
        },
      ],
    },
  ],
  changes: [{ version: "1.0", date: "2026-10-07", note: "First version." }],
};
