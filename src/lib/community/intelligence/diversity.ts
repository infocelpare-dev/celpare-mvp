import { isNearDuplicate } from "./text";
import type { ContentItem, InterestProfile } from "./types";

/*
  Diversity and frequency controls. They run AFTER relevance scoring and only
  reorder or trim what ranking produced: diversity must never replace relevance,
  only stop one creator, topic, format or post from taking over the screen.

  NOTHING IS DROPPED BY A RUN LIMIT. A fourth post by one author is held back
  until somebody else has had a turn, and if nobody else is left it still goes
  out, in score order. Only exact or near duplicates are removed, because a
  duplicate is not a post anybody loses by not seeing twice.
*/

export const DIVERSITY = {
  MAX_AUTHOR_RUN: 2,
  MAX_TOPIC_RUN: 3,
  MAX_MEDIA_RUN: 3,
  /* Post kinds (question, launch, announcement...) in a row. */
  MAX_KIND_RUN: 3,
  /* A format the person clearly prefers may run this much longer. */
  PREFERRED_MEDIA_BONUS: 1,
  /* No author holds more than this share of one page (at least 2 posts). */
  MAX_AUTHOR_SHARE: 0.3,
  /* A post shown this many times already is suppressed to the end. */
  SEEN_SUPPRESS_COUNT: 3,
  /* Seen within this many hours counts as recently seen. */
  RECENT_SEEN_HOURS: 24,
} as const;

type Has = { item: ContentItem };

/*
  The general run limit: no more than `maxRun` consecutive items sharing a key
  (a number, or a number per key). Items whose key is null never form a run.
  A generalisation of the feed's original interleaveAuthors, which stays where
  it is for the chronological modes.
*/
export function limitRuns<T>(
  items: T[],
  keyOf: (t: T) => string | null,
  maxRun: number | ((key: string) => number),
): T[] {
  const cap = (k: string) => (typeof maxRun === "number" ? maxRun : maxRun(k));
  const out: T[] = [];
  const held: T[] = [];
  let lastKey: string | null = null;
  let run = 0;
  const queue = [...items];

  while (queue.length > 0 || held.length > 0) {
    const heldIndex = held.findIndex((t) => keyOf(t) === null || keyOf(t) !== lastKey);
    if (lastKey !== null && run >= cap(lastKey) && heldIndex !== -1) {
      const [t] = held.splice(heldIndex, 1);
      const k = keyOf(t);
      out.push(t);
      run = k !== null && k === lastKey ? run + 1 : 1;
      lastKey = k;
      continue;
    }
    const next = queue.shift();
    if (!next) {
      out.push(...held);
      break;
    }
    const k = keyOf(next);
    if (k !== null && k === lastKey && run >= cap(k)) {
      held.push(next);
      continue;
    }
    out.push(next);
    run = k !== null && k === lastKey ? run + 1 : 1;
    lastKey = k;
  }
  return out;
}

export function applyAuthorDiversity<T extends Has>(items: T[], max: number = DIVERSITY.MAX_AUTHOR_RUN): T[] {
  return limitRuns(items, (t) => t.item.authorId, max);
}

export function applyTopicDiversity<T extends Has>(items: T[], max: number = DIVERSITY.MAX_TOPIC_RUN): T[] {
  return limitRuns(items, (t) => t.item.topicId, max);
}

export function applyMediaDiversity<T extends Has>(items: T[], max: number = DIVERSITY.MAX_MEDIA_RUN): T[] {
  /* Text is the default format; runs of text are not what this guards against. */
  return limitRuns(items, (t) => (t.item.media === "text" ? null : t.item.media), max);
}

/* Too short to call two texts the same post: "wow" under two different videos
   is two posts. */
const MIN_WORDS_FOR_DUPLICATE = 6;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* Remove repeated ids and near duplicate texts, keeping the first (highest
   ranked). */
