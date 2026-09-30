import { tokenize } from "../community/intelligence/text";
import { TMR_V1 } from "./config";
import { buildEntity, keysOf, type EntityInput } from "./entity";
import { hybridSimilarity } from "./similarity/hybrid";
import { buildLexical, type LexicalModel } from "./similarity/lexical";
import { jaccard } from "./similarity/structured";
import type { SimilarityProvider, SimilarityReading } from "./similarity/types";
import type { EntityType, ToolModelEntity } from "./types";

/*
  The catalogue index (guide 17 sections 3 to 6).

  Built once per catalogue generation and cached (server/cache.ts). It holds the
  canonical entities, the lexical model, and the precomputed same type similarity
  matrix: about 3,000 pairs for today's 77 entries, milliseconds to build. It also
  types the relationship between two entries: a substitute (another product for
  the same job), a version (the same line), or a related cross-type link that the
  catalogue itself states (D176).
*/

export type CoOccurrence = { people: number; source: "co_compared" | "co_viewed" };

export type Relation =
  | { kind: "substitute" }
  | { kind: "version"; why: string }
  | { kind: "related"; why: string; evidence: "name" | "tag" | "text" | "co_compared" }
  | { kind: "none" };

export type CatalogueIndex = {
  generation: string;
  builtAt: number;
  entities: Map<string, ToolModelEntity>;
  list: ToolModelEntity[];
  bySlug: Map<string, ToolModelEntity>;
  lexical: LexicalModel;
  hybrid: SimilarityProvider;
  sim(aKey: string, bKey: string): SimilarityReading;
  relation(a: ToolModelEntity, b: ToolModelEntity): Relation;
  cooccurrence(aKey: string, bKey: string): CoOccurrence | null;
  cooccurrenceOf(aKey: string): Map<string, CoOccurrence>;
};

export type IndexInput = {
  entities: EntityInput[];
  /* Pairs from rec_item_cooccurrence, both directions present. */
  cooccurrence?: { a: string; b: string; people: number; source: "co_compared" | "co_viewed" }[];
  generation: string;
  now: number;
};

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function nameTokens(e: ToolModelEntity): string[] {
  return tokenize(e.name.replace(/[-.]/g, " "), 8);
}

/* The words that name a model's maker or line, for cross-type evidence. */
function modelMarks(m: ToolModelEntity): string[] {
  const marks = new Set<string>();
  if (m.provider) {
    const first = m.provider.split(/\s+/)[0];
    if (first && first.length >= 3) marks.add(first);
  }
  if (m.family) {
    const first = m.family.split(/[\s-]+/)[0];
    if (first && first.length >= 3) marks.add(first);
  }
  return [...marks];
}

export function buildIndex(input: IndexInput): CatalogueIndex {
  const list = input.entities.map(buildEntity);
  const entities = new Map(list.map((e) => [e.key, e]));
  const bySlug = new Map(list.map((e) => [`${e.ref.type}:${e.slug}`, e]));
  const lexical = buildLexical(list);
  const hybrid = hybridSimilarity(lexical);

  /* The same type matrix, computed once. */
  const matrix = new Map<string, SimilarityReading>();
  const byType: Record<EntityType, ToolModelEntity[]> = { tool: [], model: [] };
  for (const e of list) byType[e.ref.type].push(e);
  for (const group of Object.values(byType)) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        matrix.set(pairKey(group[i].key, group[j].key), hybrid.similarity(group[i], group[j]));
      }
    }
  }

  const co = new Map<string, Map<string, CoOccurrence>>();
  for (const p of input.cooccurrence ?? []) {
    if (p.people < TMR_V1.COOCCUR_MIN_PEOPLE) continue;
    const row = co.get(p.a) ?? new Map<string, CoOccurrence>();
    const prev = row.get(p.b);
    /* A compared pair is stronger evidence than a viewed one; keep the stronger. */
    if (!prev || (p.source === "co_compared" && prev.source !== "co_compared") || p.people > prev.people) {
      row.set(p.b, { people: p.people, source: p.source });
    }
    co.set(p.a, row);
  }

  const index: CatalogueIndex = {
    generation: input.generation,
    builtAt: input.now,
    entities,
    list,
    bySlug,
    lexical,
    hybrid,
    sim(aKey, bKey) {
      if (aKey === bKey) return { value: 1, parts: {}, coverage: 1 };
      return matrix.get(pairKey(aKey, bKey)) ?? { value: 0, parts: {}, coverage: 0 };
    },
    cooccurrence(aKey, bKey) {
      return co.get(aKey)?.get(bKey) ?? null;
    },
    cooccurrenceOf(aKey) {
      return co.get(aKey) ?? new Map();
    },
    relation(a, b) {
      return relationOf(index, a, b);
    },
  };
  return index;
}

