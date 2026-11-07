import Image from "next/image";
import { ArrowRight, Scale } from "lucide-react";
import { Container, Section, SectionHead } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
  Compare, shown rather than described (founder, 2026-11-06: the old How it
  works, Why Celpare, categories and audience sections said nothing a visitor
  could see). Drawn in code like the Ask demo above it, and still: nothing
  moves, so there is no pause control to owe (WCAG 2.2.2).

  HONEST BY CONSTRUCTION (D13, D30, D111 to D118). Every cell is a real
  tool_plans row or tools.platforms value for cursor, codex and claude-code,
  read 2026-11-06, with the source each row cites. Codex replaced GitHub
  Copilot at the founder's request the same day. Nothing is ranked and no
  column wins. A cell with no row would be { missing: true }, drawn "Not
  recorded", never a no. When these rows change, change this table, or the
  claim under it is false.

  PHONES get one card per row (ui-ux-pro-max, Table Handling: card layout, not
  a table that overflows). From md it is a table with a label column.
*/

const LOGOS = "https://uckulakdtmaqgwakowyq.supabase.co/storage/v1/object/public/tool-images/logos";

const TOOLS = [
  { slug: "cursor", name: "Cursor", logo: `${LOGOS}/cursor.png`, tagline: "AI first code editor built on VS Code." },
  { slug: "codex", name: "Codex", logo: `${LOGOS}/codex.png`, tagline: "OpenAI's coding agent, in the CLI, your IDE and the cloud." },
  { slug: "claude-code", name: "Claude Code", logo: `${LOGOS}/claude-code.png`, tagline: "Anthropic's agentic coding tool for the terminal." },
] as const;

type Cell = { value: string; note?: string } | { missing: true };

const ROWS: { label: string; cells: [Cell, Cell, Cell] }[] = [
  {
    label: "Free plan",
    cells: [
      { value: "Yes", note: "Limited Agent and Chat requests" },
      { value: "Yes", note: "In ChatGPT Free, with usage limits" },
      { value: "No", note: "Free Claude does not include Claude Code" },
    ],
  },
  {
    label: "First paid plan",
    cells: [
      { value: "Plus, $8 a month", note: "Grok models only" },
      { value: "ChatGPT Go, $8 a month", note: "Codex with usage limits" },
      { value: "Claude Pro, $20 a month", note: "$17 a month billed annually" },
    ],
  },
  {
    label: "Team plan",
    cells: [
      { value: "Teams, $30 a user a month" },
      { value: "ChatGPT Business, $25 a user a month", note: "$20 billed annually" },
      { value: "Team, $25 a seat a month" },
    ],
  },
  {
    label: "Top individual plan",
    cells: [
      { value: "Ultra, $200 a month", note: "50x the usage of Plus" },
      { value: "ChatGPT Pro, from $100 a month", note: "$100, $200 or $500 tiers" },
      { value: "Claude Max, from $100 a month" },
    ],
  },
  {
    label: "Works in",
    cells: [
      { value: "macOS, Windows, Linux" },
      { value: "macOS, Windows, Linux, VS Code, Web" },
      { value: "macOS, Windows, Linux, VS Code, JetBrains, Web" },
    ],
  },
];

const SOURCES = [
  { label: "cursor.com/pricing", checked: "4 Nov 2026" },
  { label: "learn.chatgpt.com/docs/pricing", checked: "4 Oct 2026" },
  { label: "claude.com/pricing", checked: "4 Oct 2026" },
];

const HREF = `/compare?items=${TOOLS.map((t) => `tool:${t.slug}`).join(",")}`;

function Logo({ src, className }: { src: string; className?: string }) {
  return (
    <Image
      src={src}
      alt=""
      width={32}
      height={32}
      unoptimized
      className={cn("rounded-[9px] border border-border object-cover", className)}
    />
  );
}

