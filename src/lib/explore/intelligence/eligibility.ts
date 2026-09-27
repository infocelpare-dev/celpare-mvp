import { halfLifeDecay } from "../../community/intelligence/math";
import { NOT_FOR_DISCOVERY, type Stage } from "../../community/intelligence/lifecycle";
import { EXPLORE_V1 } from "./config";
import type { ExploreProfile } from "./profile";
import type { ExploreCandidate } from "./types";

/*
  What may appear on Explore at all, and how safe it is.

  Posts reuse Community Intelligence's own eligibility (safety.ts: reports,
  inactive authors, mutes, not interested, spam), decided by the server with the
  viewer's profile and carried in the facts. On top of that, a post still in
  uploaded, held or suppressed never reaches an Explore shelf (D154): Explore is
  amplification to people who did not ask.

  Nothing here removes anything from Celpare. It decides a shelf.
*/

export type ExploreEligibility = { eligible: boolean; reason: string };

const RETIRED = new Set(["retired", "deprecated", "sunset", "removed"]);

export function eligibilityOf(c: ExploreCandidate, profile: ExploreProfile, now: number): ExploreEligibility {
  const f = c.facts;

  if (c.entityType === "post" || c.entityType === "video") {
    if (f.communityEligible === false) return { eligible: false, reason: f.communityIneligibleReason ?? "community" };
    if (f.stage && NOT_FOR_DISCOVERY.has(f.stage as Stage)) return { eligible: false, reason: `stage_${f.stage}` };
    if (profile.userId && c.ownerId === profile.userId) return { eligible: false, reason: "own_post" };
  }

  if (c.entityType === "model" && f.lifecycle && RETIRED.has(f.lifecycle.toLowerCase())) {
    return { eligible: false, reason: "retired" };
  }

  if (c.entityType === "person") {
    if (profile.userId && c.refId === profile.userId) return { eligible: false, reason: "self" };
    if (f.viewerFollows || profile.followedAuthors.has(c.refId)) return { eligible: false, reason: "already_following" };
    if (profile.mutedAuthors.has(c.refId)) return { eligible: false, reason: "muted_author" };
  }

  if (c.entityType === "topic" && profile.mutedTopics.has(c.refId)) {
    return { eligible: false, reason: "muted_topic" };
  }

  /* A dismiss holds an item back while it is recent, then lets it return.
     Nothing is hidden forever by one tap. */
  const dismissedAt = profile.dismissed.get(c.key);
  if (dismissedAt !== undefined) {
    const hold = halfLifeDecay((now - dismissedAt) / 86_400_000, EXPLORE_V1.NOVELTY.DISMISS_HALF_LIFE_DAYS);
    if (hold > 0.5) return { eligible: false, reason: "dismissed" };
  }

  if (safetyOf(c) <= EXPLORE_V1.SAFETY_BLOCK) return { eligible: false, reason: "unsafe" };

  return { eligible: true, reason: "ok" };
}

/*
  Safety as a multiplier, 1 is clean. Severe problems block (SAFETY_BLOCK);
  milder ones scale the value down, so popularity can never override them.
*/
export function safetyOf(c: ExploreCandidate): number {
  const f = c.facts;
  if (c.entityType === "post" || c.entityType === "video") {
    const risk = Math.max(f.spam ?? 0, 0.7 * (f.bait ?? 0));
    return Math.max(0, 1 - risk);
  }
  if (c.entityType === "tool" || c.entityType === "model") {
    return Math.max(0, 1 - 0.5 * (f.listingPenalty ?? 0));
  }
  return 1;
}
