import { clamp01, halfLifeDecay, maxValue, saturate } from "./math";
import { IGNORE, MEASURED, NEGATIVE, SIGNALS } from "./config";
import { examinationProbability } from "./evaluation";
import { markSeen, SEEN } from "./seen";
import { tokenize } from "./text";
import type {
  ContentItem,
  FeatureKey,
  InterestAction,
  InterestProfile,
  InterestSignal,
} from "./types";

/*
  The user interest model.

  NOTHING IS HARD CODED ABOUT ANY PERSON. A profile is built by folding that
  person's own actions in, one at a time, each weighted by what it cost them and
  decayed by how long ago it happened. The same fold is applied to one fresh
  signal (updateUserInterestProfile) as to a whole history (buildInterestProfile),
  so there is exactly one definition of what an action means.

  FOUR HORIZONS, as the brief asks:
    long term   weeks, slow decay            longTerm
    short term  the last day or two          shortTerm
    session     this sitting                 getSessionInterestProfile()
    explicit    follows and mutes            followedAuthors, mutedAuthors, mutedTopics
  plus negative interest, which is its own map rather than a subtraction, so a
  topic somebody both likes and has pushed away is represented honestly.

  The raw history comes from my_feed_interests(), which answers only for the
  signed in person. Nobody's profile can be built by anybody else.
*/

export const INTERESTS = {
  LONG_HALF_LIFE_DAYS: 30,
  SHORT_HALF_LIFE_HOURS: 18,
  /* Short term only counts what happened in this window. */
  SHORT_WINDOW_HOURS: 72,
  NEGATIVE_HALF_LIFE_DAYS: 45,
  SESSION_HALF_LIFE_MINUTES: 20,
  /* A kind (question, showcase) is a weak signal next to a topic or author. */
  KIND_FACTOR: 0.4,
  TERM_FACTOR: 0.6,
  /* Watching less than this much of a video says nothing positive. */
  WATCH_MIN_PERCENT: 50,
  /* Dwell below this is scrolling past, not reading. */
  DWELL_MIN_MS: 6000,
} as const;

/*
  What each action is worth now lives in config.ts (SIGNALS), with its tier.
  Follows and mutes are ALSO explicit rules, handled separately below; their
  weight is what they add to the soft profile.
*/
function actionWeight(action: InterestAction): number {
  return SIGNALS[action]?.weight ?? 0;
}

export function emptyInterestProfile(userId: string | null = null): InterestProfile {
  return {
    userId,
    longTerm: new Map(),
    shortTerm: new Map(),
    negative: new Map(),
    positiveCounts: new Map(),
    negativeCounts: new Map(),
    followedAuthors: new Set(),
    followers: new Set(),
    mutedAuthors: new Set(),
    mutedTopics: new Set(),
    notInterested: new Set(),
    seen: new Map(),
    seeds: { liked: [], saved: [], watched: [] },
    evidence: 0,
    ignored: new Map(),
  };
}

function bump(map: Map<FeatureKey, number>, key: FeatureKey, by: number) {
  if (!(by > 0)) return;
  map.set(key, (map.get(key) ?? 0) + by);
}

/* The feature keys a signal touches, with a factor per dimension. */
export function signalKeys(signal: InterestSignal, selfId: string | null): [FeatureKey, number][] {
  const out: [FeatureKey, number][] = [];
  if (signal.topicId) out.push([`topic:${signal.topicId}`, 1]);
  /* Engaging with your own post says nothing about what you want to read. */
  if (signal.authorId && signal.authorId !== selfId) out.push([`author:${signal.authorId}`, 1]);
  if (signal.kind) out.push([`kind:${signal.kind}`, INTERESTS.KIND_FACTOR]);
  if (signal.toolId) out.push([`tool:${signal.toolId}`, 1]);
  if (signal.modelId) out.push([`model:${signal.modelId}`, 1]);
  if (signal.term) {
    const words = tokenize(signal.term, 8);
    for (const w of words) out.push([`term:${w}`, INTERESTS.TERM_FACTOR / Math.max(1, words.length / 2)]);
  }
  return out;
}

