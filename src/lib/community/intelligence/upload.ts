import { tokenize } from "./text";

/*
  upload_v1: what processing learns about a post once, at upload.

  The database trigger (tg_post_intake) already took the content hash, the
  hashtags and the mentions, because those must never be skipped. What is here
  needs code rather than SQL: the language, a simhash for near duplicates, and
  the meaningful length. server/upload.ts runs it after the response and
  reports back through post_record_processing(), which decides the stage.

  NO EMBEDDINGS (D145). Near duplicates are lexical: a 64 bit simhash over words
  and word pairs, compared by Hamming distance. Two posts that say the same
  thing in different words are not caught, and that is a stated limit.
*/

export const PROCESSOR_VERSION = 1;

export const UPLOAD = {
  /* Near duplicates need enough words to mean anything: "wow" under two
     videos is two posts (the same floor diversity.ts uses). */
  MIN_TOKENS_FOR_SIMILARITY: 6,
  /* Bits that may differ for two texts to count as near copies. */
  NEAR_DUPLICATE_BITS: 3,
  /* A language is only claimed with this many stopword hits and this lead. */
  MIN_STOPWORD_HITS: 2,
} as const;

/* ------------------------------------------------------------- language */

/*
  Scripts first: a script is decisive where a stopword count is not. Then, for
  Latin text, the language whose common words appear most often. Returns an ISO
  639-1 code, or "und" (undetermined) rather than a guess.
*/
const SCRIPTS: [RegExp, string][] = [
  [/[぀-ヿ]/g, "ja"],
  [/[가-힯]/g, "ko"],
  [/[一-鿿]/g, "zh"],
  [/[؀-ۿ]/g, "ar"],
  [/[֐-׿]/g, "he"],
  [/[Ѐ-ӿ]/g, "ru"],
  [/[ऀ-ॿ]/g, "hi"],
  [/[Ͱ-Ͽ]/g, "el"],
  [/[฀-๿]/g, "th"],
];

const STOPWORDS: Record<string, string[]> = {
  en: ["the", "and", "is", "are", "was", "to", "of", "in", "that", "it", "for", "with", "this", "you", "not", "have", "but", "what", "can", "just"],
  es: ["el", "la", "los", "las", "que", "de", "y", "en", "es", "por", "para", "con", "una", "pero", "como", "muy", "esto", "está"],
  fr: ["le", "la", "les", "et", "est", "que", "des", "une", "pour", "dans", "avec", "pas", "sur", "mais", "très", "cette", "c'est"],
  de: ["der", "die", "das", "und", "ist", "nicht", "mit", "ein", "eine", "auf", "für", "auch", "sich", "aber", "sehr", "wie"],
  pt: ["o", "os", "as", "que", "de", "e", "é", "em", "um", "uma", "para", "com", "não", "mas", "muito", "isso", "está"],
  it: ["il", "lo", "gli", "che", "di", "e", "è", "un", "una", "per", "con", "non", "ma", "molto", "questo", "sono"],
  nl: ["de", "het", "een", "en", "is", "niet", "van", "dat", "met", "voor", "maar", "ook", "zijn", "wat", "heel"],
  tr: ["ve", "bir", "bu", "için", "ile", "da", "de", "çok", "ama", "ne", "gibi", "daha", "değil"],
  id: ["yang", "dan", "ini", "itu", "dengan", "untuk", "tidak", "ada", "saya", "sangat", "bisa", "juga"],
  sw: ["na", "ya", "wa", "kwa", "ni", "za", "hii", "sana", "lakini", "kama", "katika"],
};

export function detectLanguage(text: string | null | undefined): string {
  const body = (text ?? "").toLowerCase();
  if (!body.trim()) return "und";

  const letters = body.replace(/[^\p{L}]/gu, "").length;
  if (letters === 0) return "und";
  for (const [re, code] of SCRIPTS) {
    const hits = body.match(re)?.length ?? 0;
    if (hits / letters >= 0.3) return code;
  }

  const words = body.split(/[^\p{L}']+/u).filter(Boolean);
  let best = "und";
  let bestHits = 0;
  let second = 0;
  for (const [code, list] of Object.entries(STOPWORDS)) {
    const set = new Set(list);
    const hits = words.filter((w) => set.has(w)).length;
    if (hits > bestHits) {
      second = bestHits;
      bestHits = hits;
      best = code;
    } else if (hits > second) {
      second = hits;
    }
  }
  /* A tie, or too little evidence, is not a language. */
  if (bestHits < UPLOAD.MIN_STOPWORD_HITS || bestHits === second) return "und";
  return best;
}

/* ------------------------------------------------------------- simhash */

/* BigInt() rather than 1n literals: the project targets ES2017. */
const ZERO = BigInt(0);
const ONE = BigInt(1);
const FNV_OFFSET = BigInt("0xcbf29ce484222325");
const FNV_PRIME = BigInt("0x100000001b3");
const MASK64 = (ONE << BigInt(64)) - ONE;

function fnv1a64(input: string): bigint {
  let h = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    h ^= BigInt(input.charCodeAt(i));
    h = (h * FNV_PRIME) & MASK64;
  }
  return h;
}

/* Words and word pairs, so order carries some weight without making one
   inserted word change everything. */
function features(tokens: string[]): string[] {
  const out = [...tokens];
  for (let i = 0; i + 1 < tokens.length; i++) out.push(`${tokens[i]} ${tokens[i + 1]}`);
  return out;
}

/*
  64 bit simhash, returned SIGNED so it fits a Postgres bigint. Null when the
  text is too short for a near duplicate to mean anything.
*/
export function simhash64(text: string | null | undefined): bigint | null {
  const tokens = tokenize(text, 400);
  if (tokens.length < UPLOAD.MIN_TOKENS_FOR_SIMILARITY) return null;

  const v = new Array<number>(64).fill(0);
  for (const f of features(tokens)) {
    const h = fnv1a64(f);
    for (let bit = 0; bit < 64; bit++) {
      v[bit] += (h >> BigInt(bit)) & ONE ? 1 : -1;
    }
  }
  let out = ZERO;
  for (let bit = 0; bit < 64; bit++) if (v[bit] > 0) out |= ONE << BigInt(bit);
  return BigInt.asIntN(64, out);
}

export function hamming(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a) ^ BigInt.asUintN(64, b);
  let n = 0;
  while (x) {
    x &= x - ONE;
    n++;
  }
  return n;
}

export type SimhashCandidate = { postId: string; authorId: string; simhash: bigint };

/* The closest earlier post within the near duplicate distance, if any. */
export function nearestDuplicate(
  hash: bigint | null,
  candidates: SimhashCandidate[],
): { postId: string; authorId: string; score: number } | null {
  if (hash === null) return null;
  let best: { postId: string; authorId: string; score: number } | null = null;
  for (const c of candidates) {
    const d = hamming(hash, c.simhash);
    if (d > UPLOAD.NEAR_DUPLICATE_BITS) continue;
    const score = 1 - d / 64;
    if (!best || score > best.score) best = { postId: c.postId, authorId: c.authorId, score };
  }
  return best;
}

/* Meaningful words, the same measure similarity uses. */
export function tokenCount(text: string | null | undefined): number {
  return tokenize(text, 2000).length;
}

/* A video's duration as the browser read it, trusted only inside a sane range. */
export function clampDurationMs(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.round(n), 86_400_000);
}
