import type { Doc } from "../types";

/* Help: Ask Celpare, Search, Explore, Compare (phase LEGAL, 2026-10-07). From docs/context/11, 15, 16 and the Search decisions D95 to D101. */

export const askCelpare: Doc = {
  slug: "ask-celpare",
  title: "Ask Celpare",
  description: "Ask which AI tool or model fits what you want to do, and get an answer with sources.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "asking",
      heading: "Asking a question",
      blocks: [
        "Open [Ask Celpare](/ask) and describe what you want to get done, for example: which AI tool is best for editing podcasts, or compare two coding assistants. Ask Celpare answers from the Celpare catalogue first, with cards for the tools and models it mentions, and links to its sources.",
        "It answers questions about AI tools, models, technology and software. It declines other topics, and it does not run code you paste in.",
      ],
    },
    {
      id: "modes",
      heading: "Modes",
      blocks: [
        {
          table: {
            head: ["Mode", "What it does", "Plans"],
            rows: [
              ["Catalogue search", "Always on. Searches the Celpare catalogue for matching tools, models, SaaS and tech", "Every plan"],
              ["Web search", "Looks up current information on the web when a question needs it", "Signed in plans"],
              ["Deep research", "Plans several searches, then writes a longer answer with sources", "Premium"],
            ],
          },
        },
        "Catalogue search cannot be switched off, so every answer starts from the Celpare catalogue. A mode that is not on your plan shows a lock in the composer.",
      ],
    },
    {
      id: "history",
      heading: "Chats and settings",
      blocks: [
        "Signed in, chats are saved in the list beside the conversation while chat history is on. Delete any chat from that list. Answer length, web search and chat history are in the Ask Celpare section of [Settings](/settings).",
        "Ask Celpare is AI and can make mistakes: answers can be wrong or out of date. Check prices and terms on the tool's own site. The rules are in section 13 of the [Terms](/legal/terms#ask-celpare), and how questions are handled is in [AI and your data](/legal/ai-data).",
      ],
    },
  ],
};

export const search: Doc = {
  slug: "search",
  title: "Search",
  description: "Find tools, models, posts and people, ranked by how well they match.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "how",
      heading: "How search works",
      blocks: [
        "[Search](/search) ranks results by how well they match what you typed first, and popularity second. If a search fails, it says so rather than showing an empty list.",
        "Your recent searches appear when you open the search box, and only you can see them. Clear them in [Settings](/settings), under Recent activity.",
      ],
    },
    {
      id: "sponsored",
      heading: "Sponsored results",
      blocks: [
        "A result labelled Sponsored is a tool whose developer pays for the chance to appear when it is relevant. It never changes the organic results. You can hide it or report it. See the [Sponsorship Terms](/legal/sponsorship).",
      ],
    },
  ],
};

export const explore: Doc = {
  slug: "explore",
  title: "Explore",
  description: "Browse trending, rising and new tools, models, posts, videos, people and topics.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "shelves",
      heading: "The shelves",
      blocks: [
        "[Explore](/explore) is organised into shelves, each with its own purpose: what is trending now, what is rising quickly, what is new, and picks for you based on what you follow, save and view. Most of each shelf is close to your interests, and a smaller part is new ground, so you find things you would not have searched for.",
        "A short reason under an item says why it is there. Choose Not interested to see less like it.",
      ],
    },
  ],
};

export const compare: Doc = {
  slug: "compare",
  title: "Compare",
  description: "Put 2 to 6 tools or models side by side, with the evidence behind every cell.",
  version: "1.0",
  effective: "2026-10-07",
  sections: [
    {
      id: "build",
      heading: "Building a comparison",
      blocks: [
        {
          steps: [
            "Open [Compare](/compare) and choose the Tools or Models tab. Tools and models are compared separately.",
            "Add 2 to 6 items. The address in your browser is the comparison, so you can share or bookmark it.",
            "Read the summary, the key differences, prices, features and, for models, benchmarks with who measured them.",
          ],
        },
      ],
    },
    {
      id: "evidence",
      heading: "Evidence, not a winner",
      blocks: [
        "Compare never declares an overall winner and never invents a number. Every fact has a source and a date, and a missing fact is shown as missing.",
        "If you set a goal or weights, Compare shows how well each item fits them, with strengths, tradeoffs and what evidence is missing.",
        "Save a comparison as a collection, or send it to Ask Celpare as a question.",
      ],
    },
  ],
};
