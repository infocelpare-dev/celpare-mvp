import { tokenize } from "../../community/intelligence/text";
import { TMR_V1 } from "../config";
import { keysOf } from "../entity";
import type { ToolModelEntity } from "../types";
import type { SimilarityProvider, SimilarityReading } from "./types";

/*
  Lexical similarity: field weighted TF-IDF and cosine (D175).

  A token's weight in an entry is the sum of the weights of the fields it appears
  in (a word in the name counts three times a word in the description), times its
  inverse document frequency over the whole catalogue, so a word every tool uses
  ("ai", "platform") carries almost nothing. Vectors are unit length, so cosine is
  a dot product.
*/

export type SparseVector = Map<string, number>;

type FieldName = keyof typeof TMR_V1.FIELD_WEIGHT;

function fieldTexts(e: ToolModelEntity): Record<FieldName, string> {
  return {
    name: e.name,
    tagline: e.tagline ?? "",
    features: e.features.join(" "),
    tags: e.tags.filter((t) => t !== "test-fixture").join(" ").replace(/-/g, " "),
    categories: (keysOf(e, "category") ?? []).join(" ").replace(/-/g, " "),
    capabilities: (keysOf(e, "capability") ?? []).join(" ").replace(/[-_]/g, " "),
    description: e.description ?? "",
  };
}

export function termFrequencies(e: ToolModelEntity): Map<string, number> {
  const tf = new Map<string, number>();
  const texts = fieldTexts(e);
  for (const field of Object.keys(texts) as FieldName[]) {
    const w = TMR_V1.FIELD_WEIGHT[field];
    for (const t of tokenize(texts[field], field === "description" ? 60 : 30)) tf.set(t, (tf.get(t) ?? 0) + w);
  }
  return tf;
}

export function normalise(v: SparseVector): SparseVector {
  let sum = 0;
  for (const x of v.values()) sum += x * x;
  const n = Math.sqrt(sum);
  if (!(n > 0)) return new Map();
  const out: SparseVector = new Map();
  for (const [k, x] of v) out.set(k, x / n);
  return out;
}

export function cosine(a: SparseVector, b: SparseVector): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, x] of small) {
    const y = large.get(k);
    if (y !== undefined) dot += x * y;
  }
  return Math.max(0, Math.min(1, dot));
}

export type LexicalModel = SimilarityProvider & {
  vectorOf(key: string): SparseVector | undefined;
  /* A free text query as a vector in the same space, for fit and search. */
  queryVector(text: string): SparseVector;
  /* The strongest shared terms of two entries, for debug. */
  sharedTerms(a: ToolModelEntity, b: ToolModelEntity, n?: number): string[];
};

export function buildLexical(entities: ToolModelEntity[]): LexicalModel {
  const tfs = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();
  for (const e of entities) {
    const tf = termFrequencies(e);
    tfs.set(e.key, tf);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = Math.max(1, entities.length);
  const idf = (t: string) => Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1;

  const vectors = new Map<string, SparseVector>();
  for (const [key, tf] of tfs) {
    const v: SparseVector = new Map();
    for (const [t, f] of tf) v.set(t, f * idf(t));
    vectors.set(key, normalise(v));
  }

  return {
    id: "lexical_tfidf_v1",
    similarity(a, b): SimilarityReading {
      const va = vectors.get(a.key);
      const vb = vectors.get(b.key);
      if (!va || !vb || va.size === 0 || vb.size === 0) return { value: 0, parts: { lexical: 0 }, coverage: 0 };
      const value = cosine(va, vb);
      return { value, parts: { lexical: value }, coverage: 1 };
    },
    vectorOf: (key) => vectors.get(key),
    queryVector(text) {
      const v: SparseVector = new Map();
      for (const t of tokenize(text, 30)) if (df.has(t)) v.set(t, idf(t));
      return normalise(v);
    },
    sharedTerms(a, b, count = 5) {
      const va = vectors.get(a.key);
      const vb = vectors.get(b.key);
      if (!va || !vb) return [];
      return [...va.entries()]
        .filter(([t]) => vb.has(t))
        .map(([t, x]) => [t, x * (vb.get(t) ?? 0)] as const)
        .sort((p, q) => q[1] - p[1])
        .slice(0, count)
        .map(([t]) => t);
    },
  };
}
