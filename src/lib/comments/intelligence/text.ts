/*
  Text helpers for comments. No embeddings, no model, no network (V1 rule):
  word overlap for relevance, the dominant writing system for language fit, and
  character shingles for near duplicates. All pure and deterministic.
*/

const STOP = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "this", "that", "have", "has",
  "was", "were", "they", "them", "their", "what", "when", "where", "which", "who", "why", "how",
  "can", "could", "would", "should", "just", "like", "from", "into", "about", "there", "here",
  "will", "also", "than", "then", "its", "it's", "our", "out", "all", "any", "one", "too", "very",
  "really", "much", "more", "most", "some", "such", "only", "own", "same", "been", "being", "did",
  "does", "doing", "had", "his", "her", "him", "she", "yes", "yeah", "lol", "thanks", "thank",
]);

/* Distinct meaningful words, lower cased, three characters or more. */
export function terms(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'+.#-]*/gu) ?? []) {
    const w = raw.replace(/[.'-]+$/u, "");
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
  }
  return out;
}

export function sharedTerms(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n += 1;
  return n;
}

export type Script = "latin" | "cyrillic" | "greek" | "arabic" | "hebrew" | "devanagari" | "cjk" | "hangul" | "thai" | "other";

const SCRIPTS: [Script, RegExp][] = [
  ["latin", /\p{Script=Latin}/u],
  ["cyrillic", /\p{Script=Cyrillic}/u],
  ["greek", /\p{Script=Greek}/u],
  ["arabic", /\p{Script=Arabic}/u],
  ["hebrew", /\p{Script=Hebrew}/u],
  ["devanagari", /\p{Script=Devanagari}/u],
  ["cjk", /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ["hangul", /\p{Script=Hangul}/u],
  ["thai", /\p{Script=Thai}/u],
];

/* The writing system most of the letters are in, or null for a text with no
   letters at all (emoji, numbers, a link), which fits any post. */
export function dominantScript(text: string): Script | null {
  const counts = new Map<Script, number>();
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    const hit = SCRIPTS.find(([, re]) => re.test(ch));
    const s = hit ? hit[0] : "other";
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best: Script | null = null;
  let max = 0;
  for (const [s, n] of counts) {
    if (n > max || (n === max && best !== null && s < best)) {
      best = s;
      max = n;
    }
  }
  return best;
}

/* Character 4-grams of the text with case, spacing and punctuation folded, so
   "Great tool!!" and "great   tool" are the same comment. */
export function shingles(text: string): Set<string> {
  const folded = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const out = new Set<string>();
  if (folded.length < 4) {
    if (folded) out.add(folded);
    return out;
  }
  for (let i = 0; i + 4 <= folded.length; i += 1) out.add(folded.slice(i, i + 4));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function linkCount(text: string): number {
  return (text.match(/https?:\/\/|www\./gi) ?? []).length;
}
