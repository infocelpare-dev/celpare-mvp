import type { ToolModelEntity } from "../types";

/*
  The similarity seam (guide 17 section 5, D175).

  v1 is lexical plus structured, both computed in memory over a catalogue of
  about 77 entries. An embedding provider is declared null in hybrid.ts: when one
  exists it becomes a third term of the hybrid and no caller changes. Nothing in
  this folder is called semantic, because nothing here understands meaning; it
  compares words and recorded attributes.
*/

export type SimilarityReading = {
  /* 0..1 */
  value: number;
  /* Named contributions, for debug and reasons. */
  parts: Record<string, number>;
  /* 0..1: how much of the comparison rested on known data. 0 means the two
     entries share no attribute we could compare, not that they differ. */
  coverage: number;
};

export interface SimilarityProvider {
  id: string;
  similarity(a: ToolModelEntity, b: ToolModelEntity): SimilarityReading;
}

export const NO_SIMILARITY: SimilarityReading = { value: 0, parts: {}, coverage: 0 };
