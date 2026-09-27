import { EXPLORE_V1 } from "./config";
import type { DistanceBand, ExploreScored } from "./types";

/*
  Exploration versus exploitation (brief sections 10 and 11, D153).

  For you is filled 70% near, 20% adjacent and 10% far by discovery distance.
  The numbers are configuration, not truths, and an experiment can change them.

  EXPLORATION IS NOT RANDOM CONTENT. A far pick must still be good (quality
  floor) and either faintly relevant or broadly useful (popular or gaining
  momentum). Near and adjacent picks are ordinary relevant items.

  For a cold viewer everything is far, so the bands mean nothing: the shelf is
  the score order, which at cold start is quality, momentum and freshness.

  Placement is deterministic: the far picks go to evenly spaced positions, so
  the shelf does not end in a block of unfamiliar things and a refresh inside
  the same request cannot reorder it.
*/

export type Mix = { near: number; adjacent: number; far: number };

export function passesExplorationGate(s: ExploreScored): boolean {
  const f = s.features;
  const E = EXPLORE_V1;
  if (f.quality < E.EXPLORATION_MIN_QUALITY) return false;
  return f.personalRelevance >= E.EXPLORATION_MIN_RELEVANCE || f.popularity >= 0.3 || f.momentum >= 0.3;
}

export function bandTargets(size: number, mix: Mix): Record<DistanceBand, number> {
  const near = Math.round(size * mix.near);
  const adjacent = Math.round(size * mix.adjacent);
  return { near, adjacent, far: Math.max(0, size - near - adjacent) };
}

/*
  Returns the shelf, at most `size` long, and the candidates left over (in score
  order) for the diversity stage to fall back on.
*/
export function placeByBands(
  ranked: ExploreScored[],
  size: number,
  mix: Mix,
  cold: boolean,
): { placed: ExploreScored[]; rest: ExploreScored[] } {
  if (cold || ranked.length <= 1) return { placed: ranked.slice(0, size), rest: ranked.slice(size) };

  const targets = bandTargets(size, mix);
  const picks: Record<DistanceBand, ExploreScored[]> = { near: [], adjacent: [], far: [] };
  const used = new Set<string>();

  for (const band of ["near", "adjacent", "far"] as DistanceBand[]) {
    for (const s of ranked) {
      if (picks[band].length >= targets[band]) break;
      if (s.band !== band || used.has(s.candidate.key)) continue;
      if (band === "far" && !passesExplorationGate(s)) continue;
      picks[band].push(s);
      used.add(s.candidate.key);
    }
  }
  for (const s of picks.far) s.exploration = true;

  /* Shortfall in any band is filled from the rest in score order, far items
     only when they pass the gate. */
  const main = [...picks.near, ...picks.adjacent];
  for (const s of ranked) {
    if (main.length + picks.far.length >= size) break;
    if (used.has(s.candidate.key)) continue;
    if (s.band === "far" && !passesExplorationGate(s)) continue;
    main.push(s);
    used.add(s.candidate.key);
  }
  /* Back into the order the caller ranked them in (which may already hold some
     items back, like For you's per type cap), not raw score order. */
  const at = new Map(ranked.map((s, i) => [s.candidate.key, i]));
  main.sort((a, b) => (at.get(a.candidate.key) ?? 0) - (at.get(b.candidate.key) ?? 0));

  const placed = [...main];
  const n = picks.far.length;
  picks.far.forEach((s, i) => {
    const at = Math.min(placed.length, Math.round(((i + 1) * (placed.length + n)) / (n + 1)) - 1);
    placed.splice(Math.max(0, at), 0, s);
  });

  const rest = ranked.filter((s) => !used.has(s.candidate.key));
  return { placed: placed.slice(0, size), rest: [...placed.slice(size), ...rest] };
}
