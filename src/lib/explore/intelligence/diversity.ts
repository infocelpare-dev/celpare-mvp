import { limitRuns } from "../../community/intelligence/diversity";
import { EXPLORE_V1 } from "./config";
import type { ExploreScored } from "./types";

/*
  Explore is meant to be far more varied than the feed (brief section 23).

    entity type   at most 2 of one type in a row on a mixed shelf
    topic, category, provider   at most 3 per shelf
    creator or developer        at most 2 per shelf

  Items over a cap are HELD BACK, not deleted: they return only if the shelf
  would otherwise be short. What does not fit is reported as a diversity cut,
  which is what the admin `why` view shows.

  `firstPassKey` is the tighter rule the Tools and Models shelves use: one per
  category (or provider) before any second one, the same rule search's
  recommendation row follows, because a shelf of eight that shows four image
  generators has told somebody about five things, not eight.
*/

export type DiversityOptions = {
  size: number;
  mixed: boolean;
  firstPassKey?: (s: ExploreScored) => string | null;
};

function providerOf(s: ExploreScored): string | null {
  const g = s.candidate.groupKey;
  return g && g.startsWith("provider:") ? g : null;
}

export function diversify(
  items: ExploreScored[],
  opts: DiversityOptions,
): { kept: ExploreScored[]; cut: ExploreScored[]; capped: Set<string> } {
  const D = EXPLORE_V1.DIVERSITY;
  const group = new Map<string, number>();
  const owner = new Map<string, number>();
  const within: ExploreScored[] = [];
  const held: ExploreScored[] = [];

  /* Pass 0: one per first pass key. */
  let ordered = items;
  if (opts.firstPassKey) {
    const seen = new Set<string>();
    const first: ExploreScored[] = [];
    const second: ExploreScored[] = [];
    for (const s of items) {
      const k = opts.firstPassKey(s);
      if (k && seen.has(k)) second.push(s);
      else {
        if (k) seen.add(k);
        first.push(s);
      }
    }
    ordered = [...first, ...second];
  }

  for (const s of ordered) {
    const g = s.candidate.groupKey;
    const o = s.candidate.ownerId;
    const groupCap = providerOf(s) ? D.MAX_PER_PROVIDER : D.MAX_PER_GROUP;
    const overGroup = g !== null && (group.get(g) ?? 0) >= groupCap;
    const overOwner = o !== null && s.candidate.entityType !== "person" && (owner.get(o) ?? 0) >= D.MAX_PER_OWNER;
    if (overGroup || overOwner) {
      held.push(s);
      continue;
    }
    within.push(s);
    if (g) group.set(g, (group.get(g) ?? 0) + 1);
    if (o) owner.set(o, (owner.get(o) ?? 0) + 1);
  }

  let list = [...within, ...held];
  if (opts.mixed) {
    list = limitRuns(list, (s) => s.candidate.entityType, D.MAX_TYPE_RUN);
  }
  return { kept: list.slice(0, opts.size), cut: list.slice(opts.size), capped: new Set(held.map((h) => h.candidate.key)) };
}

/* A cap per entity type inside one shelf (New and recently added: 3 each). */
export function capPerType(items: ExploreScored[], cap: number): { kept: ExploreScored[]; cut: ExploreScored[] } {
  const count = new Map<string, number>();
  const kept: ExploreScored[] = [];
  const cut: ExploreScored[] = [];
  for (const s of items) {
    /* A video is a post, and a category is a topic, for the purpose of a cap. */
    const e = s.candidate.entityType;
    const t = e === "video" ? "post" : e === "category" ? "topic" : e;
    const n = count.get(t) ?? 0;
    if (n >= cap) cut.push(s);
    else {
      kept.push(s);
      count.set(t, n + 1);
    }
  }
  return { kept, cut };
}
