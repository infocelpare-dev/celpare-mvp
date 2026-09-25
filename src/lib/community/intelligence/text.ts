/*
  Content understanding, at the level Celpare can honestly do today.

  THERE ARE NO EMBEDDINGS. The database has no pgvector and nothing generates
  vectors, so "semantic similarity" here is LEXICAL: shared meaningful words,
  and near duplicate detection on word shingles. It is written behind one
  function, `similarity()`, so an embedding cosine can replace it without any
  caller changing. Calling this semantic would be the fake intelligence the
  brief rules out.
*/

const STOPWORDS = new Set(
  (
    "a an and are as at be but by for from has have i in into is it its of on or " +
    "that the this to was were will with you your we our they their them he she " +
    "his her my me so if then than there here what which who whom how when where " +
    "why can could should would just also very really about more most some any " +
    "all not no yes do does did done been being am im its it's dont don't cant " +
    "can't one two new use using used get got like make made out up down over " +
    "only own same such too now way well even back still much many"
  ).split(/\s+/),
);

/* Lowercased content words, three letters or more, capped so one essay cannot
   dominate a similarity score by sheer length. */
export function tokenize(text: string | null | undefined, cap = 80): string[] {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || raw.length > 40) continue;
    if (STOPWORDS.has(raw)) continue;
    if (/^\d+$/.test(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= cap) break;
  }
  return out;
}

/* #tags in a post, lowercased, without the #. */
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]{2,40})/gu)) {
    const tag = m[1].toLowerCase();
    if (!/^\d+$/.test(tag)) out.add(tag);
  }
  return [...out];
}

export function jaccard(a: string[] | Set<string>, b: string[] | Set<string>): number {
  const A = a instanceof Set ? a : new Set(a);
  const B = b instanceof Set ? b : new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/*
  How alike two texts are, 0..1. Lexical today (see the top of the file). The
  overlap coefficient rather than plain Jaccard, so a short post fully contained
  in a long one still reads as similar.
*/
export function similarity(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.min(A.size, B.size);
}

function shingles(text: string, size = 3): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const out = new Set<string>();
  if (words.length < size) {
    if (words.length) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(" "));
  return out;
}

/*
  feed_v3: two posts telling the same story ("Claude released a new feature",
  "New Claude feature announced today"). Lexical, like everything here, but
  entity aware: posts about the same tool or model, or sharing a salient name,
  within a few days of each other, need far less word overlap than a near
  duplicate does. Behind one function so embeddings can replace it.
*/
export type StoryItem = { body: string; createdAt: number; toolId?: string | null; modelId?: string | null };

/* Words that open sentences without naming anything. */
const OPENERS = new Set(
  "today tomorrow yesterday finally breaking update quick big huge excited happy thanks thank great hot just another".split(" "),
);

/* Capitalised words: names of things (Claude, Cursor, OpenAI). A sentence
   start counts too, since posts often open with the name; the word overlap
   test in sameStory is what guards against coincidence. */
export function salientNames(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.split(/\s+/)) {
    const w = raw.replace(/[^\p{L}\p{N}]/gu, "");
    if (w.length < 2 || !/^\p{Lu}/u.test(w)) continue;
    const lower = w.toLowerCase();
    if (!STOPWORDS.has(lower) && !OPENERS.has(lower)) out.add(lower);
  }
  return out;
}

export function sameStory(
  a: StoryItem,
  b: StoryItem,
  opts: { windowHours: number; jaccard: number; minSharedNames: number },
): boolean {
  if (Math.abs(a.createdAt - b.createdAt) > opts.windowHours * 3_600_000) return false;
  if (isNearDuplicate(a.body, b.body)) return true;
  const sameEntity = Boolean((a.toolId && a.toolId === b.toolId) || (a.modelId && a.modelId === b.modelId));
  if (!sameEntity) {
    const nb = salientNames(b.body);
    let shared = 0;
    for (const n of salientNames(a.body)) if (nb.has(n)) shared++;
    if (shared < opts.minSharedNames) return false;
  }
  return jaccard(tokenize(a.body), tokenize(b.body)) >= opts.jaccard;
}

/* The same post twice, give or take a word. Used for duplicate suppression and
   as a spam signal when one author repeats themselves. */
export function isNearDuplicate(a: string, b: string, threshold = 0.8): boolean {
  if (!a || !b) return false;
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  return jaccard(shingles(a), shingles(b)) >= threshold;
}
