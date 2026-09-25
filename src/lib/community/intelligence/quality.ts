import { clamp01, confidence, saturate, shrunkRate, wilsonLower } from "./math";
import { average, total, totalUniq } from "./signals";
import { tokenize } from "./text";
import type { ContentItem, PostSignals } from "./types";

/*
  Quality signals. Separate from safety on purpose: quality moves a post up or
  down, safety decides whether it may be recommended at all. A low quality post
  is still eligible; an ineligible post is never ranked, however good it looks.
*/

export const QUALITY = {
  /* Priors: what a typical post earns per distinct viewer before we know better.
     Stated placeholders, not measurements. Celpare has too little traffic to
     measure them, and they should be re-derived from feed_events once it does. */
  PRIOR_LIKE_RATE: 0.06,
  PRIOR_COMMENT_RATE: 0.015,
  PRIOR_SAVE_RATE: 0.01,
  PRIOR_SHARE_RATE: 0.008,
  PRIOR_NEGATIVE_RATE: 0.01,
  PRIOR_COMPLETION_RATE: 0.3,
  /* Pseudo viewers behind each prior. */
  PRIOR_WEIGHT: 20,
  /* Viewers at which a measured rate is trusted halfway. */
  HALF_TRUST_VIEWERS: 25,
  /* Distinct engagers that saturate the absolute evidence term. */
  ENGAGER_SCALE: 6,
} as const;

/*
  The audience a post has had. Distinct viewers where impressions exist, and
  never fewer than the distinct people who engaged, because someone who liked a
  post saw it. Posts older than feed_events have likes and no impressions, and
  this is what keeps their rates from dividing by zero.
*/
export function audienceOf(s: PostSignals): number {
  const viewers = totalUniq(s, "impression");
  const engaged = Math.max(
    totalUniq(s, "like"),
    totalUniq(s, "comment"),
    totalUniq(s, "save"),
    totalUniq(s, "repost"),
  );
  return Math.max(viewers, engaged);
}

export type EngagementBreakdown = {
  likeRate: number;
  commentRate: number;
  saveRate: number;
  shareRate: number;
  negativeRate: number;
  completionRate: number;
  watchDepth: number;
  confidence: number;
  /* Lower bound of the share of viewers who did something meaningful (saved,
     shared, reposted, commented, finished, followed). Wilson, so a lucky small
     sample cannot look like a great post. */
  meaningfulRate: number;
  /* Mean time on screen per dwell, 0..1 against a 20 second read. */
  readDepth: number;
  /* 0..1 composite. Meaningful interaction over raw volume. */
  quality: number;
};

