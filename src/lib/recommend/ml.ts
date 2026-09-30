import type { CatalogueIndex } from "./catalogue";
import type { SimilarityProvider } from "./similarity/types";
import type { EntityRef, RecommendationRequest, Strategy, ToolModelEntity } from "./types";
import type { UserContext, UserSequence } from "./user";

/*
  The seams for learned models (guide 17 section 15).

  EVERY ONE IS NULL, AND ON PURPOSE. With 53 real tools, 10 real models and six
  accounts there is nothing to train on, and returning heuristic numbers under a
  model's name would be a pretence (the same honesty as mlExploreScorer). Each
  seam states what it would return and what it needs first. The pipeline reads
  each through a function that falls back to the v1 behaviour, so filling one is
  a change in this file, not a rewrite.
*/

/* Phase B, learning to rank (LightGBM, XGBoost, LambdaMART). Returns the same
   named parts a strategy produces, or a predicted value per candidate. Needs the
   FeatureLogger below to have stored parts per impression, and thousands of
   labelled impressions. */
export interface RankerModel {
  id: string;
  strategy: Strategy;
  predict(features: Record<string, number>[]): number[];
}
export const rankerModel: RankerModel | null = null;

/* Phase C, embeddings and two tower retrieval. */
export interface EntityEncoder {
  id: string;
  dimensions: number;
  encode(entity: ToolModelEntity): Float32Array;
}
export interface UserEncoder {
  id: string;
  dimensions: number;
  encode(user: UserContext): Float32Array;
}
export interface EmbeddingRetriever {
  id: string;
  nearest(vector: Float32Array, k: number, types: EntityRef["type"][]): { ref: EntityRef; score: number }[];
}
export const entityEncoder: EntityEncoder | null = null;
export const userEncoder: UserEncoder | null = null;
export const embeddingRetriever: EmbeddingRetriever | null = null;
export type { SimilarityProvider };

/* Phase D, sequential recommendation over the ordered interaction list. */
export interface SequenceModel {
  id: string;
  nextLikely(sequence: UserSequence, k: number): { ref: EntityRef; probability: number }[];
}
export const sequenceModel: SequenceModel | null = null;

/* Phase E, contextual bandits. v1's policy is the deterministic single slot in
   pipeline.ts; a bandit replaces the choice of which candidate fills it. */
export interface ExplorationPolicy {
  id: string;
  choose(options: EntityRef[], context: { userId: string | null; strategy: Strategy }): EntityRef | null;
}
export const explorationPolicy: ExplorationPolicy | null = null;

/*
  Phase F, grounded generative recommendation. A language model may propose
  candidate CONCEPTS ("a terminal coding agent"); ground() must resolve each to a
  real catalogue entry or drop it. Nothing ungrounded ever leaves the engine
  (brief sections 17 and 27): the default grounding below is the rule.
*/
export interface GenerativeCandidateProvider {
  id: string;
  propose(request: RecommendationRequest): Promise<{ name: string; why: string }[]>;
}
export const generativeCandidateProvider: GenerativeCandidateProvider | null = null;

export function ground(proposals: { name: string }[], index: CatalogueIndex): EntityRef[] {
  const out: EntityRef[] = [];
  for (const p of proposals) {
    const name = p.name.trim().toLowerCase();
    const hit = index.list.find((e) => !e.fixture && (e.name.toLowerCase() === name || e.slug === name || e.aliases.includes(name)));
    if (hit && !out.some((r) => r.id === hit.ref.id)) out.push(hit.ref);
  }
  return out;
}

/* Phase B prerequisite: storing each served candidate's parts so a ranker can
   learn from them. A no-op in v1; turning it on is a storage decision (volume,
   retention G9) before it is a code change. */
export interface FeatureLogger {
  log(requestId: string, rows: { key: string; parts: Record<string, number>; position: number }[]): void;
}
export const featureLogger: FeatureLogger = { log() {} };
