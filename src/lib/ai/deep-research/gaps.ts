import type { ResearchKind } from "./kinds";

/*
  Follow up searches for what the catalogue could not answer (phase DR). Pure.

  The Compare engine says exactly which values are not recorded for which
  candidate. A web search aimed at one of those ("Codex pricing") is worth more
  than another general angle, so the gaps go first. A build roadmap also needs
  each chosen tool's own setup guide, which only the vendor's docs have.
*/

export type Gap = { name: string; what: "pricing" | "limits" | "setup" };

/* Missing dimension ids from summaryInput mapped to a search. Only the ones a
   web page can answer; a benchmark nobody ran is not on the web either. */
export function gapFromDimension(dimension: string): Gap["what"] | null {
  const d = dimension.toLowerCase();
  if (/price|plan|cost|free|tier/.test(d)) return "pricing";
  if (/limit|quota|rate|context|platform|deploy|privacy|integration/.test(d)) return "limits";
  return null;
}

export function gapQueries(opts: {
  kind: ResearchKind;
  /* domain: the tool's own site, so "Bolt pricing" finds bolt.new and not
     hardware bolts (live test 2026-11-04). */
  missing: { name: string; dimension: string; domain?: string | null }[];
  /* Build: the tool picked for each slot, in build order. */
  picks: string[];
  already: string[];
  max: number;
}): string[] {
  const out: string[] = [];
  const seen = new Set(opts.already.map((q) => q.toLowerCase()));
  const add = (q: string) => {
    const key = q.toLowerCase();
    if (out.length >= opts.max || seen.has(key)) return;
    seen.add(key);
    out.push(q);
  };

  if (opts.kind === "build") {
    for (const p of opts.picks) add(`${p} quickstart setup guide`);
  }

  /* One query per candidate at most: two gaps on the same tool usually live on
     the same pricing page. */
  const asked = new Set<string>();
  for (const m of opts.missing) {
    const what = gapFromDimension(m.dimension);
    if (!what || asked.has(m.name)) continue;
    asked.add(m.name);
    const scope = m.domain ? ` site:${m.domain}` : " AI";
    add(what === "pricing" ? `${m.name} pricing plans${scope}` : `${m.name} limits and requirements${scope}`);
  }
  return out;
}
