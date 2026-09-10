import { Container, Section, SectionHead } from "@/components/ui/container";

/* From the Notion `Landing page` page: as a user, as a founder,
   as a content creator. */
const audiences = [
  {
    label: "As a user",
    body: "Find the tool that does the specific thing you need, understand what it costs before you sign up, and see what people actually think of it.",
    points: ["Search by outcome", "Save and organise tools", "Ask Celpare"],
  },
  {
    label: "As a founder",
    body: "List your product where people are actively looking for it, and see how it compares to the alternatives buyers are weighing you against.",
    points: ["Submit your tool", "Performance analytics", "Verified badge"],
  },
  {
    label: "As a content creator",
    body: "Keep up with an ecosystem that changes weekly, and share the workflows and stacks that are working for you.",
    points: ["Post discoveries", "Build a following", "Early access to launches"],
  },
];

export function AudienceSplit() {
  return (
    <Section id="audience" className="scroll-mt-[68px] border-t border-border">
      <Container>
        <SectionHead
          title="Built for everyone around AI"
          subtitle="Whether you use AI tools, build them, or write about them."
        />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {audiences.map((a) => (
            <article
              key={a.label}
              className="flex flex-col rounded-[16px] border border-border p-6"
            >
              <span className="inline-flex w-fit rounded-full bg-accent px-3 py-1 font-display text-[13px] font-semibold text-on-accent">
                {a.label}
              </span>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                {a.body}
              </p>
              <ul className="mt-5 space-y-2 border-t border-border pt-4">
                {a.points.map((p) => (
                  <li key={p} className="text-[14px] text-foreground">
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  );
}
