import { halfLifeDecay } from "./math";
import { isNearDuplicate } from "./text";
import type { ContentItem, SeenDepth, SeenRecord, SeenState } from "./types";

export type { SeenDepth, SeenRecord, SeenState } from "./types";

/*
  Seen state: what this person has already been shown or consumed, and how
  strongly that should keep the exact post away.

  WHY THIS FILE EXISTS (2026-09-24). The feed recorded every impression and
  read them back, and a post seen once still came back at the top on refresh.
  Two causes: one impression lowered a score by about a fifth, which a strongly
  relevant post shrugs off; and the last impressions before a reload were still
  in flight when the next page was ranked. The fix is not a bigger number. It is
  a two tier pool: posts seen recently are ranked AFTER every unseen post, and
  only fill the feed when nothing unseen is left.

  SEEN IS NOT DISLIKED. Seeing a post suppresses THAT post (and near copies of
  it). It never lowers interest in its topic or creator; what the person did
  with it (opened, read, watched, saved) raises interest as it always did, so the
  feed moves on to related posts rather than repeating the same one.
*/

export const SEEN = {
  /* Hours a post stays in the fallback tier after being seen, by depth. A post
     that only flashed past for a second comes back sooner than one read or
     watched to the end. */
  FALLBACK_HOURS: { served: 0, brief: 12, viewed: 48, consumed: 96 } as Record<SeenDepth, number>,
  /* Seen this many times: the fallback window doubles. */
  REPEAT_IMPRESSIONS: 3,
  /* After the fallback window a post rejoins the unseen tier with a penalty
     that fades on this half life, and disappears after this many days. */
  PENALTY_MAX: 0.6,
  PENALTY_HALF_LIFE_HOURS: 72,
  PENALTY_UNTIL_DAYS: 14,
  /* Dwell that turns a glance into a read. */
  VIEWED_DWELL_MS: 6000,
  CONSUMED_DWELL_MS: 20000,
  /* Watch share that turns a skip into a view, and a view into consumption. */
  VIEWED_WATCH_PERCENT: 20,
  CONSUMED_WATCH_PERCENT: 80,
  /* feed_v3 served state: delivered, never on screen. A light penalty that
     rotates a refresh without burying the post; delivered this many times
     without once being seen, it goes to the recently seen tier for a while. */
  SERVED_PENALTY: 0.25,
  SERVED_HALF_LIFE_HOURS: 2,
  SERVED_PENALTY_UNTIL_HOURS: 24,
  SERVED_TO_TIER: 3,
  SERVED_TIER_HOURS: 6,
} as const;

const RANK: Record<SeenDepth, number> = { served: -1, brief: 0, viewed: 1, consumed: 2 };

export function deeper(a: SeenDepth, b: SeenDepth): SeenDepth {
  return RANK[a] >= RANK[b] ? a : b;
}

/* Merge one piece of evidence into the state. */
export function markSeen(
  state: SeenState,
  postId: string,
  at: number,
  depth: SeenDepth,
  source: SeenRecord["source"],
  impression = true,
) {
  const prev = state.get(postId);
  const src = prev?.source === "session" || source === "session" ? "session" : "history";
  if (depth === "served") {
    /* A delivery counts deliveries. Once the post has really been seen it only
       counts, so a later delivery cannot extend how long it counts as seen. */
    const serves = (prev?.serves ?? 0) + 1;
    if (prev && prev.depth !== "served") {
      state.set(postId, { ...prev, serves, source: src });
    } else {
      state.set(postId, { lastAt: Math.max(prev?.lastAt ?? 0, at), impressions: 0, depth: "served", serves, source: src });
    }
    return;
  }
  const upgradeFromServed = prev?.depth === "served";
  state.set(postId, {
    lastAt: upgradeFromServed ? at : Math.max(prev?.lastAt ?? 0, at),
    impressions: (prev?.impressions ?? 0) + (impression ? 1 : 0),
    depth: prev ? deeper(prev.depth, depth) : depth,
    ...(prev?.serves ? { serves: prev.serves } : {}),
    source: src,
  });
}

