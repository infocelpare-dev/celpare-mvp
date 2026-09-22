import type { Intent, ParsedQuery } from "./types";

/*
  Query understanding. Pure functions, no database, no server import, because the
  header needs the same normalisation the server records history under.

  WHAT THIS IS NOT. It is not a classifier over an LLM and it is not meant to be:
  /ask already exists for a question that needs a model, and putting a model call
  in front of every search would make the fast path slow to guess at something
  the ranker can hedge on anyway. Intent here REORDERS tabs. It never filters,
  so a wrong guess costs position rather than results.
*/

/*
  The stop list.

  Short and boring on purpose. "best", "top" and "free" are NOT in it: on a tools
  directory those are meaningful, and the IDF cutoff in tools_tsquery already
  stops a word that appears in a quarter of the catalogue from earning a match on
  its own. That is a measured cutoff rather than a list somebody maintains.
*/
const STOP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does",
  "for", "from", "has", "have", "how", "i", "in", "into", "is", "it", "its",
  "me", "my", "of", "on", "or", "please", "so", "some", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "to", "up", "use", "using",
  "was", "what", "when", "which", "who", "will", "with", "you", "your",
]);

/*
  Normalisation. Identical rules to normalize() in telemetry.ts and to
  public.search_normalize in the database, because all three key the same thing:
  two people typing "Video Editor" and "video  editor" have run one search, and a
  history list or a popular list that splits them is wrong.

  Punctuation that carries meaning in a technical name is kept. Stripping it
  would turn gpt-4 into gpt 4, node.js into node js and c++ into c, which is the
  brief's "preserve important technical terms" made concrete.
*/
export function normalizeQuery(input: string): string {
  return input
    .normalize("NFKC")
    /* Smart quotes and dashes that a phone keyboard inserts, folded to their
       plain equivalents so a copied phrase still matches. */
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    /* Written as escapes rather than as the characters themselves, so the
       standing no em dash rule can be checked with a grep that does not trip
       over the one place the character legitimately appears. */
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

export function tokenize(normalized: string): string[] {
  return normalized
    .split(/[^a-z0-9+#._-]+/)
    .map((t) => t.replace(/^[._-]+|[._-]+$/g, ""))
    .filter((t) => t.length >= 2);
}

/* ---------------------------------------------------------------------------
   Spelling. Practical, not clever.
   --------------------------------------------------------------------------- */

/*
  Corrections for the words this catalogue is actually about.

  A general spell checker is the wrong tool here: the vocabulary is product names
  and it changes when the directory changes, so a dictionary would be wrong the
  week after it shipped. Trigram similarity in the database already catches a
  transposed or missing letter in a NAME, which is the common case.

  This list is for the words trigram cannot help with, where the misspelling is
  a different word that still matches something. It is small and it is meant to
  stay small.
*/
const SPELLING: Record<string, string> = {
  chatgtp: "chatgpt",
  chatgtb: "chatgpt",
  chagpt: "chatgpt",
  gpt4: "gpt-4",
  claud: "claude",
  clude: "claude",
  midjourny: "midjourney",
  midjorney: "midjourney",
  stabel: "stable",
  diffusen: "diffusion",
  copilit: "copilot",
  copilet: "copilot",
  githup: "github",
  langchian: "langchain",
  huggingface: "hugging face",
  imge: "image",
  vidoe: "video",
  viedo: "video",
  genarator: "generator",
  generater: "generator",
  asistant: "assistant",
  assistent: "assistant",
  codeing: "coding",
  develeoper: "developer",
  desing: "design",
  transcibe: "transcribe",
  autmation: "automation",
  alternativs: "alternatives",
  alternatve: "alternatives",
};

/* Returns a corrected query, or null when nothing needed correcting. */
export function correctSpelling(normalized: string): string | null {
  const words = normalized.split(" ");
  let changed = false;

  const fixed = words.map((word) => {
    const hit = SPELLING[word];
    if (hit && hit !== word) {
      changed = true;
      return hit;
    }
    return word;
  });

  return changed ? fixed.join(" ") : null;
}

/* ---------------------------------------------------------------------------
   Intent.
   --------------------------------------------------------------------------- */

const PERSON_WORDS = new Set([
  "developer", "developers", "engineer", "engineers", "founder", "founders",
  "designer", "designers", "creator", "creators", "researcher", "researchers",
  "people", "person", "who", "profile", "profiles", "team", "freelancer",
  "freelancers", "consultant", "consultants", "expert", "experts",
]);

const MODEL_WORDS = new Set([
  "model", "models", "llm", "llms", "checkpoint", "weights", "parameters",
  "params", "context", "tokens", "embedding", "embeddings", "multimodal",
  "opensource", "finetune", "finetuned", "inference", "quantized",
]);

const TOOL_WORDS = new Set([
  "tool", "tools", "app", "apps", "software", "platform", "platforms",
  "generator", "editor", "assistant", "builder", "ide", "extension",
  "plugin", "api", "service", "alternative", "alternatives", "best", "top",
  "free", "cheap", "cheapest", "pricing",
]);

const POST_WORDS = new Set([
  "anyone", "anybody", "thoughts", "opinion", "opinions", "experience",
  "experiences", "discussion", "post", "posts", "thread", "shipped", "built",
  "tried", "recommend", "recommendations",
]);

function detectIntent(
  normalized: string,
  terms: string[],
  handle: string | null,
): Intent {
  if (handle) return "person";

  const words = new Set(normalized.split(" "));
  const hits = (set: Set<string>) =>
    [...words].filter((w) => set.has(w)).length;

  const person = hits(PERSON_WORDS);
  const model = hits(MODEL_WORDS);
  const tool = hits(TOOL_WORDS);
  const post = hits(POST_WORDS);

  /*
    A one or two word query with no category word in it is a NAME. "Claude",
    "GitHub Copilot", "Runway". Entity intent is what makes exact matching
    dominate for those, which is section 8's whole point: "Claude" must return
    Claude above "Claude alternatives".
  */
  if (terms.length <= 2 && person + model + tool + post === 0) return "entity";

  /* "open source LLM" mentions both a model word and a tool-ish word, so the
     comparison has to be strict rather than a chain of ifs where the first one
     wins by being written first. */
  const best = Math.max(person, model, tool, post);
  if (best === 0) return "general";
  if (person === best) return "person";
  if (model === best) return "model";
  if (tool === best) return "tool";
  return "post";
}

/* ---------------------------------------------------------------------------
   The one entry point.
   --------------------------------------------------------------------------- */

export function parseQuery(input: string): ParsedQuery {
  const raw = input.trim().slice(0, 200);
  const normalized = normalizeQuery(raw);

  /* A handle, with or without the @. Only when it is the WHOLE query: "claude
     code @ameag" is a search with an address in it, not a profile lookup. */
  const handleMatch = /^@?([a-z0-9_]{3,30})$/.exec(normalized);
  const handle = normalized.startsWith("@")
    ? (handleMatch?.[1] ?? null)
    : null;

  const allTerms = tokenize(normalized);
  const terms = allTerms.filter((t) => !STOP.has(t));

  /*
    "Partial" means the last word looks unfinished, so prefix matching should
    carry more weight. A trailing space says the opposite: the person has moved
    on to the next word, so the previous one is complete.
  */
  const last = allTerms[allTerms.length - 1] ?? "";
  const partial = !raw.endsWith(" ") && last.length > 0 && last.length <= 4;

  return {
    raw,
    normalized,
    terms: terms.length > 0 ? terms : allTerms,
    allTerms,
    intent: detectIntent(normalized, terms.length > 0 ? terms : allTerms, handle),
    handle,
    corrected: correctSpelling(normalized),
    partial,
  };
}

/* The query actually sent to retrieval: the correction when there was one. */
export function retrievalQuery(parsed: ParsedQuery): string {
  return parsed.corrected ?? parsed.normalized;
}
