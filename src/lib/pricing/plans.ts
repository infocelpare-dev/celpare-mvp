import { PLAN_LIMITS } from "../ai/config";

/*
  Every plan on /pricing, in one place. Source: the Notion page `Pricing of
  celpare`, distilled in docs/context/05-pricing-plans.md. Nothing here is
  invented (D13): where Notion is vague the copy stays vague, and where it is
  ambiguous ("Premium-only verify") the line is left out and tracked as G65.

  Prices are integer cents so no float ever reaches a price. A plan with its own
  yearly price (founder, 2026-10-04: Pro $89.99, Premium $199.99) is cheaper
  than twelve monthly payments and shows the saving; a plan without one bills
  yearly at exactly twelve months (D197, superseding the no discount part of
  D195). Savings are computed, never typed, and the percentage rounds down so
  the page never claims more than the real saving.

  Usage is relative ("More messages than Free"), never a number, because the
  per plan message caps are still unconfirmed (G24).

  The individual caps that the database enforces (saved tools, collections) are
  read from PLAN_LIMITS so this page cannot quietly promise a different number.
  Developer caps are not modelled anywhere yet (G37), so they are copy only.
*/

export type Audience = "individual" | "developers";
export type Billing = "monthly" | "yearly";

export type PricingPlan = {
  /* For individual plans this is profiles.plan, so "Current plan" can match. */
  id: string;
  name: string;
  tagline: string;
  bestFor?: string;
  monthlyCents: number;
  /* The price for a year paid at once, when it differs from twelve months. */
  yearlyCents?: number;
  /* "Everything in <name>, plus:" heads the list when set. */
  includesFrom?: string;
  features: string[];
};

/* A comparison cell: included, not included, or a short value. */
export type Cell = boolean | string;

export type CompareGroup = {
  title: string;
  rows: { label: string; cells: Cell[] }[];
};

const cap = (n: number) => (Number.isFinite(n) ? String(n) : "Unlimited");

const free = PLAN_LIMITS.free;
const pro = PLAN_LIMITS.pro;
const premium = PLAN_LIMITS.premium;

const savedToolsLine = (n: number) =>
  Number.isFinite(n) ? `Save up to ${n} tools` : "Unlimited saved tools";
const collectionsLine = (n: number) =>
  !Number.isFinite(n)
    ? "Unlimited collections"
    : n === 1
      ? "1 collection"
      : `${n} collections`;

export const INDIVIDUAL_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Find the right tool",
    monthlyCents: 0,
    features: [
      "Ask Celpare, the AI chat",
      "Tool pages, trending tools and videos",
      "Community access",
      savedToolsLine(free.savedTools),
      collectionsLine(free.collections),
      "Recently viewed, last 5",
      "Basic recommendations",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For people who choose tools every week",
    monthlyCents: 799,
    yearlyCents: 8999,
    includesFrom: "Free",
    features: [
      "More messages than Free",
      savedToolsLine(pro.savedTools),
      collectionsLine(pro.collections),
      "Advanced filters",
      "Advanced tool comparison",
      "Priority recommendations",
      "Pick of the Week",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "For research and the biggest tasks",
    monthlyCents: 1999,
    yearlyCents: 19999,
    includesFrom: "Pro",
    features: [
      "Research mode",
      "Larger tasks and the most messages",
      savedToolsLine(premium.savedTools),
      collectionsLine(premium.collections),
      "Exclusive AI ranking",
      "Premium analytics for tools",
    ],
  },
];

export const DEVELOPER_PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Perfect for getting started",
    monthlyCents: 0,
    features: [
      "Submit up to 2 AI tools",
      "Basic tool listing",
      "Up to 10 promotional videos",
      "Basic performance analytics",
      "Access to community discussions",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For developers looking to grow their audience",
    bestFor: "Solo developers and small teams",
    monthlyCents: 2000,
    includesFrom: "Free",
    features: [
      "Submit up to 5 AI tools",
      "Up to 10 videos per tool",
      "Featured in category pages",
      "Higher visibility in search results",
      "Advanced analytics",
      "Priority placement in listings",
      "Developer insights dashboard",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    tagline: "Maximum reach and exposure",
    bestFor: "Companies that want maximum reach and exposure",
    monthlyCents: 5000,
    includesFrom: "Pro",
    features: [
      "Unlimited AI tools",
      "Developer badge",
      "Request the blue verified tick for your tools",
      "Unlimited promotional content",
      "Top search priority",
      "Faster approval queue",
      "Social media promotion opportunities",
      "Early access to new features",
      "Priority customer support",
    ],
  },
];

