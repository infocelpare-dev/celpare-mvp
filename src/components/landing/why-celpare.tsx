import { Container, Section, SectionHead } from "@/components/ui/container";

/* Four cards from the Notion `Why celpare` page: why community, why compare,
   how it helps, what is different. */
const reasons = [
  {
    title: "Why community",
    body: "The AI ecosystem changes weekly. The people already using a tool in production know things no landing page will tell you. Celpare puts them next to the tools.",
  },
  {
    title: "Why compare",
    body: "Most tools look identical until you need one specific thing. Compare on features, pricing, platform support and real limits, in one table instead of twelve tabs.",
  },
  {
    title: "How it helps",
    body: "One place to find tools, understand what they actually do, and decide. No more piecing an answer together from TikTok, Reddit and a sponsored blog post.",
  },
  {
    title: "What is different",
    body: "Celpare answers a question, not a keyword. Tell it what you are trying to accomplish and it works backward to the tools that can do it.",
  },
];

export function WhyCelpare() {
  return (
    <Section id="why" className="scroll-mt-[68px]">
      <Container>
        <SectionHead
          title="Why Celpare"
          subtitle="Everything you need to discover and ship with AI."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {reasons.map((r) => (
            <article
              key={r.title}
              className="rounded-[16px] border border-border p-6 transition-colors duration-200 ease-out hover:border-foreground/25"
            >
              <h3 className="font-display text-[17px] font-semibold">
                {r.title}
              </h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted">
                {r.body}
              </p>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
}
