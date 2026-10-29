import { LEGAL_GROUPS } from "@/content/legal";
import { HELP_GROUPS } from "@/content/help";
import { OPERATOR } from "@/content/operator";

/*
  /llms.txt (llmstxt.org): one plain text index of Celpare's help and legal
  pages for AI assistants and other tools that read about Celpare (phase LEGAL,
  2026-10-07). Built from the same content as the pages, so it cannot disagree
  with them.
*/

export const dynamic = "force-static";

export function GET() {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || OPERATOR.site;
  const lines: string[] = [
    "# Celpare",
    "",
    "> Celpare is a platform for discovering, comparing and choosing AI tools and models, with Ask Celpare (an assistant that answers from the Celpare catalogue with sources), Search, Explore, Compare and a community. Right tool. Right result.",
    "",
    `Operated from ${OPERATOR.country}. Contact: ${OPERATOR.contact}.`,
    "",
  ];
  for (const [heading, groups, base] of [
    ["Help", HELP_GROUPS, "/help"],
    ["Legal", LEGAL_GROUPS, "/legal"],
  ] as const) {
    lines.push(`## ${heading}`, "");
    for (const g of groups) {
      for (const d of g.docs) lines.push(`- [${d.title}](${site}${base}/${d.slug}): ${d.description}`);
    }
    lines.push("");
  }
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
