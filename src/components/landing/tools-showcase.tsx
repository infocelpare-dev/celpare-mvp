import { Container, Section, SectionHead } from "@/components/ui/container";

/*
  Static list until Phase 3 puts a real `tools` table behind it. These are
  well known tools stated only by name and category, which is factual. No
  ratings, no rankings, no "trending" claim, because none of that is measured
  yet. Swap the array for a query once the directory exists.
*/
const categories = [
  { name: "Chat and reasoning", examples: "ChatGPT, Claude, Gemini" },
  { name: "Coding", examples: "Cursor, Copilot, Claude Code" },
  { name: "Image generation", examples: "Midjourney, Flux, Ideogram" },
  { name: "Video", examples: "Runway, Sora, Kling" },
  { name: "Voice and audio", examples: "ElevenLabs, Suno" },
  { name: "Search and research", examples: "Perplexity, Exa" },
  { name: "Automation", examples: "n8n, Zapier, Make" },
  { name: "Backend and data", examples: "Supabase, Neon, Pinecone" },
];

export function ToolsShowcase() {
  return (
    <Section id="tools" className="scroll-mt-[68px] border-t border-border">
      <Container>
        <SectionHead
          title="Browse by what you need to do"
          subtitle="Categories across the AI ecosystem, from writing code to generating video."
        />
        <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-[16px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => (
            <li key={c.name}>
              <div className="h-full bg-background p-5 transition-colors duration-200 ease-out hover:bg-surface">
                <h3 className="font-display text-[15px] font-semibold">
                  {c.name}
                </h3>
                <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-muted">
                  {c.examples}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-center text-[13px] text-muted">
          The full directory opens with early access.
        </p>
      </Container>
    </Section>
  );
}
