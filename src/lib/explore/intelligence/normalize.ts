import { conversationQuality, contentQuality, engagementQuality, audienceOf, baitRisk } from "../../community/intelligence/quality";
import { average, totalUniq, total } from "../../community/intelligence/signals";
import { extractHashtags, tokenize } from "../../community/intelligence/text";
import type { ContentItem, PostSignals } from "../../community/intelligence/types";
import { penaltyOf, qualityOf } from "../../search/ranking";
import type { ModelCandidate, PersonCandidate, ToolCandidate } from "../../search/types";
import type { EntitySignals, ExploreCandidate, ExploreSource, NetworkProof } from "./types";

/*
  Existing records to ExploreCandidate. Nothing is copied into a table: the
  candidate carries a reference (refId) and the few facts ranking reads.

  Every mapping reuses the owner's own definitions: a tool's listing quality is
  search's qualityOf, a post's engagement quality is Community Intelligence's
  engagementQuality. Explore does not form a second opinion about either.
*/

const lower = (s: string) => s.trim().toLowerCase();
const at = (iso: string | null | undefined, fallback = 0) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : fallback;
};
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

export function candidateKey(type: ExploreCandidate["entityType"], id: string): string {
  return `${type}:${id}`;
}

export type ToolExtra = {
  developerId?: string | null;
  canonicalDomain?: string | null;
  signals?: EntitySignals;
  network?: NetworkProof;
  sources?: ExploreSource[];
};

export function fromTool(t: ToolCandidate, extra: ToolExtra = {}): ExploreCandidate {
  const categories = t.categories.map(lower);
  const tags = t.tags.map(lower);
  const created = at(t.publishedAt, at(t.createdAt));
  return {
    key: candidateKey("tool", t.id),
    entityType: "tool",
    refId: t.id,
    title: t.name,
    description: t.tagline ?? t.description,
    ownerId: extra.developerId ?? null,
    featureKeys: uniq([
      `tool:${t.id}`,
      ...categories.map((c) => `category:${c}`),
      ...tags.map((g) => `tag:${g}`),
      ...tokenize(`${t.name} ${t.tagline ?? ""} ${t.tags.join(" ")} ${t.features.join(" ")}`, 16).map((w) => `term:${w}`),
    ]),
    groupKey: categories[0] ? `category:${categories[0]}` : null,
    createdAt: created,
    updatedAt: created,
    sources: extra.sources ?? [],
    facts: {
      rating: t.rating,
      ratingCount: t.ratingCount,
      listingQuality: qualityOf(t),
      listingPenalty: penaltyOf(t),
      canonicalDomain: extra.canonicalDomain ?? null,
      viewsTotal: t.engagement.viewsTotal,
      views30d: t.engagement.views30d,
      saves: t.engagement.saves,
      reviews: t.engagement.reviews,
      mentions: t.engagement.mentions,
      signals: extra.signals,
      network: extra.network,
    },
  };
}

export type ModelExtra = {
  developerId?: string | null;
  family?: string | null;
  openWeights?: boolean | null;
  lifecycle?: string | null;
  evaluations?: number;
  verifiedEvaluations?: number;
  signals?: EntitySignals;
  network?: NetworkProof;
  sources?: ExploreSource[];
};

