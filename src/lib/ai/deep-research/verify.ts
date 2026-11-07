/*
  The fact check after a deep research answer (phase DR, D231). Pure.

  Prices and percentages are where an answer is most often wrong and where
  being wrong costs the reader money. Each one in the answer is looked for in
  everything the model was given: the Compare evidence, the catalogue rows, the
  pages and snippets. One found nowhere is reported under the answer, never
  rewritten silently. Plain counts ("3 options", step numbers, years) are not
  checked: they are not claims about a product.
*/

/* A comma counts only as a thousands separator, so "$25, and" is $25. */
const FIGURE = /\$\s?\d+(?:,\d{3})*(?:\.\d+)?|\b\d+(?:\.\d+)?\s?%/g;

function digitsOf(figure: string): string {
  return figure.replace(/[$%\s,]/g, "").replace(/\.0+$/, "");
}

export function unverifiedFigures(answer: string, sources: string[]): string[] {
  const haystack = sources.join("\n").replace(/,(?=\d{3}\b)/g, "");
  const found = answer.match(FIGURE) ?? [];
  const out: string[] = [];
  for (const f of found) {
    const n = digitsOf(f);
    if (!n || n === "0") continue;
    /* The number on its own, not inside a longer one: 20 must not match 200. */
    const re = new RegExp(`(?<![\\d.])${n.replace(".", "\\.")}(?:\\.0+)?(?![\\d])`);
    if (!re.test(haystack)) {
      const label = f.replace(/\s+/g, "");
      if (!out.includes(label)) out.push(label);
    }
  }
  return out.slice(0, 8);
}
