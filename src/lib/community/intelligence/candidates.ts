import type { Candidate, CandidateSource, ContentItem, ReasonCode } from "./types";

/*
  Candidate retrieval, the pure half.

  Each source (following, topics, similar content, trending, fresh, ...) is a
  separate query in server/retrieval.ts and returns a plain list of items. This
  merges them: one candidate per post, remembering EVERY source that produced
  it, because "you follow them AND it matches your search" is two reasons, and
  a post found by three sources is a stronger candidate than one found by one.
*/

export type SourceList = {
  source: CandidateSource;
  items: ContentItem[];
  /* The reason a hit from this source carries, if any. */
  reason?: ReasonCode;
};

export function mergeCandidateSources(lists: SourceList[], cap = 400): Candidate[] {
  const byId = new Map<string, Candidate>();
  for (const list of lists) {
    for (const item of list.items) {
      const existing = byId.get(item.id);
      if (existing) {
        if (!existing.sources.includes(list.source)) existing.sources.push(list.source);
        if (list.reason && !existing.reasons.includes(list.reason)) existing.reasons.push(list.reason);
        continue;
      }
      if (byId.size >= cap) continue;
      byId.set(item.id, {
        item,
        sources: [list.source],
        reasons: list.reason ? [list.reason] : [],
      });
    }
  }
  return [...byId.values()];
}

/* Only the candidates of certain kinds, for surfaces that want a subset. */
export function onlyMedia(candidates: Candidate[], media: ContentItem["media"]): Candidate[] {
  return candidates.filter((c) => c.item.media === media);
}