export function fromModel(m: ModelCandidate, extra: ModelExtra = {}): ExploreCandidate {
  const created = at(m.createdAt);
  const provider = m.provider ? lower(m.provider) : null;
  return {
    key: candidateKey("model", m.id),
    entityType: "model",
    refId: m.id,
    title: m.name,
    description: m.description,
    ownerId: extra.developerId ?? null,
    featureKeys: uniq([
      `model:${m.id}`,
      ...(provider ? [`provider:${provider}`] : []),
      ...m.modalities.map((x) => `modality:${lower(x)}`),
      ...m.tags.map((g) => `tag:${lower(g)}`),
      ...tokenize(`${m.name} ${m.tags.join(" ")} ${m.modalities.join(" ")}`, 12).map((w) => `term:${w}`),
    ]),
    groupKey: provider ? `provider:${provider}` : null,
    createdAt: created,
    updatedAt: created,
    sources: extra.sources ?? [],
    facts: {
      provider: m.provider,
      family: extra.family ?? null,
      contextWindow: m.contextWindow,
      hasPrice: m.inputPrice !== null || m.outputPrice !== null,
      openWeights: extra.openWeights ?? null,
      lifecycle: extra.lifecycle ?? null,
      evaluations: extra.evaluations ?? 0,
      verifiedEvaluations: extra.verifiedEvaluations ?? 0,
      listingQuality: qualityOf(m),
      listingPenalty: penaltyOf(m),
      viewsTotal: m.engagement.viewsTotal,
      views30d: m.engagement.views30d,
      saves: m.engagement.saves,
      reviews: m.engagement.reviews,
      mentions: m.engagement.mentions,
      signals: extra.signals,
      network: extra.network,
    },
  };
}

export type PostExtra = {
  isVideo: boolean;
  /* Community Intelligence's own eligibility (safety.ts), decided by the caller
     with the viewer's community profile. */
  eligible: boolean;
  ineligibleReason?: string | null;
  stage?: string | null;
  perfScore?: number | null;
  spam?: number | null;
  duplicateOf?: string | null;
  nearDuplicateOf?: string | null;
  trendRank?: number | null;
  risingRank?: number | null;
  network?: NetworkProof;
  sources?: ExploreSource[];
};

export function fromPost(item: ContentItem, signals: PostSignals, extra: PostExtra): ExploreCandidate {
  const type = extra.isVideo ? "video" : "post";
  const eq = engagementQuality(signals, item);
  const starts = total(signals, "video_start");
  const completes = total(signals, "complete");
  const rewatches = total(signals, "rewatch");
  const audience = audienceOf(signals);
  const shares = totalUniq(signals, "share") + totalUniq(signals, "repost");
  const watchAvg = average(signals, "watch");
  return {
    key: candidateKey(type, item.id),
    entityType: type,
    refId: item.id,
    title: item.body.slice(0, 80),
    description: null,
    ownerId: item.authorId,
    featureKeys: uniq([
      `author:${item.authorId}`,
      ...(item.topicId ? [`topic:${item.topicId}`] : []),
      ...(item.toolId ? [`tool:${item.toolId}`] : []),
      ...(item.modelId ? [`model:${item.modelId}`] : []),
      `kind:${item.kind}`,
      ...extractHashtags(item.body).map((h) => `tag:${h}`),
      ...tokenize(item.body, 12).map((w) => `term:${w}`),
    ]),
    groupKey: item.topicId ? `topic:${item.topicId}` : null,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
    sources: extra.sources ?? [],
    facts: {
      body: item.body,
      commentCount: item.counts.comments,
      likeCount: item.counts.likes,
      saveCount: item.counts.saves,
      repostCount: item.counts.reposts,
      viewers: audience,
      engagementQuality: eq.quality,
      contentQuality: contentQuality(item),
      conversation: conversationQuality(signals),
      completion: extra.isVideo ? (starts > 0 ? Math.min(1, completes / starts) : watchAvg !== null ? watchAvg / 100 : 0) : undefined,
      rewatch: extra.isVideo ? (starts > 0 ? Math.min(1, rewatches / starts) : 0) : undefined,
      shareRate: audience > 0 ? Math.min(1, shares / audience) : 0,
      perfScore: extra.perfScore ?? null,
      stage: extra.stage ?? null,
      spam: extra.spam ?? 0,
      bait: baitRisk(item.body),
      duplicateOf: extra.duplicateOf ?? null,
      nearDuplicateOf: extra.nearDuplicateOf ?? null,
      trendRank: extra.trendRank ?? null,
      risingRank: extra.risingRank ?? null,
      communityEligible: extra.eligible,
      communityIneligibleReason: extra.ineligibleReason ?? null,
      toolId: item.toolId,
      modelId: item.modelId,
      network: extra.network,
    },
  };
}

