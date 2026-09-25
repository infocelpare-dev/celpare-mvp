import { assembleFeed, fallbackRanking } from "./pipeline";
import type { Candidate, FeedResult, InterestProfile, PostSignals, SeenState } from "./types";

/*
  Reliability. The chain the brief asks for:

    personalised ranking   fails ->  eligible posts in time order (fallback_v1)
    personalisation        fails ->  the caller passes profile null, ranking runs
                                     unpersonalised (cold start behaviour)
    engagement signals     fail  ->  the caller passes an empty map, ranking runs
                                     on the public counters and freshness
    analytics (writes)     fail  ->  nothing here depends on them; a failed
                                     impression write is logged and dropped

  Content delivery never waits on or fails because of analytics, and a thrown
  ranking stage never becomes an empty feed.
*/

export function rankWithFallback(
  primary: () => FeedResult,
  input: {
    candidates: Candidate[];
    signals: Map<string, PostSignals>;
    profile: InterestProfile | null;
    pageSize: number;
    pages: number;
    seen?: SeenState;
    now?: number;
  },
  onError?: (err: unknown) => void,
): FeedResult {
  try {
    return primary();
  } catch (err) {
    onError?.(err);
    /* If even the fallback throws, that propagates. Serving posts with no
       eligibility check would expose what safety.ts exists to hold back, and an
       empty list would claim the community is empty (rule 13): the page's error
       boundary saying the feed failed is the honest outcome. */
    const ranked = fallbackRanking(input.candidates, input.signals, input.profile, input.seen, input.now);
    const { items, complete } = assembleFeed(ranked, input.pageSize, input.pages);
    return {
      items,
      complete,
      algorithm: "fallback_v1",
      variant: "control",
      experimentId: null,
      fallback: err instanceof Error ? err.message.slice(0, 120) : "ranking failed",
    };
  }
}