/* The same line: a model family, or one maker with near identical names. */
export function isVersion(a: ToolModelEntity, b: ToolModelEntity): string | null {
  if (a.ref.type !== b.ref.type || a.key === b.key) return null;
  if (a.ref.type === "model") {
    if (a.family && b.family && a.family === b.family) return `both ${a.family}`;
    if (a.provider && a.provider === b.provider && jaccard(nameTokens(a), nameTokens(b)) >= TMR_V1.VERSION_NAME_JACCARD) {
      return `same maker, same name line`;
    }
    return null;
  }
  /* One company, one domain, several products (langchain.com is LangChain and
     LangSmith): a shared domain alone is NOT a version. The name must match too. */
  const sameMaker = (a.canonicalDomain && a.canonicalDomain === b.canonicalDomain) || (a.developerId && a.developerId === b.developerId);
  if (sameMaker && jaccard(nameTokens(a), nameTokens(b)) >= TMR_V1.VERSION_NAME_JACCARD) return `same maker, same name line`;
  return null;
}

/* The same product listed twice: one maker and a near identical name. Stricter
   than a version: Claude Opus 5 and Claude Sonnet 5 are one line (a version) but
   two products (not duplicates). */
export function isDuplicate(a: ToolModelEntity, b: ToolModelEntity): boolean {
  if (a.ref.type !== b.ref.type || a.key === b.key) return false;
  const sameMaker =
    a.ref.type === "model"
      ? Boolean(a.provider && a.provider === b.provider)
      : Boolean((a.canonicalDomain && a.canonicalDomain === b.canonicalDomain) || (a.developerId && a.developerId === b.developerId));
  return sameMaker && jaccard(nameTokens(a), nameTokens(b)) >= 0.8;
}

function sharesJob(a: ToolModelEntity, b: ToolModelEntity): boolean {
  for (const set of ["usecase", "category"] as const) {
    const ka = keysOf(a, set) ?? [];
    const kb = new Set(keysOf(b, set) ?? []);
    if (ka.some((k) => kb.has(k))) return true;
  }
  if (a.ref.type === "model") {
    const ka = keysOf(a, "capability") ?? [];
    const kb = new Set(keysOf(b, "capability") ?? []);
    if (ka.some((k) => kb.has(k))) return true;
  }
  return false;
}

/*
  Cross-type evidence (D176). A tool is related to a model only when the tool's
  own listing names the model's maker or line: in its name, in its tags, or in
  its own words. Or when two or more people compared them side by side. Nothing
  is inferred from popularity, and nothing from one person.
*/
function crossTypeEvidence(index: CatalogueIndex, tool: ToolModelEntity, model: ToolModelEntity): Relation {
  const marks = modelMarks(model);
  if (marks.length > 0) {
    const nameWords = new Set(nameTokens(tool));
    const hit = marks.find((m) => nameWords.has(m));
    if (hit) return { kind: "related", why: `the name ${tool.name} carries ${hit}`, evidence: "name" };
    const tags = new Set(tool.tags);
    const tagHit = marks.find((m) => tags.has(m));
    if (tagHit) return { kind: "related", why: `listed with the tag ${tagHit}`, evidence: "tag" };
    const words = new Set(tokenize(`${tool.tagline ?? ""} ${tool.description ?? ""} ${tool.features.join(" ")}`, 200));
    const textHit = marks.find((m) => words.has(m));
    if (textHit) return { kind: "related", why: `its listing mentions ${textHit}`, evidence: "text" };
  }
  const co = index.cooccurrence(tool.key, model.key);
  if (co && co.source === "co_compared") return { kind: "related", why: `compared together by ${co.people} people`, evidence: "co_compared" };
  return { kind: "none" };
}

export function relationOf(index: CatalogueIndex, a: ToolModelEntity, b: ToolModelEntity): Relation {
  if (a.key === b.key) return { kind: "none" };
  if (a.ref.type !== b.ref.type) {
    const [tool, model] = a.ref.type === "tool" ? [a, b] : [b, a];
    return crossTypeEvidence(index, tool, model);
  }
  const version = isVersion(a, b);
  if (version) return { kind: "version", why: version };
  if (index.sim(a.key, b.key).value >= TMR_V1.SUBSTITUTE_MIN && sharesJob(a, b)) return { kind: "substitute" };
  return { kind: "none" };
}
