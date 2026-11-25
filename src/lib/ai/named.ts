/*
  Which catalogue items an answer actually names.

  Ask used to draw a card for every tool the retrieval step handed the model,
  before the model had written a word. A question about one tool's pricing
  ("TruLata pricing") still got Amazon Rufus, Upstash and DeepSeek under the
  answer, because they were in the pool (founder, 2026-11-25, ASK.NOISE). The
  cards are now chosen after the answer: an item gets a card only when the
  answer names it.

  A name counts when it appears as a whole word or phrase, ignoring case and
  markdown, so "v0" does not match "v01" and "Make" does not match "makes".
  Pure, so it is tested without a model (lib/ai/__tests__/named.test.ts).
*/

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* Bold, italics, code and link syntax hide a name from a plain match:
   "**TruLata**" or "[TruLata](/tools/trulata)". */
function plain(text: string): string {
  return text.replace(/[*_`~]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1 ");
}

export function isNamed(answer: string, name: string): boolean {
  const n = name.trim();
  if (n.length === 0) return false;
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(n)}(?=$|[^\\p{L}\\p{N}])`, "iu");
  return pattern.test(plain(answer));
}

/* Keeps the order the items came in, which is the retrieval order. */
export function namedIn<T>(answer: string, items: T[], names: (item: T) => string[]): T[] {
  if (answer.trim().length === 0) return [];
  return items.filter((item) => names(item).some((n) => isNamed(answer, n)));
}
