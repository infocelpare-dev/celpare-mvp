import { SECTION_SIZE, SECTION_TYPES } from "./config";
import type { ExploreProfile } from "./profile";
import type { ExploreSectionId, SectionRanking } from "./types";

/*
  The order of the shelves on the All tab (D156).

  For you is always first and Continue exploring always last: anchors keep the
  page recognisable. The shelves between are ordered by how much each is worth
  to this person: how full it is, how much of what it holds this person
  actually opens, and how strong its leading items are.

  A cold viewer gets the registry order (the founder's conceptual order), since
  there is nothing yet to order by. Deterministic: the same inputs give the
  same order, so streaming never reshuffles a page already on screen.
*/

export const DEFAULT_ORDER: ExploreSectionId[] = [
  "for-you",
  "trending",
  "rising",
  "new-and-recent",
  "recommended-tools",
  "recommended-models",
  "people",
  "discussions",
  "topics",
  "videos",
  "continue-exploring",
];

/* Which entity types this person opens, as shares of their clicks. */
export function typeAffinity(profile: ExploreProfile): Map<string, number> {
  const counts = new Map<string, number>();
  let total = 0;
  for (const key of [...profile.clicked.keys(), ...profile.owned]) {
    const type = key.slice(0, key.indexOf(":"));
    counts.set(type, (counts.get(type) ?? 0) + 1);
    total += 1;
  }
  const out = new Map<string, number>();
  if (total > 0) for (const [t, n] of counts) out.set(t, n / total);
  return out;
}

export function orderSections(rankings: Map<ExploreSectionId, SectionRanking>, profile: ExploreProfile): ExploreSectionId[] {
  if (profile.cold) return DEFAULT_ORDER;
  const affinity = typeAffinity(profile);
  const middle = DEFAULT_ORDER.filter((id) => id !== "for-you" && id !== "continue-exploring");
  const value = (id: ExploreSectionId) => {
    const r = rankings.get(id);
    if (!r) return 0;
    const fill = Math.min(1, r.items.length / SECTION_SIZE[id]);
    const kinds = SECTION_TYPES[id];
    const aff = kinds.reduce((a, t) => Math.max(a, affinity.get(t) ?? 0), 0);
    const top = r.items.slice(0, 3);
    const strength = top.length ? top.reduce((a, s) => a + s.final, 0) / top.length : 0;
    return fill * (0.5 + 0.5 * aff) * (0.6 + 0.4 * strength);
  };
  const scored = middle.map((id, i) => ({ id, v: value(id), i }));
  /* Stable: equal values keep the registry order. */
  scored.sort((a, b) => (Math.abs(b.v - a.v) > 1e-9 ? b.v - a.v : a.i - b.i));
  return ["for-you", ...scored.map((s) => s.id), "continue-exploring"];
}
