import { TMR_V1 } from "./config";
import type { CatalogueIndex } from "./catalogue";
import type { SparseVector } from "./similarity/lexical";
import { sessionRelevance, userRelevance, type UserContext } from "./user";

/*
  The Search tie-break (D181, guide 17 section 9).

  SEARCH STAYS A SEARCH ENGINE. Its formula is untouched; this runs after it.
  Adjacent results whose relevance is within SEARCH_TIE_RATIO of the first of
  their group form a tie group, and only inside a group does the person's own
  context (long and recent interests, what they are researching this session)
  decide the order. A result that is more relevant than the one below it by more
  than the ratio can never be passed, so an exact name match stays first and a
  personal favourite cannot jump an unrelated query.
*/

export type Rankable = { key: string; relevance: number };

/* How much this viewer's context favours an entry, 0..1. */
export function contextPreference(key: string, index: CatalogueIndex, user: UserContext, queryVector: SparseVector | null): number {
  const e = index.entities.get(key);
  if (!e || user.cold) return 0;
  return Math.max(userRelevance(e, user), sessionRelevance(e, user, queryVector, index));
}

export function tieGroups<T extends Rankable>(ranked: T[], ratio: number = TMR_V1.SEARCH_TIE_RATIO): T[][] {
  const groups: T[][] = [];
  for (const item of ranked) {
    const g = groups[groups.length - 1];
    const leader = g?.[0];
    if (leader && leader.relevance > 0 && Math.abs(leader.relevance - item.relevance) <= ratio * leader.relevance) g.push(item);
    else groups.push([item]);
  }
  return groups;
}

/* Reorders inside tie groups only, stably. Returns the same items. */
export function tieBreak<T extends Rankable>(ranked: T[], preference: (key: string) => number, ratio?: number): T[] {
  const out: T[] = [];
  for (const group of tieGroups(ranked, ratio)) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const withPref = group.map((item, i) => ({ item, i, p: preference(item.key) }));
    withPref.sort((a, b) => b.p - a.p || a.i - b.i);
    out.push(...withPref.map((x) => x.item));
  }
  return out;
}
