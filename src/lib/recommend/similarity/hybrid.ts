import { TMR_V1 } from "../config";
import type { ToolModelEntity } from "../types";
import type { LexicalModel } from "./lexical";
import { structuredSimilarity } from "./structured";
import type { SimilarityProvider, SimilarityReading } from "./types";

/*
  The hybrid: lexical and structured, mixed per type (D175).

  When the structured side has nothing to compare (coverage 0), the value rests on
  the lexical side alone rather than being dragged toward 0 by what we do not
  know. When coverage is partial, the structured weight shrinks with it.

  EmbeddingSimilarityProvider is the seam for a vector model. It is null: the
  catalogue is too small to justify a provider, a key and a migration (D175).
*/

export const embeddingSimilarityProvider: SimilarityProvider | null = null;

export function hybridSimilarity(lexical: LexicalModel, embedding: SimilarityProvider | null = embeddingSimilarityProvider): SimilarityProvider {
  return {
    id: embedding ? "hybrid_lexical_structured_embedding_v1" : "hybrid_lexical_structured_v1",
    similarity(a: ToolModelEntity, b: ToolModelEntity): SimilarityReading {
      if (a.ref.type !== b.ref.type) return { value: 0, parts: {}, coverage: 0 };
      const lex = lexical.similarity(a, b);
      const str = structuredSimilarity.similarity(a, b);
      const mix = TMR_V1.HYBRID[a.ref.type];
      const wl = mix.lexical;
      const ws = mix.structured * str.coverage;
      let value = (wl * lex.value + ws * str.value) / (wl + ws || 1);
      /* Two tools in known, disjoint categories are different kinds of thing,
         however many words they share. */
      if (a.ref.type === "tool" && str.parts.category === 0) value *= TMR_V1.CATEGORY_MISMATCH;
      const parts: Record<string, number> = { lexical: lex.value, structured: str.value, ...prefix(str.parts) };
      if (embedding) {
        const emb = embedding.similarity(a, b);
        parts.embedding = emb.value;
        value = 0.5 * value + 0.5 * emb.value;
      }
      return { value, parts, coverage: Math.max(lex.coverage * wl, str.coverage) };
    },
  };
}

function prefix(parts: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parts)) out[`s_${k}`] = v;
  return out;
}