/* The weight of one signal, before decay. Measured actions scale by what was
   measured: watching 90% is worth more than 55%, a 20% watch is a skip. */
export function signalWeight(signal: InterestSignal): number {
  const base = actionWeight(signal.action);
  if (signal.action === "watch") {
    const pct = signal.value ?? 0;
    if (pct < MEASURED.WATCH_MIN_PERCENT) return 0;
    return base * (pct / 100);
  }
  if (signal.action === "dwell") {
    const ms = signal.value ?? 0;
    if (ms < MEASURED.DWELL_MIN_MS) return 0;
    /* A long read is a strong signal; a short one a medium one. */
    return ms >= MEASURED.LONG_DWELL_MS ? base * 3 : base;
  }
  return base;
}

/* How deeply an action shows a post was consumed, or null if it says nothing. */
export function consumptionDepth(signal: InterestSignal): "brief" | "viewed" | "consumed" | null {
  switch (signal.action) {
    case "like":
    case "save":
    case "repost":
    case "comment":
    case "complete":
      return "consumed";
    case "open":
    case "profile_visit":
      return "viewed";
    case "dwell": {
      const ms = signal.value ?? 0;
      return ms >= SEEN.CONSUMED_DWELL_MS ? "consumed" : ms >= SEEN.VIEWED_DWELL_MS ? "viewed" : "brief";
    }
    case "watch": {
      const pct = signal.value ?? 0;
      return pct >= SEEN.CONSUMED_WATCH_PERCENT ? "consumed" : pct >= SEEN.VIEWED_WATCH_PERCENT ? "viewed" : "brief";
    }
    case "skip":
    case "video_start":
      return "brief";
    default:
      return null;
  }
}

/*
  Fold one signal into a profile, in place. Internal: the exported functions
  below decide whether to copy first.
*/
function fold(profile: InterestProfile, signal: InterestSignal, now: number) {
  const ageMs = Math.max(0, now - signal.at);
  const ageHours = ageMs / 3_600_000;

  /* Explicit rules first. */
  switch (signal.action) {
    case "follow":
      if (signal.authorId) profile.followedAuthors.add(signal.authorId);
      break;
    case "mute_author":
      if (signal.authorId) profile.mutedAuthors.add(signal.authorId);
      break;
    case "mute_topic":
      if (signal.topicId) profile.mutedTopics.add(signal.topicId);
      break;
    case "not_interested":
    case "dislike":
    case "report":
      if (signal.postId) profile.notInterested.add(signal.postId);
      break;
    case "followed_by":
      if (signal.authorId) profile.followers.add(signal.authorId);
      return;
    case "served":
      /* Delivered, never on screen (feed_v3): served state only. */
      if (signal.postId) markSeen(profile.seen, signal.postId, signal.at, "served", "history", false);
      return;
    case "seen":
      if (signal.postId) markSeen(profile.seen, signal.postId, signal.at, "brief", "history");
      /* An impression is evidence the post was SHOWN, never that it was wanted
         or disliked: it changes no interest at all. */
      return;
  }

  /* Anything done to a post means it was seen, at the depth the action implies. */
  if (signal.postId) {
    const depth = consumptionDepth(signal);
    if (depth) markSeen(profile.seen, signal.postId, signal.at, depth, "history", false);
  }

  /* Seeds for "similar to what you liked, saved, watched". Newest first,
     because the history arrives newest first. */
  if (signal.postId) {
    if (signal.action === "like" && profile.seeds.liked.length < 30) profile.seeds.liked.push(signal.postId);
    if (signal.action === "save" && profile.seeds.saved.length < 30) profile.seeds.saved.push(signal.postId);
    if (
      (signal.action === "complete" || (signal.action === "watch" && (signal.value ?? 0) >= INTERESTS.WATCH_MIN_PERCENT)) &&
      profile.seeds.watched.length < 30 &&
      !profile.seeds.watched.includes(signal.postId)
    ) {
      profile.seeds.watched.push(signal.postId);
    }
  }

  const w = signalWeight(signal);
  if (w === 0) return;

  const keys = signalKeys(signal, profile.userId);
  if (keys.length === 0) return;

  profile.evidence += Math.abs(w);

  if (w > 0) {
    /* Follows are a standing choice, not a moment: they do not decay. */
    const longDecay =
      signal.action === "follow" ? 1 : halfLifeDecay(ageHours / 24, INTERESTS.LONG_HALF_LIFE_DAYS);
    const shortDecay =
      ageHours <= INTERESTS.SHORT_WINDOW_HOURS && signal.action !== "follow"
        ? halfLifeDecay(ageHours, INTERESTS.SHORT_HALF_LIFE_HOURS)
        : 0;
    for (const [key, factor] of keys) {
      bump(profile.longTerm, key, w * factor * longDecay);
      bump(profile.shortTerm, key, w * factor * shortDecay);
      profile.positiveCounts.set(key, (profile.positiveCounts.get(key) ?? 0) + 1);
    }
  } else {
    const negDecay = halfLifeDecay(ageHours / 24, INTERESTS.NEGATIVE_HALF_LIFE_DAYS);
    for (const [key, factor] of keys) {
      /* A not interested on one post is mostly about that post; it spreads to
         its author and topic at a fraction, so one tap does not erase a topic. */
      const spread = key.startsWith("author:") || key.startsWith("topic:") ? 0.5 : 0.3;
      bump(profile.negative, key, -w * factor * negDecay * spread);
      /* Separate rejections, counted toward escalation. Mutes are explicit
         rules and a skip is too weak to count as a rejection. */
      if (
        ageHours / 24 <= NEGATIVE.COUNT_WINDOW_DAYS &&
        (signal.action === "not_interested" || signal.action === "dislike" || signal.action === "report")
      ) {
        profile.negativeCounts.set(key, (profile.negativeCounts.get(key) ?? 0) + 1);
      }
    }
  }
}

