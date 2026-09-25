import type { InterestMatch } from "./interests";
import type { Explanation, NetworkEngagement, RankingFeatures, ReasonCode } from "./types";
import type { ViralState } from "./viral";

/*
  "Why am I seeing this?", prepared and not yet shown.

  A reason is a code chosen during retrieval and ranking, and this is the only
  place it becomes words. No score, weight, rank or internal number is part of
  any of them, by construction: a label takes at most a name, never a figure.
*/

export function explainReason(code: ReasonCode, name?: string | null, count?: number | null): string {
  const who = name?.trim() || "this creator";
  /* feed_v3 social proof takes a count of people, never a name or a score. */
  const people = count && count > 1 ? `${count} people you follow` : "Someone you follow";
  switch (code) {
    case "commented_by_following":
      return `${people} commented`;
    case "reposted_by_following":
      return `${people} reposted this`;
    case "follows_author":
      return `Because you follow ${who}`;
    case "new_from_followed":
      return `New from ${who}, who you follow`;
    case "interacted_with_author":
      return `Because you interacted with ${who}`;
    case "similar_to_watched":
      return "Because you watched similar videos";
    case "similar_to_saved":
      return "Because you saved similar posts";
    case "similar_to_liked":
      return "Because you liked similar posts";
    case "topic_interest":
      return name ? `Because you read about ${name}` : "Because of topics you read about";
    case "trending_in_interests":
      return "Trending in your interests";
    case "trending":
      return "Trending on Celpare";
    case "rising":
      return "Gaining attention";
    case "reposted_by_followed":
      return `Reposted by ${who}`;
    case "popular_with_similar":
      return "Popular with people who like what you like";
    case "from_search":
      return "Related to what you searched for";
    case "fresh":
      return "New on Celpare";
    case "exploration":
      return "Something different to try";
    case "follows_you":
      return "Follows you";
    case "mutual_follows":
      return "Followed by people you follow";
    case "shared_topics":
      return "Posts about topics you follow";
    case "session_interest":
      return "Related to what you are looking at now";
    case "resurfaced":
      return "You saw this earlier";
  }
}

/* Reasons in the order a person should read them: the most personal first. */
const PRIORITY: ReasonCode[] = [
  "resurfaced",
  "follows_author",
  "new_from_followed",
  "reposted_by_followed",
  "commented_by_following",
  "reposted_by_following",
  "interacted_with_author",
  "similar_to_saved",
  "similar_to_watched",
  "similar_to_liked",
  "from_search",
  "session_interest",
  "topic_interest",
  "trending_in_interests",
  "popular_with_similar",
  "rising",
  "trending",
  "fresh",
  "exploration",
  "follows_you",
  "mutual_follows",
  "shared_topics",
];

export function primaryReason(codes: ReasonCode[]): ReasonCode | null {
  for (const p of PRIORITY) if (codes.includes(p)) return p;
  return codes[0] ?? null;
}

/*
  STRUCTURED REASONS (v2). A reason is only offered when the feature behind it
  actually entered the score above a threshold, and the primary reason is the
  one with the strongest evidence. So a post is "similar to what you saved" only
  when its similarity to a saved post (not to itself, features.ts) is what lifted
  it, and "trending in your interests" only when it broke out AND matches them.

  Two reasons override strength because they describe WHY the post is in this
  position at all: a resurfaced post is back only because nothing unseen was
  left, and an exploration pick is there on purpose, not because it matched.
*/
export const REASON_EVIDENCE = {
  AUTHOR: 0.3,
  TOPIC: 0.3,
  SIMILAR: 0.4,
  TERMS: 0.3,
  SESSION: 0.3,
  TRENDING_RELEVANCE: 0.3,
  FRESH: 0.7,
  MAX_SUPPORTING: 3,
} as const;

export type ExplainInput = {
  features: RankingFeatures;
  match: InterestMatch | null;
  similarVia: "saved" | "watched" | "liked" | null;
  ageHours: number;
  social: boolean;
  tier: "unseen" | "recently_seen";
  exploration: boolean;
  breakout: boolean;
  viralState: ViralState | null;
  /* feed_v3: counts only. A social proof reason needs the count behind it AND
     the network feature to have entered the score. */
  network?: NetworkEngagement;
};

export function explainRanking(x: ExplainInput): Explanation {
  const f = x.features;
  const c: [ReasonCode, number][] = [];

  if (f.follows) c.push([x.ageHours < 24 ? "new_from_followed" : "follows_author", 0.9]);
  if (x.social) c.push(["reposted_by_followed", 0.7]);
  /* Likes never explain (they are private); comments and reposts are public. */
  if (x.network && !f.follows && (f.socialRelevance ?? 0) > 0) {
    if (x.network.commenters > 0) c.push(["commented_by_following", 0.6 + 0.1 * Math.min(3, x.network.commenters)]);
    if (x.network.reposters > 0) c.push(["reposted_by_following", 0.55 + 0.1 * Math.min(3, x.network.reposters)]);
  }
  if (!f.follows && f.authorAffinity >= REASON_EVIDENCE.AUTHOR) c.push(["interacted_with_author", f.authorAffinity]);
  if (f.topicAffinity >= REASON_EVIDENCE.TOPIC) c.push(["topic_interest", f.topicAffinity * 0.9]);
  if (f.semantic >= REASON_EVIDENCE.SIMILAR && x.similarVia) {
    c.push([x.similarVia === "saved" ? "similar_to_saved" : x.similarVia === "watched" ? "similar_to_watched" : "similar_to_liked", f.semantic * 0.85]);
  }
  if ((x.match?.terms ?? 0) >= REASON_EVIDENCE.TERMS) c.push(["from_search", (x.match?.terms ?? 0) * 0.8]);
  if (f.sessionRelevance >= REASON_EVIDENCE.SESSION) c.push(["session_interest", f.sessionRelevance * 0.85]);
  if (x.breakout) {
    c.push(f.relevance >= REASON_EVIDENCE.TRENDING_RELEVANCE ? ["trending_in_interests", 0.6 + 0.3 * f.relevance] : ["trending", 0.5]);
  } else if (x.viralState === "rising") {
    c.push(["rising", 0.45]);
  }
  if (f.freshness >= REASON_EVIDENCE.FRESH) c.push(["fresh", 0.25]);

  c.sort((a, b) => b[1] - a[1]);
  const ranked = c.map(([code]) => code);

  if (x.tier === "recently_seen") {
    return { primary: "resurfaced", supporting: ranked.slice(0, REASON_EVIDENCE.MAX_SUPPORTING) };
  }
  if (x.exploration) {
    return { primary: "exploration", supporting: ranked.slice(0, REASON_EVIDENCE.MAX_SUPPORTING) };
  }
  return { primary: ranked[0] ?? null, supporting: ranked.slice(1, 1 + REASON_EVIDENCE.MAX_SUPPORTING) };
}
