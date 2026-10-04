import { Plus } from "lucide-react";
import {
  INDIVIDUAL_PLANS,
  formatUsd,
  yearlyCents,
  type Audience,
} from "@/lib/pricing/plans";

/* Prices come from plans.ts so this answer cannot drift from the cards. */
const yearlyLine = (id: string) => {
  const plan = INDIVIDUAL_PLANS.find((p) => p.id === id)!;
  return `${plan.name} is ${formatUsd(yearlyCents(plan))} a year instead of ${formatUsd(plan.monthlyCents * 12)} for twelve monthly payments`;
};

/*
  Native <details>, so it opens by keyboard and works with no JavaScript.
  The refund rule is stated here in plain words on purpose: 05-pricing-plans.md
  says it must be visible where people choose a plan, not only in the terms.
*/
const COMMON = [
  {
    q: "When can I buy a paid plan?",
    a: "Paid plans are not on sale yet. Everything on the Free plan works today, and this page will let you upgrade as soon as payments open.",
  },
  {
    q: "Can I get a refund?",
    a: "You have 24 hours after paying to cancel and get your money back. After 24 hours, payments are not refunded.",
  },
  {
    q: "What currency are prices in?",
    a: "All prices are in US dollars.",
  },
];

const INDIVIDUAL = [
  {
    q: "How much do I save with yearly billing?",
    a: `${yearlyLine("pro")}, and ${yearlyLine("premium")}. You pay for the year at once.`,
  },
  {
    q: "What happens to my saved tools if I move to a smaller plan?",
    a: "Nothing is deleted. Anything over the new plan's limit stays readable, but you cannot add more until you upgrade or remove items to get back under the limit.",
  },
];

const DEVELOPERS = [
  {
    q: "What does yearly billing mean?",
    a: "You pay for twelve months at once, at the same monthly price. Developer plans have no yearly discount.",
  },
  {
    q: "Is a developer plan separate from my personal plan?",
    a: "Yes. Developer plans cover the tools you list on Celpare. Your personal plan covers how you use Celpare yourself.",
  },
];

export function PricingFaq({ audience }: { audience: Audience }) {
  const items = [
    ...(audience === "developers" ? DEVELOPERS : INDIVIDUAL),
    ...COMMON,
  ];

  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-medium tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
            {item.q}
            <Plus
              className="size-5 shrink-0 text-muted transition-transform duration-200 ease-out group-open:rotate-45"
              aria-hidden
            />
          </summary>
          <p className="max-w-[680px] pb-5 text-[15px] leading-relaxed text-muted">
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}