export const INDIVIDUAL_COMPARE: CompareGroup[] = [
  {
    title: "Ask Celpare",
    rows: [
      { label: "AI chat", cells: ["Included", "More messages", "Most messages"] },
      { label: "Larger tasks", cells: [false, false, true] },
      { label: "Research mode", cells: [false, false, true] },
    ],
  },
  {
    title: "Saving",
    rows: [
      { label: "Saved tools", cells: [cap(free.savedTools), cap(pro.savedTools), cap(premium.savedTools)] },
      { label: "Collections", cells: [cap(free.collections), cap(pro.collections), cap(premium.collections)] },
      { label: "Recently viewed", cells: ["Last 5", true, true] },
    ],
  },
  {
    title: "Discovery",
    rows: [
      { label: "Tool pages, trending and videos", cells: [true, true, true] },
      { label: "Community", cells: [true, true, true] },
      { label: "Recommendations", cells: ["Basic", "Priority", "Exclusive AI ranking"] },
      { label: "Filters", cells: ["Basic", "Advanced", "Advanced"] },
      { label: "Pick of the Week", cells: [false, true, true] },
    ],
  },
  {
    title: "Compare and analytics",
    rows: [
      { label: "Tool comparison", cells: ["View", "Advanced", "Advanced"] },
      { label: "Premium analytics for tools", cells: [false, false, true] },
    ],
  },
];

export const DEVELOPER_COMPARE: CompareGroup[] = [
  {
    title: "Listing",
    rows: [
      { label: "AI tools", cells: ["2", "5", "Unlimited"] },
      { label: "Videos", cells: ["10 promotional", "10 per tool", "Unlimited"] },
      { label: "Placement", cells: ["Basic listing", "Featured in category pages", "Top search priority"] },
      { label: "Higher visibility in search", cells: [false, true, true] },
      { label: "Approval queue", cells: ["Standard", "Standard", "Faster"] },
    ],
  },
  {
    title: "Insight",
    rows: [
      { label: "Analytics", cells: ["Basic", "Advanced", "Advanced"] },
      { label: "Developer insights dashboard", cells: [false, true, true] },
    ],
  },
  {
    title: "Trust and reach",
    rows: [
      /* Elite only. The tick is requested from the tool page and accepted by
         an admin (D201); Free and Pro are told to get Elite first. */
      { label: "Developer badge", cells: [false, false, true] },
      { label: "Verified tool badge (blue tick)", cells: [false, false, "On request"] },
      { label: "Social media promotion", cells: [false, false, true] },
      { label: "Early access to new features", cells: [false, false, true] },
      { label: "Priority customer support", cells: [false, false, true] },
    ],
  },
];

export function plansFor(audience: Audience) {
  return audience === "developers"
    ? { plans: DEVELOPER_PLANS, compare: DEVELOPER_COMPARE }
    : { plans: INDIVIDUAL_PLANS, compare: INDIVIDUAL_COMPARE };
}

export function yearlyCents(plan: PricingPlan) {
  return plan.yearlyCents ?? plan.monthlyCents * 12;
}

/* What a year of monthly payments would cost against the yearly price. Null
   when there is no saving, so nothing is shown rather than "Save 0%". */
export function yearlySaving(plan: PricingPlan) {
  const full = plan.monthlyCents * 12;
  const cents = full - yearlyCents(plan);
  if (cents <= 0) return null;
  return { cents, fullCents: full, percent: Math.floor((cents / full) * 100) };
}

/* The largest saving in a set of plans, for the Yearly switch's badge. */
export function bestYearlyPercent(plans: PricingPlan[]) {
  const best = Math.max(0, ...plans.map((p) => yearlySaving(p)?.percent ?? 0));
  return best > 0 ? best : null;
}

/* "$7.99", "$20", "$95.88". Whole dollars drop the cents, as Notion writes them. */
export function formatUsd(cents: number) {
  const dollars = cents / 100;
  return `$${cents % 100 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}