/* The rows feed_v3 added to the history. A surface that stays on v2 (reels)
   builds its profile without them, and without ignores. */
export const V3_ONLY_ACTIONS: ReadonlySet<InterestAction> = new Set<InterestAction>(["served", "followed_by", "engaged_me"]);

/* Build a whole profile from a person's history. */
export function buildInterestProfile(
  userId: string | null,
  signals: InterestSignal[],
  now: number,
  opts: { v2Only?: boolean } = {},
): InterestProfile {
  const profile = emptyInterestProfile(userId);
  /* Oldest first is not required by the arithmetic, but newest first keeps the
     seed lists newest first, which is what "recent" should mean. */
  const ordered = [...signals]
    .filter((s) => !opts.v2Only || !V3_ONLY_ACTIONS.has(s.action))
    .sort((a, b) => b.at - a.at);
  for (const s of ordered) fold(profile, s, now);
  if (!opts.v2Only) deriveIgnores(profile, ordered, now);
  return profile;
}

/* Actions that show a post was NOT passed over. */
const ENGAGED: ReadonlySet<InterestAction> = new Set<InterestAction>([
  "like", "save", "repost", "comment", "complete", "open", "profile_visit", "watch",
  "not_interested", "dislike", "report",
]);

/*
  feed_v3: posts that were on screen and passed over (config.ts IGNORE). An
  impression with no action and dwell under IGNORE.MAX_DWELL_MS, weighted by how
  likely its slot was to be examined, counted once per post and decayed. Only
  author and topic keys, and the explicit negatives (not interested and the
  rest) are excluded: those already speak for themselves.
*/
export function deriveIgnores(profile: InterestProfile, signals: InterestSignal[], now: number) {
  const engaged = new Set<string>();
  const impressions = new Map<string, InterestSignal>();
  for (const s of signals) {
    if (!s.postId) continue;
    if (ENGAGED.has(s.action)) engaged.add(s.postId);
    else if (s.action === "dwell" && (s.value ?? 0) >= IGNORE.MAX_DWELL_MS) engaged.add(s.postId);
    else if (s.action === "seen" && !impressions.has(s.postId)) impressions.set(s.postId, s);
  }
  for (const [postId, s] of impressions) {
    if (engaged.has(postId)) continue;
    /* Without a position the pass over cannot be weighted by where it
       happened, so it is not counted: seen is still not disliked. */
    if (s.position === null || s.position === undefined) continue;
    const days = Math.max(0, now - s.at) / 86_400_000;
    if (days > IGNORE.WINDOW_DAYS) continue;
    const mass = examinationProbability(s.position) * halfLifeDecay(days, IGNORE.HALF_LIFE_DAYS);
    const keys: FeatureKey[] = [];
    if (s.authorId && s.authorId !== profile.userId) keys.push(`author:${s.authorId}`);
    if (s.topicId) keys.push(`topic:${s.topicId}`);
    for (const k of keys) {
      const prev = profile.ignored.get(k) ?? { count: 0, mass: 0 };
      profile.ignored.set(k, { count: prev.count + 1, mass: prev.mass + mass });
    }
  }
}

