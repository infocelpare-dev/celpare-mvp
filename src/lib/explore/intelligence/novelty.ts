import { halfLifeDecay } from "../../community/intelligence/math";
import { EXPLORE_V1 } from "./config";
import type { ExploreProfile } from "./profile";
import type { ExploreCandidate } from "./types";

/*
  Novelty: is this new to this person? (brief section 9)

    never shown                      1.0
    shown on Explore, never opened   0.7, recovering to 1 over three days
    opened or clicked                0.25, half the gap back every 14 days
    saved, followed, collected       0.1, half the gap back every 30 days

  Nothing is hidden permanently: resurfacing is the decay. A candidate from a
  creator, topic or category the person has never touched earns a bonus, which
  is how Explore reaches past what they already know.
*/

const TAXONOMY = ["topic:", "category:", "tag:", "provider:", "modality:", "author:"];

export function isNewTerritory(c: ExploreCandidate, profile: ExploreProfile): boolean {
  if (profile.cold) return false;
  const keys = c.featureKeys.filter((k) => TAXONOMY.some((p) => k.startsWith(p)));
  if (keys.length === 0) return false;
  return keys.every((k) => !profile.touched.has(k) && !profile.long.has(k));
}

function recover(base: number, ageDays: number, halfLifeDays: number): number {
  /* Starts at base, closes half the gap to 1 every half life. */
  return 1 - (1 - base) * halfLifeDecay(ageDays, halfLifeDays);
}

export type NoveltyReading = { novelty: number; resurfaced: boolean; newTerritory: boolean };

export function noveltyOf(c: ExploreCandidate, profile: ExploreProfile, now: number): NoveltyReading {
  const N = EXPLORE_V1.NOVELTY;
  const day = 86_400_000;
  let novelty = 1;
  let resurfaced = false;

  if (profile.owned.has(c.key)) {
    novelty = N.OWNED;
  } else {
    const clicked = profile.clicked.get(c.key);
    if (clicked !== undefined) {
      novelty = recover(N.CLICKED, (now - clicked) / day, N.CLICKED_HALF_LIFE_DAYS);
      resurfaced = novelty > 0.6;
    } else {
      const served = profile.served.get(c.key);
      if (served) {
        /* Repeated serves without a click push it further down. */
        const base = Math.pow(N.SERVED, Math.min(3, served.count));
        novelty = recover(base, (now - served.last) / 3_600_000, N.SERVED_RECOVER_HOURS);
      }
    }
  }

  const newTerritory = isNewTerritory(c, profile);
  if (newTerritory) novelty = Math.min(1, novelty + N.NEW_TERRITORY_BONUS);
  return { novelty, resurfaced, newTerritory };
}
