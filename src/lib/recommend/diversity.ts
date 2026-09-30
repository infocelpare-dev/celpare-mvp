import { isDuplicate, type CatalogueIndex } from "./catalogue";
import { keysOf } from "./entity";
import type { ToolModelEntity } from "./types";

/*
  Diversity (guide 17 section 11, D183).

  MMR: pick greedily by  lambda * value - (1 - lambda) * max similarity to what is
  already picked. Two near identical code editors do not both take the top slots
  just because both scored well; the second has to be worth it on its own. The
  similarity is the catalogue's own hybrid matrix, so "near identical" means what
  the entries are, not what they are labelled.

  Candidates reaching this stage have already passed the relevance floor, so
  diversity reorders relevant things and never promotes an irrelevant one. Hard
  caps (per category, provider, developer)
  follow as limits, and a listing that is the same product as one above is dropped.
*/

export type MmrItem = { entity: ToolModelEntity; value: number };

export type MmrDrop = { key: string; reason: "duplicate" | "diversity_limit"; detail: string };

export type Caps = { perCategory: number; perProvider: number; perDeveloper: number };

export function mmr(
  items: MmrItem[],
  index: CatalogueIndex,
  lambda: number,
  limit: number,
  caps: Caps,
): { picked: MmrItem[]; dropped: MmrDrop[] } {
  const remaining = [...items].sort((a, b) => b.value - a.value);
  const picked: MmrItem[] = [];
  const dropped: MmrDrop[] = [];
  const perCategory = new Map<string, number>();
  const perProvider = new Map<string, number>();
  const perDeveloper = new Map<string, number>();

  while (remaining.length > 0 && picked.length < limit) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      let maxSim = 0;
      for (const p of picked) maxSim = Math.max(maxSim, index.sim(p.entity.key, c.entity.key).value);
      const score = lambda * c.value - (1 - lambda) * maxSim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const [c] = remaining.splice(bestIdx, 1);
    const e = c.entity;

    /* A duplicate is the same product listed twice: the same maker AND the same
       name line. One company with several products is not a duplicate. */
    const dup = picked.find((p) => isDuplicate(p.entity, e));
    if (dup) {
      dropped.push({ key: e.key, reason: "duplicate", detail: `same product line as ${dup.entity.name}` });
      continue;
    }
    const category = (keysOf(e, "category") ?? [])[0] ?? null;
    if (category && (perCategory.get(category) ?? 0) >= caps.perCategory) {
      dropped.push({ key: e.key, reason: "diversity_limit", detail: `category ${category} full` });
      continue;
    }
    if (e.ref.type === "model" && e.provider && (perProvider.get(e.provider) ?? 0) >= caps.perProvider) {
      dropped.push({ key: e.key, reason: "diversity_limit", detail: `provider ${e.provider} full` });
      continue;
    }
    if (e.developerId && (perDeveloper.get(e.developerId) ?? 0) >= caps.perDeveloper) {
      dropped.push({ key: e.key, reason: "diversity_limit", detail: "developer full" });
      continue;
    }

    picked.push(c);
    if (category) perCategory.set(category, (perCategory.get(category) ?? 0) + 1);
    if (e.ref.type === "model" && e.provider) perProvider.set(e.provider, (perProvider.get(e.provider) ?? 0) + 1);
    if (e.developerId) perDeveloper.set(e.developerId, (perDeveloper.get(e.developerId) ?? 0) + 1);
  }
  return { picked, dropped };
}

/* Intra list diversity: 1 minus the mean pairwise similarity. For evaluation. */
export function intraListDiversity(entities: ToolModelEntity[], index: CatalogueIndex): number {
  if (entities.length < 2) return 1;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      sum += index.sim(entities[i].key, entities[j].key).value;
      n++;
    }
  }
  return 1 - sum / n;
}
