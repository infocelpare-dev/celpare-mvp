import "server-only";
import { cache } from "react";
import { buildExploreProfile, emptyExploreProfile, type ExploreProfile } from "../profile";
import { prepareExplore, rankExplore, type Prepared } from "../pipeline";
import { orderSections, DEFAULT_ORDER } from "../sections";
import type { ExploreEntityType, ExploreSectionId, SectionRanking } from "../types";
import { EXPLORE_ALGORITHM, assignExploreVariant, type ExploreAssignment } from "../versions";
import { loadExplorePool, type ExplorePool } from "./pool";

/*
  explore_v1 for one request.

  React cache() makes this ONE call per request however many sections ask for
  it: every shelf ranks from the same pool, loaded once. The signed out result
  is the same for everybody, so it is also kept for 60 seconds per tab, the
  same trade getTrending makes.

  Returns null when the pool could not be built at all; each section then
  reports a failure rather than an empty platform (D109).
*/

export type ExploreResult = {
  algorithm: typeof EXPLORE_ALGORITHM;
  assignment: ExploreAssignment;
  rankings: Map<ExploreSectionId, SectionRanking>;
  order: ExploreSectionId[];
  pool: ExplorePool;
  profile: ExploreProfile;
  prepared: Prepared;
  timings: Record<string, number>;
};

const ANON_TTL_MS = 60_000;
const anonCache = new Map<string, { at: number; value: ExploreResult }>();

async function compute(signedIn: boolean, viewerId: string | null, tabTypes: string | null): Promise<ExploreResult> {
  const onlyTypes = tabTypes ? (tabTypes.split(",") as ExploreEntityType[]) : null;
  const now = Date.now();
  const pool = await loadExplorePool({ signedIn, viewerId, now });
  const t = Date.now();
  const byKey = new Map(pool.candidates.map((c) => [c.key, c.featureKeys]));
  const profile = viewerId
    ? buildExploreProfile({
        userId: viewerId,
        community: pool.community,
        affinity: pool.affinity,
        history: pool.history,
        owned: pool.owned,
        keysOf: (k) => byKey.get(k),
        now,
      })
    : emptyExploreProfile(null);
  const assignment = assignExploreVariant(viewerId);
  const day = new Date(now).toISOString().slice(0, 10);
  const prepared = prepareExplore({
    pool: pool.candidates,
    profile,
    now,
    salt: `${viewerId ?? "anon"}:${day}`,
    topicAdjacency: pool.topicAdjacency,
    assignment,
  });
  const rankings = rankExplore(prepared, { onlyTypes });
  const order = onlyTypes ? DEFAULT_ORDER : orderSections(rankings, profile);
  const timings = { ...pool.timings, rank: Date.now() - t };
  return { algorithm: EXPLORE_ALGORITHM, assignment, rankings, order, pool, profile, prepared, timings };
}

export const getExplore = cache(
  /* tabTypes is a comma list ("topic,category"), a primitive so cache() keys on it. */
  async (signedIn: boolean, viewerId: string | null, tabTypes: string | null): Promise<ExploreResult | null> => {
    try {
      if (!viewerId) {
        const key = tabTypes ?? "all";
        const hit = anonCache.get(key);
        if (hit && Date.now() - hit.at < ANON_TTL_MS) return hit.value;
        const value = await compute(signedIn, null, tabTypes);
        anonCache.set(key, { at: Date.now(), value });
        return value;
      }
      return await compute(signedIn, viewerId, tabTypes);
    } catch (err) {
      console.error("[explore] explore_v1 failed", err);
      return null;
    }
  },
);
