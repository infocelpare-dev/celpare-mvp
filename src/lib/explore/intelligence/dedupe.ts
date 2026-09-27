import { sameStory } from "../../community/intelligence/text";
import { EXPLORE_V1 } from "./config";
import type { ExploreScored } from "./types";

/*
  Duplicates and the same story (brief section 24).

  Reuses what exists: upload processing already marks exact and near duplicate
  posts (post_features.duplicate_of, near_duplicate_of, simhash, D145), and
  Community Intelligence's sameStory clusters "Claude released a feature",
  "Claude feature announcement" and "New Claude feature" together. Tools that
  are the same product under two listings share a canonical domain; a model
  family keeps its newest version as the representative.

  PRESENTATION ONLY. The input array and every underlying record are untouched.
  The strongest item of a cluster stays; the rest are reported as duplicates.
*/

export type DedupeResult = { kept: ExploreScored[]; duplicates: { item: ExploreScored; of: string }[] };

export function dedupe(ranked: ExploreScored[]): DedupeResult {
  const kept: ExploreScored[] = [];
  const duplicates: { item: ExploreScored; of: string }[] = [];
  const clusterOwner = new Map<string, string>();

  /* The newest version of each model family represents it. */
  const newestInFamily = new Map<string, ExploreScored>();
  for (const s of ranked) {
    const fam = s.candidate.entityType === "model" ? s.candidate.facts.family : null;
    if (!fam) continue;
    const cur = newestInFamily.get(fam.toLowerCase());
    if (!cur || s.candidate.createdAt > cur.candidate.createdAt) newestInFamily.set(fam.toLowerCase(), s);
  }

  const posts: ExploreScored[] = [];

  for (const s of ranked) {
    const c = s.candidate;
    const f = c.facts;
    let cluster: string | null = null;

    if (c.entityType === "post" || c.entityType === "video") {
      const target = f.duplicateOf ?? f.nearDuplicateOf;
      cluster = `story:${target ?? c.refId}`;
    } else if (c.entityType === "tool" && f.canonicalDomain) {
      cluster = `domain:${f.canonicalDomain.toLowerCase()}`;
    } else if (c.entityType === "model" && f.family) {
      const rep = newestInFamily.get(f.family.toLowerCase());
      if (rep && rep.candidate.key !== c.key) {
        duplicates.push({ item: { ...s, duplicateOf: rep.candidate.key }, of: rep.candidate.key });
        continue;
      }
    }

    if (cluster) {
      const owner = clusterOwner.get(cluster);
      if (owner && owner !== c.key) {
        duplicates.push({ item: { ...s, duplicateOf: owner }, of: owner });
        continue;
      }
      clusterOwner.set(cluster, c.key);
    }

    /* Pairwise, so bounded: only the leading posts, which is all a shelf shows. */
    if ((c.entityType === "post" || c.entityType === "video") && f.body && posts.length < 40) {
      const story = { body: f.body, createdAt: c.createdAt, toolId: f.toolId ?? null, modelId: f.modelId ?? null };
      const match = posts.find((p) =>
        sameStory(
          { body: p.candidate.facts.body ?? "", createdAt: p.candidate.createdAt, toolId: p.candidate.facts.toolId ?? null, modelId: p.candidate.facts.modelId ?? null },
          story,
          EXPLORE_V1.SAME_STORY,
        ),
      );
      if (match) {
        duplicates.push({ item: { ...s, duplicateOf: match.candidate.key }, of: match.candidate.key });
        continue;
      }
      posts.push(s);
    }

    kept.push(s);
  }

  return { kept, duplicates };
}
