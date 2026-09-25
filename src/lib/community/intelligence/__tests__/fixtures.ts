import { CONTROL } from "../experiments";
import { buildInterestProfile } from "../interests";
import { emptyBuckets, type Candidate, type ContentItem, type InterestSignal, type PostSignals, type RankingContext, type SignalStat, type SignalType } from "../types";

/*
  Test fixtures. Synthetic by necessity and labelled as such: these are inputs
  to pure functions, never rows in the database and never shown to anybody.
*/

export const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
export const H = 3_600_000;

let seq = 0;
export function uuid(prefix = "p"): string {
  seq += 1;
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}

/* Distinct words per default post, so two default posts are never near
   duplicates, or the same story (text.ts sameStory: a shared capitalised name
   and much of the wording), of each other by accident. Lower case, and only
   one fixed word ("entry"). */
const WORDS = ["river", "lantern", "copper", "meadow", "falcon", "harbor", "violet", "summit", "ember", "quartz", "willow", "canyon"];

export function item(over: Partial<ContentItem> = {}): ContentItem {
  const id = over.id ?? uuid("post");
  const n = seq;
  return {
    id,
    authorId: over.authorId ?? "author-a",
    body:
      over.body ??
      `about ${WORDS[n % WORDS.length]} ${WORDS[(n * 7 + 3) % WORDS.length]} and ${WORDS[(n * 5 + 1) % WORDS.length]}, entry ${n}`,
    createdAt: over.createdAt ?? NOW - 2 * H,
    topicId: over.topicId === undefined ? "topic-agents" : over.topicId,
    kind: over.kind ?? "text",
    toolId: over.toolId ?? null,
    modelId: over.modelId ?? null,
    linkUrl: over.linkUrl ?? null,
    media: over.media ?? "text",
    counts: over.counts ?? { likes: 0, comments: 0, saves: 0, reposts: 0 },
  };
}

/*
  Signals from a compact spec: for each type, distinct people per bucket
  [<1h, 1-6h, 6-24h, 24-72h, 72h-7d, older]. Event counts equal people unless
  `events` is given. `avg` sets the mean measure (watch percent).
*/
export function signals(
  spec: Partial<Record<SignalType, number[]>>,
  extra: { avg?: Partial<Record<SignalType, number>>; events?: Partial<Record<SignalType, number[]>>; qualifiedReports?: number; authorInactive?: boolean } = {},
): PostSignals {
  const byType: Partial<Record<SignalType, SignalStat>> = {};
  for (const [type, arr] of Object.entries(spec) as [SignalType, number[]][]) {
    const uniq = emptyBuckets();
    const n = emptyBuckets();
    arr.forEach((v, i) => {
      uniq[i] = v;
      n[i] = extra.events?.[type]?.[i] ?? v;
    });
    byType[type] = {
      uniq,
      n,
      total: n.reduce((a, b) => a + b, 0),
      totalUniq: uniq.reduce((a, b) => a + b, 0),
      avg: extra.avg?.[type] ?? null,
    };
  }
  return {
    byType,
    qualifiedReports: extra.qualifiedReports ?? 0,
    authorInactive: extra.authorInactive ?? false,
  };
}

export function ctx(over: Partial<RankingContext> = {}): RankingContext {
  return {
    userId: over.userId === undefined ? "viewer" : over.userId,
    sessionId: null,
    surface: over.surface ?? "for_you",
    now: over.now ?? NOW,
    algorithm: over.algorithm ?? "feed_v1",
    variant: "control",
    experimentId: null,
  };
}

export function cand(i: ContentItem, source: Candidate["sources"][number] = "fresh"): Candidate {
  return { item: i, sources: [source], reasons: [] };
}

export function profileFrom(userId: string, sigs: InterestSignal[]) {
  return buildInterestProfile(userId, sigs, NOW);
}

export const control = CONTROL;
