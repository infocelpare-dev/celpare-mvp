import { emptyExploreProfile, type ExploreProfile } from "../profile";
import { prepareExplore, rankExplore, rankSection, type Prepared } from "../pipeline";
import type { EntitySignals, ExploreCandidate, ExploreEntityType, ExploreFacts, ExploreSectionId } from "../types";

/*
  Test fixtures. Synthetic by necessity and labelled as such: inputs to pure
  functions, never rows in the database and never shown to anybody.
*/

export const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);
export const H = 3_600_000;
export const DAY = 24 * H;

export function signals(over: Partial<EntitySignals> = {}): EntitySignals {
  return {
    views24h: 0,
    views7d: 0,
    viewsPrev7d: 0,
    viewers7d: 0,
    viewersPrev7d: 0,
    saves7d: 0,
    savesPrev7d: 0,
    reviews7d: 0,
    compareAdds7d: 0,
    postMentions7d: 0,
    exploreImpressions30d: 0,
    exploreClicks30d: 0,
    ...over,
  };
}

type Over = {
  keys?: string[];
  group?: string | null;
  owner?: string | null;
  createdAt?: number;
  facts?: ExploreFacts;
  title?: string;
};

export function cand(type: ExploreEntityType, id: string, over: Over = {}): ExploreCandidate {
  const baseFacts: ExploreFacts =
    type === "tool" || type === "model"
      ? { listingQuality: 0.7, listingPenalty: 0, views30d: 5, saves: 1, ratingCount: 2, rating: 4.2 }
      : type === "post" || type === "video"
        ? { body: `synthetic ${id} entry`, contentQuality: 0.7, engagementQuality: 0.5, communityEligible: true, commentCount: 1, viewers: 5, completion: type === "video" ? 0.6 : undefined }
        : type === "person"
          ? { profileComplete: 1, recentPosts: 2 }
          : type === "topic"
            ? { topicPosts: 5 }
            : { categoryTools: 5 };
  return {
    key: `${type}:${id}`,
    entityType: type,
    refId: id,
    title: over.title ?? `${type} ${id}`,
    description: null,
    ownerId: over.owner ?? (type === "post" || type === "video" ? `author-${id}` : null),
    featureKeys: over.keys ?? [],
    groupKey: over.group ?? null,
    createdAt: over.createdAt ?? NOW - 60 * DAY,
    updatedAt: over.createdAt ?? NOW - 60 * DAY,
    sources: [],
    facts: { ...baseFacts, ...(over.facts ?? {}) },
  };
}

export function tool(id: string, category: string, over: Over = {}): ExploreCandidate {
  return cand("tool", id, {
    ...over,
    keys: [`tool:${id}`, `category:${category}`, ...(over.keys ?? [])],
    group: over.group ?? `category:${category}`,
  });
}

export function profile(over: {
  long?: Record<string, number>;
  short?: Record<string, number>;
  session?: Record<string, number>;
  negative?: Record<string, number>;
  userId?: string;
} = {}): ExploreProfile {
  const p = emptyExploreProfile(over.userId ?? "viewer");
  p.long = new Map(Object.entries(over.long ?? {}));
  p.short = new Map(Object.entries(over.short ?? {}));
  p.session = new Map(Object.entries(over.session ?? {}));
  p.negative = new Map(Object.entries(over.negative ?? {}));
  for (const k of p.long.keys()) p.touched.add(k);
  p.cold = p.long.size === 0 && p.short.size === 0 && p.session.size === 0;
  p.evidence = p.cold ? 0 : 10;
  return p;
}

export function prep(pool: ExploreCandidate[], prof: ExploreProfile): Prepared {
  return prepareExplore({ pool, profile: prof, now: NOW, salt: "test" });
}

export function run(pool: ExploreCandidate[], prof: ExploreProfile, section: ExploreSectionId) {
  return rankSection(prep(pool, prof), section);
}

export function runAll(pool: ExploreCandidate[], prof: ExploreProfile) {
  return rankExplore(prep(pool, prof));
}

export const keys = (r: { items: { candidate: { key: string } }[] }) => r.items.map((s) => s.candidate.key);