/* How much a pattern of passing over weighs against a key, 0..IGNORE.CAP. */
export function ignoreLevel(profile: InterestProfile, key: FeatureKey): number {
  const e = profile.ignored.get(key);
  if (!e || e.count < IGNORE.MIN_COUNT) return 0;
  return IGNORE.CAP * clamp01(e.mass / IGNORE.SCALE);
}

function cloneProfile(p: InterestProfile): InterestProfile {
  return {
    userId: p.userId,
    longTerm: new Map(p.longTerm),
    shortTerm: new Map(p.shortTerm),
    negative: new Map(p.negative),
    positiveCounts: new Map(p.positiveCounts),
    negativeCounts: new Map(p.negativeCounts),
    followedAuthors: new Set(p.followedAuthors),
    followers: new Set(p.followers),
    mutedAuthors: new Set(p.mutedAuthors),
    mutedTopics: new Set(p.mutedTopics),
    notInterested: new Set(p.notInterested),
    seen: new Map([...p.seen].map(([k, v]) => [k, { ...v }])),
    seeds: {
      liked: [...p.seeds.liked],
      saved: [...p.seeds.saved],
      watched: [...p.seeds.watched],
    },
    evidence: p.evidence,
    ignored: new Map([...p.ignored].map(([k, v]) => [k, { ...v }])),
  };
}

/* One new signal, returning a new profile. The live update path. */
export function updateUserInterestProfile(
  profile: InterestProfile,
  signal: InterestSignal,
  now: number = signal.at,
): InterestProfile {
  const next = cloneProfile(profile);
  fold(next, signal, now);
  return next;
}

/* The negative half on its own, for callers that only have a negative signal. */
export function updateNegativeInterest(
  profile: InterestProfile,
  signal: InterestSignal & { action: "not_interested" | "dislike" | "mute_author" | "mute_topic" | "report" | "skip" },
  now: number = signal.at,
): InterestProfile {
  return updateUserInterestProfile(profile, signal, now);
}

/*
  The session profile: what this person is consuming right now. Built from the
  items of this sitting, decayed in minutes. For Reels it is what keeps the next
  video related to the last few without repeating them.
*/
export type SessionEvent = {
  item: Pick<ContentItem, "id" | "authorId" | "topicId" | "kind" | "body">;
  at: number;
  /* 0..100 for a video; omit for a post that was opened. */
  percentWatched?: number;
  skipped?: boolean;
};

export type SessionProfile = {
  interests: Map<FeatureKey, number>;
  negative: Map<FeatureKey, number>;
  recentAuthors: string[];
  recentTopics: (string | null)[];
  /* Posts acted on this sitting (read, watched, liked, saved...). */
  consumed: Set<string>;
  /* How often each topic and creator was in front of the person this sitting,
     shown or consumed: the input to novelty and saturation. */
  topicCounts: Map<string, number>;
  authorCounts: Map<string, number>;
  mediaCounts: Map<string, number>;
  /* Latest action in the sitting, or 0. */
  lastAt: number;
};