/*
  Engagement QUALITY, not quantity. Every term is a rate per distinct viewer,
  shrunk toward a prior until there is evidence, and the costly actions (save,
  comment, share) are worth more than the cheap one (like). A post with fewer
  likes and more saves can outrank one with more likes and none.
*/
export function engagementQuality(s: PostSignals, item?: Pick<ContentItem, "media">): EngagementBreakdown {
  const audience = audienceOf(s);
  const conf = confidence(audience, QUALITY.HALF_TRUST_VIEWERS);

  const likeRate = shrunkRate(totalUniq(s, "like"), audience, QUALITY.PRIOR_LIKE_RATE, QUALITY.PRIOR_WEIGHT);
  const commentRate = shrunkRate(totalUniq(s, "comment"), audience, QUALITY.PRIOR_COMMENT_RATE, QUALITY.PRIOR_WEIGHT);
  const saveRate = shrunkRate(totalUniq(s, "save"), audience, QUALITY.PRIOR_SAVE_RATE, QUALITY.PRIOR_WEIGHT);
  const shareRate = shrunkRate(
    totalUniq(s, "share") + totalUniq(s, "repost"),
    audience,
    QUALITY.PRIOR_SHARE_RATE,
    QUALITY.PRIOR_WEIGHT,
  );
  const negativeRate = shrunkRate(
    totalUniq(s, "not_interested") + totalUniq(s, "report") * 3,
    audience,
    QUALITY.PRIOR_NEGATIVE_RATE,
    QUALITY.PRIOR_WEIGHT,
  );

  const starts = Math.max(totalUniq(s, "video_start"), totalUniq(s, "watch"));
  const completionRate = shrunkRate(totalUniq(s, "complete"), starts, QUALITY.PRIOR_COMPLETION_RATE, 10);
  const watchDepth = clamp01((average(s, "watch") ?? 0) / 100);

  /* Each rate is scaled against a "very good" level for that action, so the
     terms are comparable before they are combined. */
  const rateScore =
    0.2 * clamp01(likeRate / 0.2) +
    0.25 * clamp01(commentRate / 0.06) +
    0.3 * clamp01(saveRate / 0.05) +
    0.25 * clamp01(shareRate / 0.04);

  /* Fast swipe aways, per viewer who started the video. */
  const skipRate = shrunkRate(totalUniq(s, "skip"), Math.max(starts, audience), 0.2, 10);

  /* For a video, watching is the evidence and likes are secondary. */
  const videoScore =
    item?.media === "video"
      ? clamp01(0.5 * completionRate + 0.5 * watchDepth - 0.5 * Math.max(0, skipRate - 0.2))
      : null;

  const meaningful =
    totalUniq(s, "save") +
    totalUniq(s, "share") +
    totalUniq(s, "repost") +
    totalUniq(s, "comment") +
    totalUniq(s, "complete") +
    totalUniq(s, "follow_after");
  const meaningfulRate = wilsonLower(meaningful, Math.max(audience, meaningful));
  const readDepth = clamp01((average(s, "dwell") ?? 0) / 20_000);

  const base = videoScore === null ? rateScore : 0.35 * rateScore + 0.65 * videoScore;
  /* Meaningful engagement and real reading lift quality; volume alone does not. */
  const measured = clamp01(0.7 * base + 0.2 * clamp01(meaningfulRate / 0.15) + 0.1 * readDepth);
  const penalised = measured * (1 - clamp01(negativeRate / 0.1) * 0.8);

  /* Where impressions are thin, the absolute number of distinct engagers is the
     only evidence there is. It carries the weight the rates cannot yet. */
  const engagers =
    totalUniq(s, "like") + totalUniq(s, "comment") * 2 + totalUniq(s, "save") * 2 + totalUniq(s, "repost") * 2;
  const absolute = saturate(engagers, QUALITY.ENGAGER_SCALE);

  const quality = clamp01(conf * penalised + (1 - conf) * (0.35 + 0.4 * absolute) * (1 - clamp01(negativeRate / 0.1) * 0.8));

  return { likeRate, commentRate, saveRate, shareRate, negativeRate, completionRate, watchDepth, confidence: conf, meaningfulRate, readDepth, quality };
}

/*
  The content itself, from what can be checked without a model: enough words to
  say something, not a wall, not shouting, not a hashtag dump, and something to
  look at or follow beyond the text.
*/
export function contentQuality(item: ContentItem): number {
  const body = item.body ?? "";
  const words = tokenize(body, 400).length;
  let q = 0.5;

  if (words >= 8) q += 0.15;
  if (words >= 25) q += 0.1;
  if (body.length > 4000) q -= 0.1;
  if (item.media !== "text") q += 0.1;
  if (item.toolId || item.modelId) q += 0.05;

  const letters = body.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 20 && letters === letters.toUpperCase()) q -= 0.25;
  const tags = (body.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  if (tags > 8) q -= 0.2;
  if (/(.)\1{7,}/u.test(body)) q -= 0.15;
  if (item.linkUrl && words < 3) q -= 0.15;

  return clamp01(q);
}

/*
  A conversation worth joining: several people, and more than one reply each on
  average, which is what separates a discussion from a pile of one line reactions.
  Never the raw comment count.
*/
export function conversationQuality(s: PostSignals): number {
  const comments = total(s, "comment");
  const people = totalUniq(s, "comment");
  if (comments === 0) return 0;
  const breadth = saturate(people, 4);
  const depth = clamp01((comments / Math.max(1, people) - 1) / 2);
  const monologue = people <= 1 ? 0.4 : 1;
  return clamp01((0.65 * breadth + 0.35 * depth) * monologue);
}

