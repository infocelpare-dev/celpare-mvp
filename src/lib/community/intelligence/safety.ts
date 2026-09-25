import { clamp01 } from "./math";
import { totalUniq } from "./signals";
import { isNearDuplicate } from "./text";
import type { ContentItem, InterestProfile, PostSignals } from "./types";

/*
  Recommendation eligibility.

  TWO DIFFERENT QUESTIONS, and the brief is right to separate them.
  contentExists():               may this post be shown to somebody who asks for it?
  contentIsRecommendationEligible(): may we PUT it in front of somebody who did not?

  The first is RLS's job and is already enforced by the database: a hidden,
  removed, deleted or private post never reaches this code, because the
  candidate reads go through the viewer's own client. The second is decided
  here, and a post can pass the first and fail the second: under review, from a
  suspended account, muted by the viewer.

  NOTHING HERE IS EXPERIMENTABLE. Variants change objective weights; they never
  reach this file, and experiments.ts has no way to express a safety override.
*/

export const SAFETY = {
  /* Distinct pending reports that hold a post out of recommendations until a
     moderator looks. One report is not enough: that would hand every account a
     button that removes a post from distribution. */
  PENDING_REPORT_HOLD: 2,
  /* At or above this spam risk a post is not recommended at all. */
  SPAM_BLOCK: 0.85,
} as const;

export type EligibilityReason =
  | "ok"
  | "missing"
  | "author_inactive"
  | "qualified_report"
  | "pending_reports"
  | "muted_author"
  | "muted_topic"
  | "not_interested"
  | "spam";

export type Eligibility = { eligible: boolean; reason: EligibilityReason };

/* A post that reached ranking exists: RLS already filtered status, deletion and
   privacy. This is the explicit statement of that, for callers and tests. */
export function contentExists(item: ContentItem | null | undefined): boolean {
  return Boolean(item && item.id && item.authorId);
}

/*
  How much a post looks like spam, 0..1, from things that can be checked
  without a model: link only posts, hashtag stuffing, shouting, repeated
  characters, and the same text posted again by the same author.
*/
export function spamRisk(item: ContentItem, sameAuthorOthers: ContentItem[] = []): number {
  const body = item.body ?? "";
  let risk = 0;

  const links = (body.match(/https?:\/\//g) ?? []).length + (item.linkUrl ? 1 : 0);
  if (links >= 3) risk += 0.45;
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  if (item.linkUrl && words <= 2) risk += 0.25;

  const tags = (body.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  if (tags >= 10) risk += 0.4;

  const letters = body.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 30 && letters === letters.toUpperCase()) risk += 0.15;
  if (/(.)\1{9,}/u.test(body)) risk += 0.15;

  const dupes = sameAuthorOthers.filter(
    (o) => o.id !== item.id && isNearDuplicate(o.body, body),
  ).length;
  if (dupes >= 1) risk += 0.35;
  if (dupes >= 3) risk += 0.3;

  return clamp01(risk);
}

export function contentIsRecommendationEligible(
  item: ContentItem,
  signals: PostSignals,
  profile: InterestProfile | null,
  options: { spam?: number; followingSurface?: boolean } = {},
): Eligibility {
  if (!contentExists(item)) return { eligible: false, reason: "missing" };
  if (signals.authorInactive) return { eligible: false, reason: "author_inactive" };
  if (signals.qualifiedReports > 0) return { eligible: false, reason: "qualified_report" };

  /* On Following the person chose this author, so pending reports do not hold
     the post back there; a moderator's decision (qualified) still does. */
  if (!options.followingSurface && totalUniq(signals, "report") >= SAFETY.PENDING_REPORT_HOLD) {
    return { eligible: false, reason: "pending_reports" };
  }

  if (profile) {
    if (profile.mutedAuthors.has(item.authorId)) return { eligible: false, reason: "muted_author" };
    if (item.topicId && profile.mutedTopics.has(item.topicId)) {
      return { eligible: false, reason: "muted_topic" };
    }
    if (profile.notInterested.has(item.id)) return { eligible: false, reason: "not_interested" };
  }

  if ((options.spam ?? 0) >= SAFETY.SPAM_BLOCK) return { eligible: false, reason: "spam" };

  return { eligible: true, reason: "ok" };
}

/* Convenience for a list: keep the eligible, drop the rest. */
export function applySafety<T extends { item: ContentItem }>(
  candidates: T[],
  signalsOf: (id: string) => PostSignals,
  profile: InterestProfile | null,
  spamOf: (item: ContentItem) => number,
  options: { followingSurface?: boolean } = {},
): T[] {
  return candidates.filter(
    (c) =>
      contentIsRecommendationEligible(c.item, signalsOf(c.item.id), profile, {
        spam: spamOf(c.item),
        followingSurface: options.followingSurface,
      }).eligible,
  );
}
