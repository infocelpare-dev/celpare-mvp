import { FEATURE, RELATIONSHIP } from "./config";
import { dominantScript, sharedTerms, terms } from "./text";
import type { CommentRow, Features, RankContext, Relation } from "./types";

/*
  Typed, normalised features, each in 0..1. Missing data is 0 (or the neutral
  value where 0 would be a judgement), so a cold start post or a signed out
  viewer simply has fewer features lit and falls back to relevance, freshness,
  quality and plain helpfulness. Nothing here reads a follower count, and there
  is no author reputation: every feature is about this comment, this post, or
  this viewer's own relationship with the commenter.
*/

const sat = (x: number, k: number) => (x <= 0 ? 0 : x / (x + k));
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function relationOf(row: CommentRow, viewerId: string | null): Relation {
  if (!viewerId || row.authorId === viewerId) return null;
  if (row.viewerFollows && row.followsViewer) return "friend";
  if (row.viewerFollows) return "following";
  return null;
}

export function relationship(row: CommentRow, viewerId: string | null): number {
  const r = relationOf(row, viewerId);
  if (r === "friend") return RELATIONSHIP.friend;
  if (r === "following") return RELATIONSHIP.following;
  if (viewerId && row.authorId !== viewerId && row.followsViewer) return RELATIONSHIP.followedBy;
  return 0;
}

/* Meaningful words shared with the text it answers: the post for a top level
   comment, the post and the parent for a reply. Saturating, not a ratio, so a
   long comment is not punished for saying more. */
export function relevance(body: string, against: string): number {
  const mine = terms(body);
  if (mine.size === 0) return 0;
  const shared = sharedTerms(mine, terms(against));
  return clamp01(1 - Math.exp(-shared / FEATURE.relevanceScale));
}

/* Likes, discounted when they come from week old accounts, and never including
   the author's own. Smoothed by a prior rather than divided by impressions,
   because V1 has no reliable exposure counts yet (they are logged from now on). */
export function helpful(row: CommentRow): number {
  const effective = row.trustedLikes + FEATURE.newAccountLikeWeight * row.newAccountLikes;
  return sat(effective, FEATURE.helpfulPrior);
}

/* Replies that say something (20 characters or more, not the author talking to
   themselves) and how many different people replied. Concave, so a branch of
   200 replies is worth little more than a branch of 20 and cannot bury the rest. */
export function replies(row: CommentRow): number {
  return sat((row.meaningfulReplies + row.distinctRepliers) / 2, FEATURE.repliesPrior);
}

export function postAuthor(row: CommentRow): number {
  if (row.postAuthorReplied) return 1;
  if (row.postAuthorLiked) return 0.8;
  if (row.isPostAuthor) return 0.6;
  return 0;
}

export function freshness(createdAt: string, now: number): number {
  const hours = Math.max(0, (now - Date.parse(createdAt)) / 3_600_000);
  return Math.pow(2, -hours / FEATURE.freshnessHalfLifeHours);
}

/* Likes in the last day, weighted by how much of the comment's support comes
   from established accounts, so a burst from fresh accounts does not read as
   momentum. */
export function velocity(row: CommentRow): number {
  const all = row.trustedLikes + row.newAccountLikes;
  const trustShare = all === 0 ? 1 : row.trustedLikes / all;
  return sat(row.likes24h * trustShare, FEATURE.velocityPrior);
}

/* Same writing system as the post: 1. A comment with no letters: neutral. A
   different system: low, not zero, because a translation can be the point. */
export function language(body: string, postText: string): number {
  const mine = dominantScript(body);
  const theirs = dominantScript(postText);
  if (!mine || !theirs) return 0.5;
  return mine === theirs ? 1 : 0.2;
}

/* Basic form only, not truth: very short or very long comments read worse. */
export function quality(body: string): number {
  const n = body.trim().length;
  if (n < 5) return 0.2;
  if (n < 20) return 0.6;
  if (n <= 600) return 1;
  return 0.8;
}

/* Interactions the viewer chose: liking the commenter's things, replying to
   them, and them replying to the viewer, all in the last 90 days. */
export function affinity(row: CommentRow, viewerId: string | null): number {
  if (!viewerId || row.authorId === viewerId) return 0;
  const raw = row.viewerLikedAuthor + 2 * row.viewerRepliedAuthor + 1.5 * row.authorRepliedViewer;
  return clamp01(1 - Math.exp(-raw / FEATURE.affinityScale));
}

export function computeFeatures(row: CommentRow, ctx: RankContext, against: string): Features {
  return {
    relevance: relevance(row.body, against),
    relationship: relationship(row, ctx.viewerId),
    affinity: affinity(row, ctx.viewerId),
    helpful: helpful(row),
    replies: replies(row),
    postAuthor: postAuthor(row),
    freshness: freshness(row.createdAt, ctx.now),
    velocity: velocity(row),
    language: language(row.body, ctx.postText),
    quality: quality(row.body),
  };
}
