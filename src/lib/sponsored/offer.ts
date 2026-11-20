import { MAX_SPONSORED_TOOLS } from "./config";

/*
  What a sponsorship is, in words, for every page that sells it: /pricing,
  /pricing/sponsored and /startups (D271, 2026-11-20). While paid plans are
  paused, everything is free and the one paid thing is a tool sponsorship. A
  developer with an active sponsorship also gets what Elite gives (analytics
  and the verified tick request): developer_sponsor_sync sets
  developer_profiles.plan, and the existing gates read it.

  Nothing here is a number Celpare has not set (D13).
*/

export const SPONSOR_INCLUDES = [
  "Sponsored placement in Search and Ask Celpare",
  "The Sponsored label on every placement",
  "Developer analytics: views, how people arrive, what they searched",
  "Request the blue verified tick for your tools",
  "Monthly, per tool",
  "Your place in the normal results stays exactly where it is",
] as const;

export const SPONSOR_PLACES = [
  {
    key: "search",
    title: "Top of Search",
    body: `Up to ${MAX_SPONSORED_TOOLS} sponsored tools lead the results, above everything else, when someone searches for what your tool does.`,
  },
  {
    key: "ask",
    title: "In Ask Celpare",
    body: `When someone asks about tools like yours, up to ${MAX_SPONSORED_TOOLS} sponsored tools appear first, then the rest of the answer.`,
  },
  {
    key: "fit",
    title: "Only where it fits",
    body: "Your tool shows only on searches and questions it matches, so the people who see it are looking for it.",
  },
] as const;

export const SPONSOR_QUESTIONS = [
  {
    q: "Is Celpare free?",
    a: "Yes, while paid plans are paused. Ask Celpare, Search, Explore, Compare, the community and listing your tools are free. The only paid thing now is sponsoring a tool.",
  },
  {
    q: "What does a sponsorship add besides placement?",
    a: "While any of your tools is sponsored you get developer analytics for your tools and can request the blue verified tick from a tool page. They stop when the sponsorship ends.",
  },
  {
    q: "Does sponsoring change my normal ranking?",
    a: "No. Sponsored tools sit above the results in their own labelled slots. The normal results are ranked exactly as they would be without sponsorship.",
  },
  {
    q: "Will my tool appear on every search?",
    a: "No. Only on searches and questions it matches. Paying buys position among relevant results, never a place on an unrelated one.",
  },
  {
    q: "How many sponsored tools can appear at once?",
    a: `At most ${MAX_SPONSORED_TOOLS} on a search or an answer. The most relevant sponsored tools for that search take the slots.`,
  },
  {
    q: "Does Ask Celpare recommend sponsored tools in its answer?",
    a: "Sponsored tools appear as labelled cards. The written answer is not paid for and is the same with or without sponsorship.",
  },
] as const;