export function getSessionInterestProfile(events: SessionEvent[], now: number): SessionProfile {
  const interests = new Map<FeatureKey, number>();
  const negative = new Map<FeatureKey, number>();
  const ordered = [...events].sort((a, b) => a.at - b.at);

  for (const e of ordered) {
    const minutes = Math.max(0, now - e.at) / 60_000;
    const d = halfLifeDecay(minutes, INTERESTS.SESSION_HALF_LIFE_MINUTES);
    const pct = e.percentWatched;
    const positive = !e.skipped && (pct === undefined || pct >= INTERESTS.WATCH_MIN_PERCENT);
    const target = positive ? interests : negative;
    const w = positive ? (pct === undefined ? 0.6 : pct / 100) : 0.6;
    if (e.item.topicId) bump(target, `topic:${e.item.topicId}`, w * d);
    bump(target, `author:${e.item.authorId}`, w * d * 0.7);
    for (const t of tokenize(e.item.body, 20)) bump(target, `term:${t}`, w * d * 0.15);
  }

  const topicCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  for (const e of ordered) {
    if (e.item.topicId) topicCounts.set(e.item.topicId, (topicCounts.get(e.item.topicId) ?? 0) + 1);
    authorCounts.set(e.item.authorId, (authorCounts.get(e.item.authorId) ?? 0) + 1);
  }
  return {
    interests,
    negative,
    recentAuthors: ordered.map((e) => e.item.authorId).reverse(),
    recentTopics: ordered.map((e) => e.item.topicId).reverse(),
    consumed: new Set(ordered.map((e) => e.item.id)),
    topicCounts,
    authorCounts,
    mediaCounts: new Map(),
    lastAt: ordered.length ? ordered[ordered.length - 1].at : 0,
  };
}

/* ------------------------------------------------------------- read side */

export type InterestMatch = {
  topic: number;
  author: number;
  kind: number;
  entity: number;
  terms: number;
  shortTerm: number;
  negative: number;
  /* 0..1 composite of the positive dimensions. */
  overall: number;
  /* Which dimension matched most, for the reason code. */
  strongest: "topic" | "author" | "entity" | "terms" | "kind" | null;
};

function norm(map: Map<FeatureKey, number>, key: FeatureKey, max: number): number {
  if (max <= 0) return 0;
  return clamp01((map.get(key) ?? 0) / max);
}

/* Maxima per dimension, cached per profile object so a page of a hundred
   candidates does not rescan the maps a hundred times. */
const maxCache = new WeakMap<InterestProfile, Record<string, number>>();

function maxima(profile: InterestProfile): Record<string, number> {
  const cached = maxCache.get(profile);
  if (cached) return cached;
  const dims = ["topic", "author", "kind", "tool", "model", "term"];
  const out: Record<string, number> = {};
  for (const d of dims) {
    const pick = (m: Map<FeatureKey, number>) => {
      const sub = new Map<string, number>();
      for (const [k, v] of m) if (k.startsWith(`${d}:`)) sub.set(k, v);
      return maxValue(sub);
    };
    out[`long:${d}`] = pick(profile.longTerm);
    out[`short:${d}`] = pick(profile.shortTerm);
    out[`neg:${d}`] = pick(profile.negative);
  }
  maxCache.set(profile, out);
  return out;
}

function dim(profile: InterestProfile, d: string, key: FeatureKey) {
  const m = maxima(profile);
  const long = norm(profile.longTerm, key, m[`long:${d}`]);
  const short = norm(profile.shortTerm, key, m[`short:${d}`]);
  const value = Math.max(long, 0.7 * long + 0.3 * short, short * 0.8);
  /* Negative is on an absolute scale, not relative to the person's strongest
     dislike: two not interesteds on an author mean the same thing whether or
     not they have muted a hundred other people. It escalates by the NUMBER of
     separate rejections (one tap is a nudge, three are a rejection), carries a
     small share of the softer decayed signals (skips), and is offset by real
     positive interest in the same key, so a single dismissal never erases a
     topic somebody reads every day (config.ts NEGATIVE). */
  const count = profile.negativeCounts.get(key) ?? 0;
  const level = NEGATIVE.LEVELS[Math.min(count, NEGATIVE.LEVELS.length - 1)];
  const soft = saturate(profile.negative.get(key) ?? 0, 6) * 0.3;
  const ignored = profile.ignored ? ignoreLevel(profile, key) : 0;
  const neg = clamp01(Math.max(level, soft, ignored) * (1 - NEGATIVE.POSITIVE_OFFSET * value));
  return { long, short, neg, value };
}

