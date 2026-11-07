import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Section, SectionHead } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

/*
  Real tools, each a link to its page (founder, 2026-11-06). Replaces
  ToolsShowcase, a typed list of category names that linked nowhere and said the
  directory "opens with early access" after Explore had opened.

  Every entry is an approved public.tools row with a logo_url, as of 2026-11-06,
  with the category its tool_categories row gives. Test fixtures (tag
  'test-fixture') and the throwaway submit form draft are left out on purpose.
  Static like the Ask demo, so the landing page stays a static page; a tool
  removed from the catalogue must be removed here, or its link 404s.

  No count is shown: 64 approved rows include fixtures, and a number that has to
  be explained is not worth printing (D13).

  Grouped by job, four to a row from lg, so each row reads as one kind of work.
*/

const LOGOS = "https://uckulakdtmaqgwakowyq.supabase.co/storage/v1/object/public/tool-images/logos";

const TOOLS = [
  { slug: "chatgpt", name: "ChatGPT", category: "Chat and reasoning" },
  { slug: "claude", name: "Claude", category: "Chat and reasoning" },
  { slug: "gemini", name: "Gemini", category: "Chat and reasoning" },
  { slug: "perplexity", name: "Perplexity", category: "Search and research" },
  { slug: "cursor", name: "Cursor", category: "Coding" },
  { slug: "claude-code", name: "Claude Code", category: "Coding" },
  { slug: "codex", name: "Codex", category: "Coding" },
  { slug: "github-copilot", name: "GitHub Copilot", category: "Coding" },
  { slug: "runway", name: "Runway", category: "Video" },
  { slug: "higgsfield", name: "Higgsfield", category: "Video" },
  { slug: "sora", name: "Sora", category: "Video" },
  { slug: "captions", name: "Captions", category: "Video" },
  { slug: "opusclip", name: "OpusClip", category: "Video" },
  { slug: "klap", name: "Klap", category: "Video" },
  { slug: "midjourney", name: "Midjourney", category: "Image generation" },
  { slug: "elevenlabs", name: "ElevenLabs", category: "Voice and audio" },
];

export function CatalogueTools() {
  return (
    <Section id="tools" className="scroll-mt-[68px] border-t border-border">
      <Container>
        <SectionHead
          title="Already in the catalogue"
          subtitle="Each tool has a page with what it does, what it costs and where it runs."
        />

        <ul className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {TOOLS.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/tools/${t.slug}`}
                className="group flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border border-border bg-elevated px-4 py-3 transition-colors duration-200 ease-out hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                <Image
                  src={`${LOGOS}/${t.slug}.png`}
                  alt=""
                  width={36}
                  height={36}
                  unoptimized
                  className="size-9 shrink-0 rounded-[10px] border border-border object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[15px] font-semibold">{t.name}</span>
                  <span className="block truncate text-[13px] text-muted">{t.category}</span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-muted opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex justify-center">
          <ButtonLink href="/explore" variant="outline" className="h-11 px-6 text-[15px]">
            Browse everything in Explore
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      </Container>
    </Section>
  );
}
