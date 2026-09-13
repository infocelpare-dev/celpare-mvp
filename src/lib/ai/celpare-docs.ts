/*
  The third source, alongside the tool catalogue and web search.

  Ask Celpare has to be able to answer questions about Celpare itself: what it
  is, what the plans are, how the assistant works, what it can and cannot see.
  Without this it can recommend 54 tools and still not answer "what is Celpare",
  which is the first thing a new visitor asks.

  Written as facts rather than prose, and drawn from docs/context so there is
  one source of truth. When a plan or a claim changes, change it here and in the
  doc it came from.

  This is Celpare's own documentation, so it is trusted content and sits with
  the product rules in the prompt. Web results do not: those are untrusted and
  go below the safety rules.
*/

export type DocSection = {
  id: string;
  title: string;
  /* Matched against the question. Cheap keyword retrieval rather than
     embeddings: there are a dozen sections, so a vector index would be
     machinery around a list. Revisit if this grows past about fifty. */
  keywords: string[];
  body: string;
};

export const CELPARE_DOCS: DocSection[] = [
  {
    id: "what-is-celpare",
    title: "What Celpare is",
    keywords: ["what is celpare", "about celpare", "celpare", "what do you do", "who are you", "what can you do", "purpose"],
    body: `Celpare is a platform for discovering, comparing, researching and recommending AI tools, models and software. Its tagline is "Right tool. Right result." It answers one question: what is the right AI tool, model or resource for what I want to accomplish. The product loop is Discover, Search, Explore, Ask, Compare, Choose, Use, Share.`,
  },
  {
    id: "surfaces",
    title: "What Celpare offers",
    keywords: ["features", "surfaces", "sections", "what does celpare have", "explore", "compare", "directory", "community"],
    body: `Celpare has seven surfaces. Community is the home feed. Search covers tools, models, companies, resources, posts, people and categories. Explore is discovery without a target: trending and new tools, popular discussions, categories. Ask Celpare is this assistant. Compare puts tools side by side on features, pricing, strengths, weaknesses and platform support. Recommendations learn from what you search, view and save. The directory holds structured records for AI tools and models. Community, Explore and Compare are still being built; Ask Celpare and the tool directory are live.`,
  },
  {
    id: "ask-celpare",
    title: "How Ask Celpare works",
    keywords: ["how do you work", "how does ask celpare work", "where do you get", "your sources", "how do you know", "chatbot", "assistant", "what model", "which model", "powered by"],
    body: `Ask Celpare answers from three sources: the Celpare tool catalogue, this documentation, and a web search when a question needs current information. It only answers on AI tools, models, technology and SaaS. It recommends products from the Celpare catalogue rather than inventing them, and says when the catalogue has no good match rather than guessing. It runs on Nemotron 3 Ultra through OpenRouter, behind a gateway that handles limits, filtering and retrieval. The model can be changed without changing the product.`,
  },
  {
    id: "ai-boundary",
    title: "What the assistant can and cannot see",
    keywords: ["privacy", "data", "can you see", "what do you know about me", "my data", "security", "read my"],
    body: `The assistant can read public tool information only: name, description, features, pricing, categories, tags, ratings, public reviews, supported platforms, official website and documentation links. It can never read user accounts, email addresses, developer analytics, payments, subscriptions, API keys, internal notes, admin data, reports or logs. That boundary is enforced by the database returning only those fields, not by instructions in a prompt, so it holds even if somebody talks the model into asking for more.`,
  },
  {
    id: "plans",
    title: "Plans and pricing",
    keywords: ["pricing", "price", "plan", "plans", "cost", "subscription", "free", "pro", "premium", "how much", "upgrade", "limits", "quota"],
    body: `There are three user plans. Free includes the assistant, tool pages, community access, trending tools and up to 5 saved tools. Pro at 7.99 a month adds more messages, up to 15 saved tools, 10 collections, advanced filters, advanced comparison and priority recommendations. Premium at 19.99 a month adds research mode, unlimited saved tools and collections, and exclusive AI ranking. Developer plans are separate: Free with up to 2 tools, Pro at 20 a month with up to 5 tools and better placement, and Elite at 50 a month with unlimited tools and a verified badge. Payments are not built yet, so everybody is on the free plan today.`,
  },
  {
    id: "ask-limits",
    title: "Assistant usage limits",
    keywords: ["how many messages", "limit", "run out", "rate limit", "quota", "daily", "reset", "used up"],
    body: `Message limits are per day and reset at midnight. Signed out visitors get 5 questions a day and their chats are not saved. Free accounts get 25 a day, Pro 150 and Premium 500. Longer answers and more conversation history are available on the higher plans. Web search is available on Pro and Premium.`,
  },
  {
    id: "accounts",
    title: "Accounts and signing in",
    keywords: ["sign up", "signup", "log in", "login", "account", "register", "google", "password", "verify"],
    body: `You can use Celpare signed out, including the assistant, but nothing is saved. Creating an account lets Celpare keep your chats and saved tools. Sign up with Google, or with a name, email and password confirmed by a six digit code. There is one account type for everybody; developer mode is a setting you turn on inside your profile rather than a separate signup.`,
  },
  {
    id: "submitting",
    title: "Listing a tool on Celpare",
    keywords: ["submit", "list my tool", "add my tool", "developer", "publish", "get listed", "my product"],
    body: `Developers will be able to submit tools for review, with a pipeline of pending, changes required, approved and rejected. Every catalogue record stores where it came from and when it was added. Submissions are not open yet: the current catalogue is curated by Celpare.`,
  },
  {
    id: "catalogue",
    title: "The tool catalogue",
    keywords: ["catalogue", "catalog", "how many tools", "your database", "what tools", "listed", "directory"],
    body: `The catalogue currently holds 54 curated AI tools across eight categories: chat and reasoning, coding, image generation, video, voice and audio, search and research, automation, and backend and data. Every record stores its source and the date it was added. Ratings are empty because there are no reviews yet, and Celpare shows that as "not rated yet" rather than inventing a score.`,
  },
  {
    id: "scope",
    title: "What the assistant will not answer",
    keywords: ["why wont you", "refuse", "off topic", "cannot answer", "not allowed"],
    body: `Ask Celpare only covers AI tools, AI models, software, developer technology and SaaS. It will not answer on other subjects such as weather, politics, medicine, sport or general trivia. That is a product decision, not a limitation of the model.`,
  },
];

/*
  Retrieval. Score each section by how many of its keywords appear in the
  question, weighted by keyword length so "pricing" beats "the".
*/
export function searchDocs(question: string, limit = 3): DocSection[] {
  const q = question.toLowerCase();

  const scored = CELPARE_DOCS.map((section) => {
    let score = 0;
    for (const kw of section.keywords) {
      if (q.includes(kw)) score += kw.length;
    }
    return { section, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.section);
}

/* Does this question look like it is about Celpare itself rather than about
   tools in general? Used to decide whether to spend retrieval on docs. */
export function looksLikeAboutCelpare(question: string): boolean {
  const q = question.toLowerCase();
  if (q.includes("celpare")) return true;
  return /\b(you|your|this (site|app|platform|service))\b/.test(q) &&
    /\b(work|do|answer|know|see|read|cost|price|plan|limit|source|model)\b/.test(q);
}