export function fallbackWindowHours(r: SeenRecord): number {
  const base = SEEN.FALLBACK_HOURS[r.depth];
  return r.impressions >= SEEN.REPEAT_IMPRESSIONS ? base * 2 : base;
}

/* Is it recently seen, i.e. in the fallback tier right now? */
export function isRecentlySeen(r: SeenRecord | undefined, now: number): boolean {
  if (!r) return false;
  if (r.depth === "served") {
    return (r.serves ?? 0) >= SEEN.SERVED_TO_TIER && (now - r.lastAt) / 3_600_000 < SEEN.SERVED_TIER_HOURS;
  }
  return (now - r.lastAt) / 3_600_000 < fallbackWindowHours(r);
}

/*
  The penalty a post carries once it is back in the unseen tier: largest just
  after its fallback window ends, fading to nothing. 0 for a post never seen.
*/
export function seenPenalty(r: SeenRecord | undefined, now: number): number {
  if (!r) return 0;
  const hours = (now - r.lastAt) / 3_600_000;
  if (r.depth === "served") {
    if (isRecentlySeen(r, now)) return 1;
    if (hours > SEEN.SERVED_PENALTY_UNTIL_HOURS) return 0;
    return SEEN.SERVED_PENALTY * halfLifeDecay(Math.max(0, hours), SEEN.SERVED_HALF_LIFE_HOURS);
  }
  const window = fallbackWindowHours(r);
  if (hours < window) return 1;
  if (hours > SEEN.PENALTY_UNTIL_DAYS * 24) return 0;
  return SEEN.PENALTY_MAX * halfLifeDecay(hours - window, SEEN.PENALTY_HALF_LIFE_HOURS);
}

/*
  feed_v3 dwell hygiene: how long a post takes to read, so time on screen can
  be capped at a multiple of it. 250 words a minute, plus a look at an image or
  the opening of a video, never under three seconds. Shared by the server
  (which computes it per card) and the client (which caps dwell with it).
*/
export const READ = { WORDS_PER_MINUTE: 250, IMAGE_MS: 2500, VIDEO_MS: 15_000, MIN_MS: 3000, DWELL_CAP_FACTOR: 3, IDLE_MS: 30_000 } as const;

export function expectedReadMs(words: number, media: "text" | "image" | "video"): number {
  const text = (Math.max(0, words) / READ.WORDS_PER_MINUTE) * 60_000;
  const extra = media === "video" ? READ.VIDEO_MS : media === "image" ? READ.IMAGE_MS : 0;
  return Math.max(READ.MIN_MS, Math.round(text + extra));
}

export type Tier = "unseen" | "recently_seen";

/*
  Partition candidates. Recently seen posts, and near copies of posts that were
  recently read or watched, go to the fallback tier. A near copy of something
  that only flashed past is not held back: nobody consumed the original.
*/
export function partitionBySeen<T extends { item: ContentItem }>(
  candidates: T[],
  seen: SeenState,
  now: number,
  bodies: Map<string, string>,
): { unseen: T[]; recentlySeen: T[]; tierOf: Map<string, Tier> } {
  const consumedRecently: string[] = [];
  for (const [id, r] of seen) {
    if (r.depth !== "brief" && r.depth !== "served" && isRecentlySeen(r, now)) {
      const body = bodies.get(id);
      if (body) consumedRecently.push(body);
    }
  }

  const unseen: T[] = [];
  const recentlySeen: T[] = [];
  const tierOf = new Map<string, Tier>();
  for (const c of candidates) {
    const recent = isRecentlySeen(seen.get(c.item.id), now);
    const copy =
      !recent &&
      !seen.has(c.item.id) &&
      consumedRecently.some((b) => isNearDuplicate(b, c.item.body));
    if (recent || copy) {
      recentlySeen.push(c);
      tierOf.set(c.item.id, "recently_seen");
    } else {
      unseen.push(c);
      tierOf.set(c.item.id, "unseen");
    }
  }
  return { unseen, recentlySeen, tierOf };
}