/*
  feed_v3: did the author take part in the conversation? X's heavy ranker
  values a reply the author engages with far above a like. Here: how many
  different commenters the author answered (feed_post_signals author_reply),
  on top of the conversation's own shape. 0 with no comments.
*/
export function conversationDepth(s: PostSignals): number {
  const base = conversationQuality(s);
  if (base === 0) return 0;
  const answered = saturate(totalUniq(s, "author_reply"), 3);
  return clamp01(0.6 * base + 0.4 * answered + 0.2 * answered * base);
}

/*
  feed_v3: engagement bait, the wording LinkedIn demotes. Readable rules, each
  one a request for a cheap action in exchange for reach, plus padding that
  stretches a post to look substantial. Demotion only, never removal: bait is a
  quality problem, not a safety one.
*/
export const BAIT_RULES: RegExp[] = [
  /\b(comment|type|reply|drop)\s+["'\u201c]?(yes|me|interested|agree|done|1)["'\u201d]?(\s|$|[.!,])/iu,
  /\b(like|share|repost|retweet)\s+(this\s+)?if\s+you\b/iu,
  /\bfollow\s+(me\s+)?for\s+more\b/iu,
  /\btag\s+(someone|a\s+friend|three|3|your)\b/iu,
  /\b(agree|thoughts)\s*\?\s*$/iu,
  /\bsmash\s+(that|the)\s+(like|follow)\b/iu,
  /\bdon'?t\s+scroll\b/iu,
];

export function baitRisk(body: string | null | undefined): number {
  const text = body ?? "";
  if (!text) return 0;
  let hits = 0;
  for (const re of BAIT_RULES) if (re.test(text)) hits++;
  /* Padding: many empty lines, or a wall of emoji. */
  const lines = text.split(/\r?\n/);
  const empty = lines.filter((l) => l.trim().length === 0).length;
  const padded = lines.length >= 8 && empty / lines.length >= 0.4 ? 1 : 0;
  const emoji = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  const letters = text.replace(/[^\p{L}]/gu, "").length;
  const emojiWall = emoji >= 8 && emoji * 6 > letters ? 1 : 0;
  return clamp01(0.45 * hits + 0.2 * padded + 0.25 * emojiWall);
}

/*
  feed_v3: this post against its creator's usual. The creator's other posts
  the ranker can see give their normal quality; a post well above it is doing
  unusually well FOR THEM, which is what lets a small creator's best post
  compete. 0.5 is usual; with fewer than two other posts there is no baseline
  and the answer is 0.5, never a guess. Follower count is not an input.
*/
export function outperformance(postQuality: number, stats: CreatorStats | undefined): number {
  const others = stats?.postQualities ?? [];
  if (others.length < 2) return 0.5;
  const sorted = [...others].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return clamp01(0.5 + (postQuality - median));
}

export type CreatorStats = {
  /* The creator's posts the ranker can see, with their engagement quality. */
  postQualities: number[];
  /* Share of their posts that are near duplicates of another of theirs. */
  duplicateShare: number;
  /* Any post of theirs with a qualified report. */
  qualifiedReports: number;
};

/*
  Historical creator quality. Deliberately NOT follower count: a new creator
  with no history lands on a neutral 0.5, not at the bottom, so the first post
  is judged on itself.
*/
export function creatorQuality(stats: CreatorStats | undefined): number {
  if (!stats || stats.postQualities.length === 0) return 0.5;
  const avg = stats.postQualities.reduce((a, b) => a + b, 0) / stats.postQualities.length;
  const conf = confidence(stats.postQualities.length, 3);
  let q = conf * avg + (1 - conf) * 0.5;
  q -= stats.duplicateShare * 0.3;
  if (stats.qualifiedReports > 0) q -= 0.2;
  return clamp01(q);
}
