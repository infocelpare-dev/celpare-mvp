/*
  /startups, "Grow your startup with Celpare" (D237, founder 2026-11-04).
  Two audiences on one page: startups that build with AI tools, and AI startups
  that want their own tool discovered. Features only, never numbers (D13, D30):
  nothing here claims users, listings or results Celpare has not measured.

  Developer plans, the verified badge and sponsored placement are shown here
  to everyone, at the founder's request (D238, a page level exception to D196).
*/

export type StageCard = {
  stage: string;
  title: string;
  body: string;
  link: { label: string; href: string };
  note?: string;
};

export const BUILD_STAGES: StageCard[] = [
  {
    stage: "Idea",
    title: "Know what to use before you start",
    body: "Describe the product you want to build in plain words. Ask Celpare answers with the tools and models that fit it, and says why each one fits.",
    link: { label: "Ask Celpare", href: "/ask" },
  },
  {
    stage: "Build",
    title: "Get a roadmap, one tool per step",
    body: "Deep match plans the build by phase, from design to launch, with the tool to use at each step, what it costs and where every fact came from. Written in plain words, for founders who do not code.",
    link: { label: "Try it in Ask", href: "/ask" },
    note: "Premium",
  },
  {
    stage: "Choose",
    title: "Compare before you pay",
    body: "Put tools and models side by side: pricing, features, limits and benchmarks, each with a source. Estimate what your use will cost, so you pay for one tool instead of three that overlap.",
    link: { label: "Open Compare", href: "/compare" },
  },
  {
    stage: "Run",
    title: "Keep your stack current",
    body: "AI tools change every week. Explore shows what is new and rising, collections keep your stack in one place, and the community shares what is working.",
    link: { label: "Explore", href: "/explore" },
  },
];

export const LAUNCH_STEPS: { title: string; body: string }[] = [
  {
    title: "List your tool",
    body: "Turn on Developer Mode and submit your tool with its pricing, features and media. Every listing is reviewed by a person before it goes live.",
  },
  {
    title: "Prove it is yours",
    body: "Verify that you own the tool, so you manage its page and post as it. Elite developers can request the blue tick.",
  },
  {
    title: "Launch to the community",
    body: "Announce a new feature from the tool page and post it to the feed as the tool itself, not as a personal account.",
  },
  {
    title: "Get matched to the right people",
    body: "When someone asks Ask Celpare, Search, Explore or Compare for what your tool does, it can be recommended, with the reasons it fits. Not a directory link that nobody searches.",
  },
  {
    title: "See what is working",
    body: "Developer analytics show views over a day, a week and a month, how people arrived at your tool and what they searched for, so you know what to improve.",
  },
];

export const TRUST_POINTS: { title: string; body: string }[] = [
  {
    title: "Ranked by fit, not by payment",
    body: "Recommendations follow the question. Sponsored placements are labelled and never change the organic results.",
  },
  {
    title: "Facts with a source",
    body: "Prices, plans and benchmarks carry where they came from and when they were checked.",
  },
  {
    title: "Missing means missing",
    body: "When Celpare does not know something about a tool, it says so instead of guessing or counting it against you.",
  },
];

export const STARTUP_FAQ: { q: string; a: string }[] = [
  {
    q: "Is listing my AI tool free?",
    a: "Yes. The free developer plan lists up to 2 tools. Pro and Elite add more tools, analytics, better placement and, on Elite, the blue tick. Paid plans are coming soon.",
  },
  {
    q: "How long does a listing review take?",
    a: "Every submission is reviewed by hand. You get an email when it is approved, or when it needs changes.",
  },
  {
    q: "Can I pay to rank higher?",
    a: "No. Organic results are ranked by how well a tool fits the question. Sponsored placement is separate: coming soon, always labelled Sponsored, and only shown when the tool matches what was asked.",
  },
  {
    q: "I cannot code. Is Celpare still useful?",
    a: "Yes. Ask Celpare guides and never writes code: it names the tools, explains the steps in plain words and points you to their own guides.",
  },
  {
    q: "What does Deep match add over a normal answer?",
    a: "It compares the catalogue tools for your goal, checks the web for current prices and facts, reads the best pages and returns a recommendation or a build roadmap with numbered sources. It is part of Premium.",
  },
];
