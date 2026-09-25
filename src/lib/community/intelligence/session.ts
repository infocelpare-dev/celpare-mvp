import { INTENT_RULES, SESSION, type Intent } from "./config";
import { consumptionDepth, signalKeys, signalWeight, type SessionProfile } from "./interests";
import { halfLifeDecay } from "./math";
import type { FeatureKey, InterestSignal } from "./types";

/*
  Session intelligence: what this person is doing RIGHT NOW.

  Built from the same history as the long term profile, restricted to the last
  SESSION.WINDOW_MINUTES and decayed in minutes. Every kind of action counts:
  reading and watching, saving, searching, comparing, asking. So "watched an AI
  video, opened a coding post, saved a discussion, searched LLM coding" becomes
  a session leaning toward those topics and words on the very next request.

  IT BOOSTS, IT DOES NOT REWRITE. The long term profile is rebuilt separately
  on every request from the whole history, so a few actions in one sitting
  change what comes next without redefining the person.
*/

function bump(map: Map<FeatureKey, number>, key: FeatureKey, by: number) {
  if (!(by > 0)) return;
  map.set(key, (map.get(key) ?? 0) + by);
}

function count(map: Map<string, number>, key: string | null | undefined) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

/* feed_v3 rows that are not this person's own doing in this sitting: other
   people's actions toward them, and deliveries nobody looked at. */
const NOT_THE_SITTING = new Set<InterestSignal["action"]>(["engaged_me", "followed_by", "served"]);

export function sessionSignals(signals: InterestSignal[], now: number): InterestSignal[] {
  const since = now - SESSION.WINDOW_MINUTES * 60_000;
  return signals
    .filter((s) => s.at >= since && s.at <= now && !NOT_THE_SITTING.has(s.action))
    .sort((a, b) => a.at - b.at);
}

export function buildSessionProfile(
  userId: string | null,
  signals: InterestSignal[],
  now: number,
): SessionProfile {
  const recent = sessionSignals(signals, now);
  const interests = new Map<FeatureKey, number>();
  const negative = new Map<FeatureKey, number>();
  const consumed = new Set<string>();
  const topicCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  const mediaCounts = new Map<string, number>();
  const authors: string[] = [];
  const topics: (string | null)[] = [];

  for (const s of recent) {
    const minutes = (now - s.at) / 60_000;
    const d = halfLifeDecay(minutes, SESSION.HALF_LIFE_MINUTES);

    /* Exposure, whether shown or acted on, feeds novelty and saturation. */
    if (s.postId && (s.action === "seen" || consumptionDepth(s))) {
      count(topicCounts, s.topicId);
      count(authorCounts, s.authorId && s.authorId !== userId ? s.authorId : null);
      if (s.action === "watch" || s.action === "complete" || s.action === "skip" || s.action === "video_start") {
        count(mediaCounts, "video");
      }
      authors.push(s.authorId ?? "");
      topics.push(s.topicId ?? null);
    }

    /* Consumed: somebody did something with it beyond it passing by. */
    const depth = consumptionDepth(s);
    if (s.postId && depth && depth !== "brief") consumed.add(s.postId);

    const w = signalWeight(s);
    if (w === 0) continue;
    const target = w > 0 ? interests : negative;
    for (const [key, factor] of signalKeys(s, userId)) bump(target, key, Math.abs(w) * factor * d);
  }

  return {
    interests,
    negative,
    recentAuthors: authors.filter(Boolean).reverse(),
    recentTopics: topics.reverse(),
    consumed,
    topicCounts,
    authorCounts,
    mediaCounts,
    lastAt: recent.length ? recent[recent.length - 1].at : 0,
  };
}

/* ------------------------------------------------------------- intent */

export type IntentReading = {
  intent: Intent;
  /* 0..1, how clearly the behaviour matches. Browsing is 0.5 by definition. */
  confidence: number;
  focusTopic: string | null;
  focusAuthor: string | null;
};

const STRONG = new Set(["save", "comment", "repost", "complete", "follow"]);

/*
  Intent from behaviour, by rules a person can read. The priority order is
  research, deep interest, topic exploration, social, browsing: the more
  deliberate behaviour wins when several match.
*/
export function inferIntent(userId: string | null, signals: InterestSignal[], now: number): IntentReading {
  const recent = sessionSignals(signals, now);
  if (recent.length === 0) return { intent: "browsing", confidence: 0.5, focusTopic: null, focusAuthor: null };

  const queries = recent.filter((s) => s.action === "search" || s.action === "compare" || s.action === "ask").length;
  const followups = recent.filter((s) => s.action === "save" || s.action === "profile_visit" || s.action === "open" || s.action === "explore").length;

  const strongByTopic = new Map<string, number>();
  const authorsByTopic = new Map<string, Set<string>>();
  const byAuthor = new Map<string, number>();
  for (const s of recent) {
    if (s.action === "seen") continue;
    if (s.topicId && STRONG.has(s.action)) strongByTopic.set(s.topicId, (strongByTopic.get(s.topicId) ?? 0) + 1);
    if (s.topicId && s.authorId && consumptionDepth(s)) {
      const set = authorsByTopic.get(s.topicId) ?? new Set<string>();
      set.add(s.authorId);
      authorsByTopic.set(s.topicId, set);
    }
    if (s.authorId && s.authorId !== userId && (consumptionDepth(s) || s.action === "follow")) {
      byAuthor.set(s.authorId, (byAuthor.get(s.authorId) ?? 0) + 1);
    }
  }

  const top = <T,>(m: Map<string, T>, v: (x: T) => number): [string, number] | null => {
    let best: [string, number] | null = null;
    for (const [k, x] of m) if (!best || v(x) > best[1]) best = [k, v(x)];
    return best;
  };
  const deep = top(strongByTopic, (n) => n);
  const explore = top(authorsByTopic, (s) => s.size);
  const social = top(byAuthor, (n) => n);

  if (queries >= INTENT_RULES.RESEARCH_QUERIES && followups >= INTENT_RULES.RESEARCH_FOLLOWUPS) {
    return { intent: "research", confidence: Math.min(1, 0.5 + 0.1 * (queries + followups)), focusTopic: deep?.[0] ?? null, focusAuthor: null };
  }
  if (deep && deep[1] >= INTENT_RULES.DEEP_STRONG_ACTIONS) {
    return { intent: "deep_interest", confidence: Math.min(1, 0.4 + 0.2 * deep[1]), focusTopic: deep[0], focusAuthor: null };
  }
  if (explore && explore[1] >= INTENT_RULES.EXPLORE_TOPIC_AUTHORS) {
    return { intent: "topic_exploration", confidence: Math.min(1, 0.3 + 0.15 * explore[1]), focusTopic: explore[0], focusAuthor: null };
  }
  if (social && social[1] >= INTENT_RULES.SOCIAL_AUTHOR_ACTIONS) {
    return { intent: "social", confidence: Math.min(1, 0.3 + 0.15 * social[1]), focusTopic: null, focusAuthor: social[0] };
  }
  return { intent: "browsing", confidence: 0.5, focusTopic: null, focusAuthor: null };
}
