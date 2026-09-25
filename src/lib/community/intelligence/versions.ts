import type { AlgorithmId, FeedSurface } from "./types";

/*
  The algorithm registry. Every ranked list Celpare serves names one of these,
  and feed_events records it, so last month's numbers always describe the
  algorithm that actually produced them.

  To change behaviour materially, add feed_v2 here beside feed_v1 rather than
  editing v1 in place. Small tuning of a weight inside v1 is fine and is what
  the constants in each module are for; a new objective or a new stage is a
  new version.
*/

export type AlgorithmInfo = {
  id: AlgorithmId;
  surface: FeedSurface | "shared";
  /* One line a non specialist can read. */
  objective: string;
};

export const ALGORITHMS: Record<AlgorithmId, AlgorithmInfo> = {
  feed_v1: {
    id: "feed_v1",
    surface: "for_you",
    objective: "What this person is most likely to value right now, from everyone on Celpare.",
  },
  following_v1: {
    id: "following_v1",
    surface: "following",
    objective: "What the people you follow posted, newest and unseen first, without one person taking over.",
  },
  reels_v1: {
    id: "reels_v1",
    surface: "reels",
    objective: "The next video worth watching, judged by watching rather than by likes.",
  },
  feed_v2: {
    id: "feed_v2",
    surface: "for_you",
    objective:
      "feed_v1 plus: unseen before recently seen, session and intent, novelty and saturation, quality gated exploration near known topics, escalating negative feedback, reasons from the features that drove the score.",
  },
  following_v2: {
    id: "following_v2",
    surface: "following",
    objective: "following_v1 plus the seen tiers: what you have not seen from the people you follow comes first.",
  },
  reels_v2: {
    id: "reels_v2",
    surface: "reels",
    objective: "reels_v1 plus the seen tiers and the full session: every kind of recent action shapes the next video.",
  },
  feed_v3: {
    id: "feed_v3",
    surface: "for_you",
    objective:
      "feed_v2 plus: delivered but unseen posts rotate, passing over at examined positions is a weak signal, posts the people you follow comment on and repost, two way author affinity, conversations the author joins rank above likes, engagement bait demoted, no source floods the pool, a creator's unusually good post can compete, one story shown once.",
  },
  following_v3: {
    id: "following_v3",
    surface: "following",
    objective: "following_v2 plus served rotation, dwell hygiene and one story shown once. Still a timeline first.",
  },
  distribution_v1: {
    id: "distribution_v1",
    surface: "shared",
    objective: "How far a new post travels beyond followers, widened or narrowed by how its first audience responded.",
  },
  viral_v1: {
    id: "viral_v1",
    surface: "shared",
    objective: "Posts gaining engagement much faster than their creator usually does, with a boost that fades.",
  },
  trending_v1: {
    id: "trending_v1",
    surface: "trending",
    objective: "What is gaining attention right now, by recent speed and breadth, never lifetime totals.",
  },
  rising_v1: {
    id: "rising_v1",
    surface: "rising",
    objective: "New posts that are speeding up and have not yet reached many people.",
  },
  people_v1: {
    id: "people_v1",
    surface: "people",
    objective: "People you are likely to want to follow, from your follows, your interactions and shared topics.",
  },
  content_v1: {
    id: "content_v1",
    surface: "content",
    objective: "Posts like the one you are looking at, or like the ones you saved, liked and watched.",
  },
  topics_v1: {
    id: "topics_v1",
    surface: "topics",
    objective: "Topics that match what you read, search, compare and ask about.",
  },
  discussions_v1: {
    id: "discussions_v1",
    surface: "discussions",
    objective: "Conversations worth joining: several people, real back and forth, on things you care about.",
  },
  fallback_v1: {
    id: "fallback_v1",
    surface: "shared",
    objective: "Served only when ranking failed: recent, eligible posts in time order.",
  },
};