export function applyContentDiversity<T extends Has>(items: T[]): T[] {
  const kept: T[] = [];
  const ids = new Set<string>();
  for (const t of items) {
    if (ids.has(t.item.id)) continue;
    const long = wordCount(t.item.body) >= MIN_WORDS_FOR_DUPLICATE;
    if (
      long &&
      kept.some(
        (k) =>
          wordCount(k.item.body) >= MIN_WORDS_FOR_DUPLICATE &&
          isNearDuplicate(k.item.body, t.item.body),
      )
    ) {
      continue;
    }
    ids.add(t.item.id);
    kept.push(t);
  }
  return kept;
}

/* Content types beyond the media format: questions, launches, announcements.
   Plain text posts are the default kind and do not form runs. */
export function applyKindDiversity<T extends Has>(items: T[], max: number = DIVERSITY.MAX_KIND_RUN): T[] {
  return limitRuns(items, (t) => (t.item.kind === "text" ? null : t.item.kind), max);
}

export type DiversityOptions = {
  /* The format this person's behaviour favours, if any (pipeline.ts decides). */
  preferredMedia?: ContentItem["media"] | null;
};

/* All five, in the order that makes sense: remove duplicates, then spread
   authors (the strongest constraint), then topics, then kinds, then formats.
   Diversity only reorders what relevance produced; it never replaces it. */
export function applyDiversity<T extends Has>(items: T[], opts: DiversityOptions = {}): T[] {
  const media = applyTopicDiversity(applyAuthorDiversity(applyContentDiversity(items)));
  const kinds = applyKindDiversity(media);
  const preferred = opts.preferredMedia;
  if (!preferred || preferred === "text") return applyMediaDiversity(kinds);
  /* A preferred format runs one longer before another format has a turn. */
  return limitRuns(
    kinds,
    (t) => (t.item.media === "text" ? null : t.item.media),
    (k) => (k === preferred ? DIVERSITY.MAX_MEDIA_RUN + DIVERSITY.PREFERRED_MEDIA_BONUS : DIVERSITY.MAX_MEDIA_RUN),
  );
}

/*
  Frequency controls: what the person has already been shown.
  Heavily repeated posts go to the end rather than vanishing, and no creator
  holds more than MAX_AUTHOR_SHARE of a page.
*/
export function applyFrequencyControls<T extends Has>(
  items: T[],
  profile: InterestProfile | null,
  pageSize: number,
  now: number,
): T[] {
  let list = items;

  if (profile && profile.seen.size > 0) {
    const fresh: T[] = [];
    const stale: T[] = [];
    for (const t of list) {
      const seen = profile.seen.get(t.item.id);
      const recent = seen && (now - seen.lastAt) / 3_600_000 < DIVERSITY.RECENT_SEEN_HOURS;
      if (seen && (seen.impressions >= DIVERSITY.SEEN_SUPPRESS_COUNT || (recent && seen.impressions >= 2))) stale.push(t);
      else fresh.push(t);
    }
    list = [...fresh, ...stale];
  }

  /* Per page creator cap, applied page by page. */
  const cap = Math.max(2, Math.floor(pageSize * DIVERSITY.MAX_AUTHOR_SHARE));
  const out: T[] = [];
  let pending = [...list];
  while (pending.length) {
    const page: T[] = [];
    const overflow: T[] = [];
    const perAuthor = new Map<string, number>();
    for (const t of pending) {
      if (page.length >= pageSize) {
        overflow.push(t);
        continue;
      }
      const n = perAuthor.get(t.item.authorId) ?? 0;
      if (n >= cap) overflow.push(t);
      else {
        perAuthor.set(t.item.authorId, n + 1);
        page.push(t);
      }
    }
    /* If the cap left the page short because only a few authors exist, fill it
       from the overflow in order: the cap limits dominance, not supply. */
    while (page.length < pageSize && overflow.length) page.push(overflow.shift()!);
    out.push(...page);
    if (overflow.length === pending.length) {
      out.push(...overflow);
      break;
    }
    pending = overflow;
  }
  return out;
}