function CellBody({ cell }: { cell: Cell }) {
  if ("missing" in cell) {
    return (
      <span className="inline-flex rounded-full border border-dashed border-foreground/30 px-2.5 py-0.5 text-[13px] text-muted">
        Not recorded
      </span>
    );
  }
  return (
    <>
      <span className="text-[14px] text-foreground">{cell.value}</span>
      {cell.note ? (
        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{cell.note}</span>
      ) : null}
    </>
  );
}

export function ComparePreview() {
  return (
    <Section id="compare" className="scroll-mt-[68px] border-t border-border">
      <Container>
        <SectionHead
          title="Compare before you pay"
          subtitle="Plans, limits and platforms side by side, each from the tool's own pricing page. Nothing is ranked."
        />

        <figure>
          <div className="overflow-hidden rounded-[28px] border border-border bg-surface">
            {/* App bar, as the Ask demo draws it. */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-on-primary">
                  <Scale className="size-3.5" aria-hidden />
                </span>
                <span className="font-display text-[15px] font-semibold">Compare</span>
              </div>
              <span className="truncate ps-3 font-mono text-[11px] text-muted">celpare.com/compare</span>
            </div>

            <div className="p-3 sm:p-5">
              {/* md and up: a table. Phones: the cards below. */}
              <table className="hidden w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-2xl border border-border bg-elevated text-left md:table">
                <caption className="sr-only">
                  Cursor, Codex and Claude Code compared on plans and platforms
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-[180px] border-b border-border p-4 align-bottom">
                      <span className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">
                        Coding tools
                      </span>
                    </th>
                    {TOOLS.map((t) => (
                      <th key={t.slug} scope="col" className="border-b border-l border-border p-4 align-top font-normal">
                        <div className="flex items-center gap-2.5">
                          <Logo src={t.logo} className="size-8" />
                          <span className="font-display text-[15px] font-semibold">{t.name}</span>
                        </div>
                        <p className="mt-2 text-[13px] leading-snug text-muted">{t.tagline}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, r) => (
                    <tr key={row.label}>
                      <th
                        scope="row"
                        className={cn(
                          "p-4 align-top text-[13px] font-medium text-muted",
                          r < ROWS.length - 1 && "border-b border-border",
                        )}
                      >
                        {row.label}
                      </th>
                      {row.cells.map((cell, c) => (
                        <td
                          key={TOOLS[c].slug}
                          className={cn(
                            "border-l border-border p-4 align-top",
                            r < ROWS.length - 1 && "border-b",
                          )}
                        >
                          <CellBody cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-2.5 md:hidden">
                <div className="flex items-center gap-2 px-1 pb-1">
                  {TOOLS.map((t) => (
                    <Logo key={t.slug} src={t.logo} className="size-7" />
                  ))}
                  <span className="ms-1 text-[13px] text-muted">Cursor, Codex, Claude Code</span>
                </div>
                {ROWS.map((row) => (
                  <div key={row.label} className="rounded-2xl border border-border bg-elevated p-4">
                    <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted">{row.label}</p>
                    <ul className="mt-3 space-y-3">
                      {row.cells.map((cell, c) => (
                        <li key={TOOLS[c].slug} className="flex gap-3">
                          <Logo src={TOOLS[c].logo} className="mt-0.5 size-6 shrink-0 rounded-[7px]" />
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-medium text-foreground">{TOOLS[c].name}</p>
                            <div className="mt-0.5">
                              <CellBody cell={cell} />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <p className="mt-4 px-1 text-[12px] leading-relaxed text-muted">
                Sources:{" "}
                {SOURCES.map((s, i) => (
                  <span key={s.label}>
                    <span className="font-mono">{s.label}</span>, checked {s.checked}
                    {i < SOURCES.length - 1 ? "; " : "."}
                  </span>
                ))}
              </p>
            </div>
          </div>

          <figcaption className="mt-3 text-center text-[12px] text-muted">
            A real comparison from the Celpare catalogue, with the source of every row.
          </figcaption>
        </figure>

        <div className="mt-8 flex justify-center">
          <ButtonLink href={HREF} variant="outline" className="h-11 px-6 text-[15px]">
            Open this comparison
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      </Container>
    </Section>
  );
}
