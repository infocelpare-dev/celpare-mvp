import { similarity, tokenize } from "./text";
import type { ContentItem } from "./types";

/*
  Semantic similarity, behind one interface.

  CELPARE HAS NO EMBEDDINGS TODAY: no pgvector, nothing that produces vectors.
  So the only provider is LEXICAL (shared meaningful words, text.ts), and it is
  named that way. An embedding provider plugs in as a second SemanticProvider;
  withFallback() makes sure a failed embedding call degrades to lexical instead
  of failing the feed. Nothing here calls an external service.
*/

export interface SemanticProvider {
  id: string;
  similarity(a: string, b: string): number;
}

export const lexicalProvider: SemanticProvider = {
  id: "lexical_v1",
  similarity,
};

/* The slot an embedding provider fills. Empty on purpose (see the top). */
export const embeddingProvider: SemanticProvider | null = null;

export function withFallback(primary: SemanticProvider | null, fallback: SemanticProvider = lexicalProvider): SemanticProvider {
  if (!primary) return fallback;
  return {
    id: `${primary.id}+${fallback.id}`,
    similarity(a, b) {
      try {
        const v = primary.similarity(a, b);
        return Number.isFinite(v) ? v : fallback.similarity(a, b);
      } catch {
        return fallback.similarity(a, b);
      }
    },
  };
}

export const semantic: SemanticProvider = withFallback(embeddingProvider);

/*
  Topic adjacency, learned from the content itself rather than a hand written
  map: each topic's vocabulary is the words its posts use, and two topics are
  adjacent when their vocabularies overlap. "Agents" and "Code" share words like
  model, tool and prompt; "Images" and "Audio" share far fewer. Computed from
  the candidate pool, so it follows what people actually write about, and it
  generalises: more posts make it sharper, not different.
*/
export type TopicAdjacency = Map<string, Map<string, number>>;

export function topicAdjacency(items: Pick<ContentItem, "topicId" | "body">[], vocab = 40): TopicAdjacency {
  const counts = new Map<string, Map<string, number>>();
  for (const i of items) {
    if (!i.topicId) continue;
    const m = counts.get(i.topicId) ?? new Map<string, number>();
    for (const t of tokenize(i.body, 60)) m.set(t, (m.get(t) ?? 0) + 1);
    counts.set(i.topicId, m);
  }
  const top = new Map<string, Set<string>>();
  for (const [topic, m] of counts) {
    top.set(topic, new Set([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, vocab).map(([w]) => w)));
  }
  const out: TopicAdjacency = new Map();
  const topics = [...top.keys()];
  for (const a of topics) {
    const row = new Map<string, number>();
    for (const b of topics) {
      if (a === b) continue;
      const A = top.get(a)!;
      const B = top.get(b)!;
      let inter = 0;
      for (const w of A) if (B.has(w)) inter++;
      const denom = Math.min(A.size, B.size);
      if (denom > 0 && inter > 0) row.set(b, inter / denom);
    }
    out.set(a, row);
  }
  return out;
}

/* How adjacent a topic is to any of the person's topics, 0..1. */
export function adjacencyTo(adj: TopicAdjacency, topicId: string | null, userTopics: string[]): number {
  if (!topicId || userTopics.length === 0) return 0;
  if (userTopics.includes(topicId)) return 0;
  const row = adj.get(topicId);
  if (!row) return 0;
  let best = 0;
  for (const t of userTopics) best = Math.max(best, row.get(t) ?? 0);
  return best;
}