/* ------------------------------------------------ the session cookie */

/*
  The immediate half of seen state. The browser appends each post it shows to
  a small first party cookie, so the very next request (a refresh, a Show more)
  knows what was just on screen without waiting for the impression beacon to be
  written. Shared by the client writer and the server reader, so the format
  cannot drift.

  Format: entries joined by ".", each `<12 hex of the id><depth b|v|c><seconds
  since epoch, base 36>`. Sixty entries is about 1.2 KB. It holds post id
  prefixes and times, nothing about the person.
*/
export const SEEN_COOKIE = "cp_seen";
/* 100 entries is about 2 KB. Raised from 60 for feed_v3, which also records
   served posts; served entries are evicted before seen ones. */
export const SEEN_COOKIE_MAX = 100;
export const SEEN_COOKIE_MAX_AGE_S = 2 * 24 * 3600;

const DEPTH_CODE: Record<SeenDepth, string> = { served: "s", brief: "b", viewed: "v", consumed: "c" };
const CODE_DEPTH: Record<string, SeenDepth> = { s: "served", b: "brief", v: "viewed", c: "consumed" };

export function seenKey(postId: string): string {
  return postId.replace(/-/g, "").slice(0, 12).toLowerCase();
}

export type CookieEntry = { key: string; depth: SeenDepth; at: number };

export function parseSeenCookie(value: string | undefined | null): CookieEntry[] {
  if (!value) return [];
  const out: CookieEntry[] = [];
  for (const raw of value.split(".").slice(-SEEN_COOKIE_MAX)) {
    const m = /^([0-9a-f]{12})([sbvc])([0-9a-z]{1,8})$/.exec(raw);
    if (!m) continue;
    const seconds = Number.parseInt(m[3], 36);
    if (!Number.isFinite(seconds)) continue;
    out.push({ key: m[1], depth: CODE_DEPTH[m[2]], at: seconds * 1000 });
  }
  return out;
}

export function addToSeenCookie(value: string | undefined | null, postId: string, depth: SeenDepth, at: number): string {
  const key = seenKey(postId);
  const entries = parseSeenCookie(value);
  const existing = entries.find((e) => e.key === key);
  const kept = entries.filter((e) => e.key !== key);
  /* A delivery never refreshes the time of a post already seen. */
  if (depth === "served" && existing && existing.depth !== "served") return serialiseCookie(entries);
  kept.push({ key, depth: existing ? deeper(existing.depth, depth) : depth, at });
  /* Over the cap, served entries go first, oldest first. */
  while (kept.length > SEEN_COOKIE_MAX) {
    const i = kept.findIndex((e) => e.depth === "served");
    kept.splice(i === -1 ? 0 : i, 1);
  }
  return serialiseCookie(kept);
}

function serialiseCookie(kept: CookieEntry[]): string {
  return kept
    .slice(-SEEN_COOKIE_MAX)
    .map((e) => `${e.key}${DEPTH_CODE[e.depth]}${Math.floor(e.at / 1000).toString(36)}`)
    .join(".");
}

/* Fold cookie entries into a seen state, for the candidates at hand. Entries
   newer than `asOf` are ignored: they happened after this feed was first built
   (Show more keeps its order). */
export function mergeCookieSeen(
  state: SeenState,
  entries: CookieEntry[],
  candidateIds: string[],
  asOf: number,
) {
  if (entries.length === 0) return;
  const byKey = new Map(entries.map((e) => [e.key, e]));
  for (const id of candidateIds) {
    const e = byKey.get(seenKey(id));
    if (!e || e.at > asOf) continue;
    markSeen(state, id, e.at, e.depth, "session");
  }
}
