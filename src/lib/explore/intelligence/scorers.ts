import { clamp01, saturate } from "../../community/intelligence/math";
import { bayesianRating } from "../../search/ranking";
import type { FeatureReading } from "./features";
import type { Momentum } from "./momentum";
import type { ExploreCandidate, ExploreEntityType } from "./types";

/*
  Entity scorers (D150). A tool, a model, a post, a video, a person and a topic
  are different objects, so each type turns the shared features and its own
  facts into NAMED PARTS, 0..1. A section objective (objectives.ts) then weighs
  the parts it cares about. There is no universal score.

  EntityScorer is the seam a trained model fills later: a learned scorer would
  return the same named parts (or predicted probabilities mapped onto them).
  mlExploreScorer is declared and null, the same honest seam as the feed's
  mlScorer: returning heuristic numbers under an ML name would be a pretence.
*/

export type ScoreParts = Record<string, number>;

export interface EntityScorer {
  id: string;
  parts(c: ExploreCandidate, r: FeatureReading, m: Momentum): ScoreParts;
}

/* The parts every type shares. */
function shared(r: FeatureReading, m: Momentum): ScoreParts {
  const f = r.features;
  return {
    relevance: Math.max(f.personalRelevance, f.sessionRelevance),
    novelty: f.novelty,
    quality: f.quality,
    freshness: f.freshness,
    discovery: clamp01(0.6 * f.discoveryDistance + (r.newTerritory ? 0.4 : 0)),
    momentum: f.momentum,
    network: f.networkProof,
    popularity: f.popularity,
    attention: m.attention,
    audience: m.audience,
    acceleration: m.acceleration,
    growth: m.growth,
    exploration: clamp01(f.discoveryDistance * f.quality),
    similarity: Math.max(f.similarity, f.sessionRelevance),
  };
}

export const heuristicToolScorer: EntityScorer = {
  id: "tool_heuristic_v1",
  parts(c, r, m) {
    const f = c.facts;
    const s = f.signals;
    return {
      ...shared(r, m),
      evidence: clamp01(0.6 * bayesianRating(f.rating ?? null, f.ratingCount ?? 0) + 0.4 * saturate(f.reviews ?? 0, 5)),
      engagement: saturate((f.saves ?? 0) + (f.reviews ?? 0), 5),
      early: s ? saturate(s.views7d + 3 * s.saves7d + 2 * s.compareAdds7d, 6) : 0,
    };
  },
};

export const heuristicModelScorer: EntityScorer = {
  id: "model_heuristic_v1",
  parts(c, r, m) {
    const f = c.facts;
    const s = f.signals;
    return {
      ...shared(r, m),
      /* Benchmark and evaluation evidence recorded with a source (4AV). Price is
         never a part: token prices and tool plans are not comparable. */
      evidence: saturate(2 * (f.verifiedEvaluations ?? 0) + (f.evaluations ?? 0), 6),
      engagement: saturate(f.saves ?? 0, 3),
      early: s ? saturate(s.views7d + 3 * s.saves7d + 2 * s.compareAdds7d, 4) : 0,
    };
  },
};

export const heuristicPostScorer: EntityScorer = {
  id: "post_heuristic_v1",
  parts(c, r, m) {
    const f = c.facts;
    return {
      ...shared(r, m),
      engagement: f.engagementQuality ?? 0,
      conversation: f.conversation ?? 0,
      early: f.engagementQuality ?? 0,
      shares: f.shareRate ?? 0,
      creator: f.perfScore ? clamp01(f.perfScore / 2) : 0.5,
    };
  },
};

export const heuristicVideoScorer: EntityScorer = {
  id: "video_heuristic_v1",
  parts(c, r, m) {
    const f = c.facts;
    return {
      ...shared(r, m),
      engagement: f.engagementQuality ?? 0,
      completion: f.completion ?? 0,
      shares: clamp01((f.shareRate ?? 0) + 0.5 * (f.rewatch ?? 0)),
      early: clamp01(0.5 * (f.engagementQuality ?? 0) + 0.5 * (f.completion ?? 0)),
      creator: f.perfScore ? clamp01(f.perfScore / 2) : 0.5,
    };
  },
};

export const heuristicPersonScorer: EntityScorer = {
  id: "person_heuristic_v1",
  parts(c, r, m) {
    const f = c.facts;
    /* Relationship from people_v1 (mutual follows, follows you, interaction,
       shared topics). Follower count is never an input (brief 17). */
    const relationship = clamp01(
      Math.max(
        f.peopleScore ?? 0,
        0.5 * saturate(f.mutualFollows ?? 0, 2) + (f.followsViewer ? 0.4 : 0) + 0.3 * (f.interaction ?? 0),
      ),
    );
    return {
      ...shared(r, m),
      relationship,
      activity: saturate(f.recentPosts ?? 0, 3),
      early: saturate(f.recentPosts ?? 0, 2),
    };
  },
};

export const heuristicTopicScorer: EntityScorer = {
  id: "topic_heuristic_v1",
  parts(c, r, m) {
    return { ...shared(r, m), early: saturate(c.facts.topicUnits7d ?? 0, 5) };
  },
};

export const SCORERS: Record<ExploreEntityType, EntityScorer> = {
  tool: heuristicToolScorer,
  model: heuristicModelScorer,
  post: heuristicPostScorer,
  video: heuristicVideoScorer,
  person: heuristicPersonScorer,
  topic: heuristicTopicScorer,
  category: heuristicTopicScorer,
};

/* The slot a trained ranker fills. Deliberately null (brief section 32). */
export const mlExploreScorer: EntityScorer | null = null;

export function scorerFor(type: ExploreEntityType): EntityScorer {
  return mlExploreScorer ?? SCORERS[type];
}
