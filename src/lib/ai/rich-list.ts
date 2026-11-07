/*
  Lists in Ask Celpare answers, for the line based renderer in
  components/ask/rich-text.tsx. Pure, so it is tested without React.

  The item text is the last group. NUMBERED also captures the number written.
*/
export const BULLET = /^\s*[-*+]\s+(.*)$/;
export const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;

/*
  One list, from `from` on. Models often leave a blank line between items
  ("1. A\n\n2. B"); ending the list there made every item its own list, so each
  read "1." (founder screenshot 2026-11-04). Blank lines are skipped while the
  next written line is another item of the same kind.
*/
export function collectList(
  lines: string[],
  from: number,
  marker: RegExp,
): { items: string[]; end: number } {
  const items: string[] = [];
  let i = from;
  while (i < lines.length) {
    const m = lines[i].match(marker);
    if (m) {
      items.push(m[m.length - 1]);
      i += 1;
      continue;
    }
    if (lines[i].trim() !== "") break;
    let next = i;
    while (next < lines.length && lines[next].trim() === "") next += 1;
    if (next >= lines.length || !marker.test(lines[next])) break;
    i = next;
  }
  return { items, end: i };
}

/*
  GFM pipe tables, for deep research reports (phase DR, D231). A header row,
  then a separator row of dashes, then rows until a line without a pipe. Until
  the separator has arrived mid stream it is not a table yet, and renders as a
  paragraph for that moment, which is what it is.
*/
const SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

export function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
}

export function collectTable(
  lines: string[],
  from: number,
): { header: string[]; rows: string[][]; end: number } | null {
  const head = lines[from];
  const sep = lines[from + 1];
  if (!head || !head.includes("|") || sep === undefined || !SEPARATOR.test(sep)) return null;
  const header = splitRow(head);
  if (header.length < 2) return null;
  const rows: string[][] = [];
  let i = from + 2;
  while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
    const cells = splitRow(lines[i]);
    /* Short rows are padded, long ones cut, so every row lines up. A cell of
       only punctuation (a model wrote "," for nothing) is empty. */
    rows.push(header.map((_, c) => (/^[\s,.;:_-]*$/.test(cells[c] ?? "") ? "" : (cells[c] ?? ""))));
    i += 1;
  }
  return { header, rows, end: i };
}
