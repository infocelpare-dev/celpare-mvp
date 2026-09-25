import { EXPLORATION, NOVELTY, SATURATION } from "./config";
import { clamp01, saturate } from "./math";
import { adjacencyTo, semantic, type TopicAdjacency } from "./semantic";
import type { ContentItem } from "./types";

/*
  Novelty, saturation and exploration value.

  NOVELTY: a post can be relevant and still feel like the fifth copy of the
  same thing. How much of its topic, its creator, its format and its wording the
  person has had in front of them recently is subtracted from 1.

  SATURATION: a SESSION effect. Four AI coding posts in a sitting make the
  fifth less welcome right now; the long term interest in AI coding is not
  touched, and tomorrow it is back at full strength.

  EXPLORATION VALUE: what makes an unfamiliar post a good one to try. Adjacent
  to known topics, good quality, fresh, from a creator the person has not met,
  in a format they have seen less of. Never low quality.
*/

export type Exposure = {
  topicCounts: Map<string, number>;
  authorCounts: Map<string, number>;
  mediaCounts: Map<string, number>;
  /* Bodies of posts recently shown or consumed, for wording similarity. */
  bodies: string[];
  total: number;
};

export const NO_EXPOSURE: Exposure = {
  topicCounts: new Map(),
  authorCounts: new Map(),
  mediaCounts: new Map(),
  bodies: [],
  total: 0,
};

export function noveltyOf(item: ContentItem, exposure: Exposure): number {
  if (exposure.total === 0) return 1;
  const topic = item.topicId ? saturate(exposure.topicCounts.get(item.topicId) ?? 0, NOVELTY.TOPIC_SCALE) : 0;
  const author = saturate(exposure.authorCounts.get(item.authorId) ?? 0, NOVELTY.AUTHOR_SCALE);
  const media = exposure.total >= 4 ? (exposure.mediaCounts.get(item.media) ?? 0) / exposure.total : 0;
  let words = 0;
  for (const b of exposure.bodies) {
    words = Math.max(words, semantic.similarity(b, item.body));
    if (words >= 0.99) break;
  }
  return clamp01(
    1 - (NOVELTY.W_TOPIC * topic + NOVELTY.W_AUTHOR * author + NOVELTY.W_SEMANTIC * words + NOVELTY.W_MEDIA * media),
  );
}

/* 0 until a topic passes the session threshold, then rising. */
export function saturationOf(item: ContentItem, sessionTopicCounts: Map<string, number>): number {
  if (!item.topicId) return 0;
  const n = sessionTopicCounts.get(item.topicId) ?? 0;
  if (n < SATURATION.TOPIC_THRESHOLD) return 0;
  return saturate(n - SATURATION.TOPIC_THRESHOLD + 1, SATURATION.SCALE);
}

export function explorationValue(
  item: ContentItem,
  input: {
    adjacency: TopicAdjacency;
    userTopics: string[];
    contentQuality: number;
    engagementQuality: number;
    freshness: number;
    knownAuthor: boolean;
    exposure: Exposure;
  },
): number {
  if (input.contentQuality < EXPLORATION.MIN_CONTENT_QUALITY) return 0;
  const adjacency = adjacencyTo(input.adjacency, item.topicId, input.userTopics);
  const quality = 0.5 * input.contentQuality + 0.5 * input.engagementQuality;
  const newCreator = input.knownAuthor ? 0 : 1;
  const mediaShare = input.exposure.total ? (input.exposure.mediaCounts.get(item.media) ?? 0) / input.exposure.total : 0;
  return clamp01(
    EXPLORATION.W_ADJACENCY * adjacency +
      EXPLORATION.W_QUALITY * quality +
      EXPLORATION.W_FRESHNESS * input.freshness +
      EXPLORATION.W_NEW_CREATOR * newCreator +
      EXPLORATION.W_MEDIA_NOVELTY * (1 - mediaShare),
  );
}