export type PersonExtra = {
  mutualFollows?: number;
  followsViewer?: boolean;
  viewerFollows?: boolean;
  interaction?: number;
  topicIds?: string[];
  recentPosts?: number;
  /* people_v1's score for this person, normalised 0..1 by the caller. */
  peopleScore?: number;
  sources?: ExploreSource[];
};

export function fromPerson(p: PersonCandidate, extra: PersonExtra = {}): ExploreCandidate {
  const created = at(p.createdAt);
  const complete = [p.fullName, p.bio, p.avatarUrl].filter(Boolean).length / 3;
  return {
    key: candidateKey("person", p.id),
    entityType: "person",
    refId: p.id,
    title: p.fullName ?? p.username,
    description: p.bio,
    ownerId: p.id,
    featureKeys: uniq([
      `author:${p.id}`,
      ...(extra.topicIds ?? []).map((t) => `topic:${t}`),
      ...tokenize(`${p.expertise.join(" ")} ${p.skills.join(" ")} ${p.interests.join(" ")} ${p.bio ?? ""}`, 12).map((w) => `term:${w}`),
    ]),
    groupKey: null,
    createdAt: created,
    updatedAt: created,
    sources: extra.sources ?? [],
    facts: {
      mutualFollows: extra.mutualFollows ?? 0,
      followsViewer: extra.followsViewer ?? false,
      viewerFollows: extra.viewerFollows ?? false,
      interaction: extra.interaction ?? 0,
      recentPosts: extra.recentPosts ?? 0,
      profileComplete: complete,
      peopleScore: extra.peopleScore ?? 0,
    },
  };
}

export type TopicInput = { id: string; slug: string; name: string; description: string | null; createdAt?: string | null };
export type TopicVelocityInput = { units24h: number; units7d: number; participants24h: number; participants7d: number; velocity: number };

export function fromTopic(
  t: TopicInput,
  extra: { postCount?: number; velocity?: TopicVelocityInput | null; sources?: ExploreSource[] } = {},
): ExploreCandidate {
  const created = at(t.createdAt ?? null);
  return {
    key: candidateKey("topic", t.id),
    entityType: "topic",
    refId: t.id,
    title: t.name,
    description: t.description,
    ownerId: null,
    featureKeys: uniq([`topic:${t.id}`, ...tokenize(`${t.name} ${t.description ?? ""}`, 8).map((w) => `term:${w}`)]),
    groupKey: `topic:${t.id}`,
    createdAt: created,
    updatedAt: created,
    sources: extra.sources ?? [],
    facts: {
      topicPosts: extra.postCount ?? 0,
      topicUnits24h: extra.velocity?.units24h ?? 0,
      topicUnits7d: extra.velocity?.units7d ?? 0,
      topicParticipants24h: extra.velocity?.participants24h ?? 0,
      topicParticipants7d: extra.velocity?.participants7d ?? 0,
      topicVelocity: extra.velocity?.velocity ?? 0,
    },
  };
}

export function fromCategory(
  c: { slug: string; name: string; description: string | null },
  extra: { toolCount?: number; sources?: ExploreSource[] } = {},
): ExploreCandidate {
  const name = lower(c.name);
  return {
    key: candidateKey("category", c.slug),
    entityType: "category",
    refId: c.slug,
    title: c.name,
    description: c.description,
    ownerId: null,
    featureKeys: uniq([`category:${name}`, ...tokenize(`${c.name} ${c.description ?? ""}`, 8).map((w) => `term:${w}`)]),
    groupKey: `category:${name}`,
    createdAt: 0,
    updatedAt: 0,
    sources: extra.sources ?? [],
    facts: { categoryTools: extra.toolCount ?? 0 },
  };
}