export function interestIn(
  profile: InterestProfile,
  item: Pick<ContentItem, "authorId" | "topicId" | "kind" | "toolId" | "modelId" | "body">,
  itemTokens?: string[],
): InterestMatch {
  const topic = item.topicId ? dim(profile, "topic", `topic:${item.topicId}`) : null;
  const author = dim(profile, "author", `author:${item.authorId}`);
  const kind = dim(profile, "kind", `kind:${item.kind}`);
  const tool = item.toolId ? dim(profile, "tool", `tool:${item.toolId}`) : null;
  const model = item.modelId ? dim(profile, "model", `model:${item.modelId}`) : null;

  const m = maxima(profile);
  const tokens = itemTokens ?? tokenize(item.body, 60);
  let termSum = 0;
  let termNeg = 0;
  for (const t of tokens) {
    termSum += norm(profile.longTerm, `term:${t}`, m["long:term"]);
    termSum += 0.5 * norm(profile.shortTerm, `term:${t}`, m["short:term"]);
    termNeg += profile.negative.get(`term:${t}`) ?? 0;
  }
  const terms = saturate(termSum, 1.5);

  const entity = Math.max(tool?.value ?? 0, model?.value ?? 0);
  const topicV = topic?.value ?? 0;
  /* Following someone is the strongest author signal there is; a mutual
     follow (friends, D123) is stronger still, and being followed by them is a
     weak two way signal on its own (feed_v3, RealGraph style). */
  const follows = profile.followedAuthors.has(item.authorId);
  const followedBack = profile.followers?.has(item.authorId) ?? false;
  const authorV = follows
    ? Math.max(author.value, followedBack ? 0.9 : 0.8)
    : followedBack
      ? Math.max(author.value, 0.25)
      : author.value;

  /* Independent evidence combines as a noisy or, not an average: a full match
     on one strong dimension is already strong relevance (0.7 for a topic), and
     each further match adds to what is left. An average would cap a perfect
     topic match at a third and let popularity outrank it. */
  const overall = clamp01(
    1 -
      (1 - 0.7 * topicV) *
        (1 - 0.7 * authorV) *
        (1 - 0.5 * entity) *
        (1 - 0.5 * terms) *
        (1 - 0.2 * kind.value),
  );

  const negative = clamp01(
    Math.max(topic?.neg ?? 0, author.neg, kind.neg * 0.5, saturate(termNeg, 4) * 0.6),
  );

  const shortTerm = clamp01(
    Math.max(topic?.short ?? 0, author.short, tool?.short ?? 0, model?.short ?? 0),
  );

  const dims: [InterestMatch["strongest"], number][] = [
    ["topic", topicV],
    ["author", authorV],
    ["entity", entity],
    ["terms", terms],
    ["kind", kind.value * 0.5],
  ];
  dims.sort((a, b) => b[1] - a[1]);
  const strongest = dims[0][1] > 0.15 ? dims[0][0] : null;

  return { topic: topicV, author: authorV, kind: kind.value, entity, terms, shortTerm, negative, overall, strongest };
}

/* The top keys of a dimension, strongest first. Used to pick which topics and
   authors to retrieve candidates for, and which terms to search on. */
export function topKeys(profile: InterestProfile, dimension: string, n: number): string[] {
  const prefix = `${dimension}:`;
  const combined = new Map<string, number>();
  for (const [k, v] of profile.longTerm) if (k.startsWith(prefix)) combined.set(k, v);
  for (const [k, v] of profile.shortTerm) {
    if (k.startsWith(prefix)) combined.set(k, (combined.get(k) ?? 0) + v * 0.7);
  }
  for (const [k, v] of profile.negative) {
    if (k.startsWith(prefix) && combined.has(k)) combined.set(k, (combined.get(k) ?? 0) - v);
  }
  return [...combined.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k.slice(prefix.length));
}

/* Cold start: too little history to personalise on. */
export function isColdStart(profile: InterestProfile | null): boolean {
  return !profile || profile.evidence < 3;
}
