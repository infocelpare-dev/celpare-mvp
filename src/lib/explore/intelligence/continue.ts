import { halfLifeDecay } from "../../community/intelligence/math";
import { EXPLORE_V1 } from "./config";
import type { ExploreProfile } from "./profile";

/*
  Continue exploring (brief section 28): the discovery journey, not the feed.

  The seeds are the last things this person opened on Explore in this sitting
  (or, when the sitting is empty, in the last week). The shelf is whatever sits
  nearest those seeds across every type: explored AI video generation, then
  Runway, then Kling, so the shelf offers Veo, AI video models, avatar tools
  and the discussions about them.

  With no seeds there is nothing to continue, and the section falls back to
  the person's recent activity list (my_recent_activity), which it showed
  before explore_v1.
*/

export type Seeds = { keys: string[]; weights: Map<string, number> };

export function continueSeeds(
  profile: ExploreProfile,
  keysOf: (key: string) => string[] | undefined,
  now: number,
): Seeds {
  const max = EXPLORE_V1.CONTINUE_SEEDS;
  let seeds = profile.sessionSeeds.slice(0, max).map((s) => ({ key: s.key, at: s.at }));
  if (seeds.length === 0) {
    const week = now - 7 * 86_400_000;
    seeds = [...profile.clicked.entries()]
      .filter(([k, at]) => at >= week && !k.startsWith("post:") && !k.startsWith("video:"))
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([key, at]) => ({ key, at }));
  }
  const weights = new Map<string, number>();
  for (const s of seeds) {
    const recency = halfLifeDecay((now - s.at) / 3_600_000, 24);
    for (const k of keysOf(s.key) ?? []) {
      if (k === s.key) continue;
      const w = k.startsWith("term:") ? 0.4 * recency : recency;
      weights.set(k, Math.max(weights.get(k) ?? 0, w));
    }
  }
  return { keys: seeds.map((s) => s.key), weights };
}
