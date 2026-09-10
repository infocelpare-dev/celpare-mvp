import { Search, Scale, Sparkles, Check } from "lucide-react";
import { Container, Section } from "@/components/ui/container";

/*
  This slot held "2,400+ tools / 12k users / 800+ developers / 50k comparisons"
  in the Notion landing sample. Those numbers are invented and Celpare has not
  launched, so publishing them would be a straightforward lie to visitors.
  Replaced with the product's actual core loop, which is true on day one and
  tells a first time visitor more than a fake metric would.
  Reinstate real metrics here once there are real ones.
*/
const steps = [
  {
    icon: Search,
    title: "Search",
    body: "Describe the outcome you want, not the keyword you think matters.",
  },
  {
    icon: Sparkles,
    title: "Ask",
    body: "Ask Celpare narrows thousands of tools down to the few worth your time.",
  },
  {
    icon: Scale,
    title: "Compare",
    body: "Put the finalists side by side on features, pricing and real limits.",
  },
  {
    icon: Check,
    title: "Choose",
    body: "Pick with a reason you can explain, then share what worked.",
  },
];

export function HowItWorks() {
  return (
    <Section className="border-y border-border bg-surface py-14 sm:py-16">
      <Container>
        <ol className="grid grid-cols-1 gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <s.icon
                className="mt-0.5 h-5 w-5 shrink-0 text-foreground"
                aria-hidden
              />
              <div>
                <h3 className="font-display text-[15px] font-semibold">
                  <span className="mr-2 font-mono text-[13px] text-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.title}
                </h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
