import { clamp01, unitHash } from "../../community/intelligence/math";
import { EXPLORE_V1, MIXED_SECTIONS, SECTION_SIZE, SECTION_TYPES } from "./config";
import type { Seeds } from "./continue";
import { continueSeeds } from "./continue";
import { dedupe } from "./dedupe";
import { capPerType, diversify } from "./diversity";
import { eligibilityOf, type ExploreEligibility } from "./eligibility";
import { placeByBands, type Mix } from "./exploration";
import { extractExploreFeatures, keyAdjacency, ownedKeyWeights, weightOf, type FeatureContext, type FeatureReading } from "./features";
import { momentumIndex, NO_MOMENTUM, type Momentum } from "./momentum";
import { applyGates, objectiveFor, objectiveValue } from "./objectives";
import type { ExploreProfile } from "./profile";
import { reasonFor } from "./reasons";
import { scorerFor } from "./scorers";
import type {
  DropReason,
  ExploreCandidate,
  ExploreDebugEntry,
  ExploreDrop,
  ExploreEntityType,
  ExploreScored,
  ExploreSectionId,
  ExploreSource,
  SectionRanking,
} from "./types";
import { EXPLORE_CONTROL, type ExploreAssignment } from "./versions";

/*
  explore_v1, composed. Pure: plain data in, plain data out.

    prepareExplore  once per request: momentum, adjacency, features and
                    eligibility for every candidate in the pool
    rankSection     per shelf: section filter, entity scorer, section objective,
                    gates, duplicates, source quotas, bands, diversity, reasons
    rankExplore     every shelf, with Rising excluding what is already Trending

  The pool is loaded once and every section ranks from it, which is what keeps
  a page of eleven shelves from being eleven times the queries.
*/

export type PipelineInput = {
  pool: ExploreCandidate[];
  profile: ExploreProfile;
  now: number;
  /* Deterministic tie breaks: the viewer (or session) and the day. */
  salt: string;
  /* Community Intelligence's topic adjacency over post text, topic id keyed. */
  topicAdjacency?: Map<string, Map<string, number>>;
  assignment?: ExploreAssignment;
};

export type Prepared = {
  input: PipelineInput;
  byKey: Map<string, ExploreCandidate>;
  readings: Map<string, FeatureReading>;
  momentum: Map<string, Momentum>;
  eligibility: Map<string, ExploreEligibility>;
  labels: Map<string, string>;
  keysOf: (key: string) => string[] | undefined;
  mix: Mix;
  seeds: Seeds;
};

const DAY = 86_400_000;
const TAXONOMY = ["topic:", "category:", "tag:", "provider:", "modality:"];

export function isNewCandidate(c: ExploreCandidate, now: number): boolean {
  const days = EXPLORE_V1.NEW_WINDOW_DAYS[c.entityType];
  return days > 0 && c.createdAt > 0 && now - c.createdAt <= days * DAY;
}

function buildLabels(pool: ExploreCandidate[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const c of pool) {
    labels.set(c.key, c.title);
    if (c.entityType === "topic") labels.set(`topic:${c.refId}`, c.title);
    if (c.entityType === "category") for (const k of c.featureKeys) if (k.startsWith("category:")) labels.set(k, c.title);
  }
  return labels;
}

function labelOf(labels: Map<string, string>, key: string): string | null {
  const known = labels.get(key);
  if (known) return known;
  for (const p of ["tag:", "provider:", "modality:", "category:"]) {
    if (key.startsWith(p)) return key.slice(p.length);
  }
  return null;
}

export function prepareExplore(input: PipelineInput): Prepared {
  const { pool, profile, now } = input;
  const byKey = new Map(pool.map((c) => [c.key, c]));
  const keysOf = (key: string) => byKey.get(key)?.featureKeys;
  const momentum = momentumIndex(pool);
  const ctx: FeatureContext = {
    profile,
    adjacency: keyAdjacency(pool, input.topicAdjacency),
    momentum,
    ownedKeys: ownedKeyWeights(profile, keysOf),
    now,
  };
  const readings = new Map<string, FeatureReading>();
  const eligibility = new Map<string, ExploreEligibility>();
  for (const c of pool) {
    readings.set(c.key, extractExploreFeatures(c, ctx));
    eligibility.set(c.key, eligibilityOf(c, profile, now));
  }
  const assignment = input.assignment ?? EXPLORE_CONTROL;
  return {
    input,
    byKey,
    readings,
    momentum,
    eligibility,
    labels: buildLabels(pool),
    keysOf,
    mix: assignment.override?.mix ?? EXPLORE_V1.MIX,
    seeds: continueSeeds(profile, keysOf, now),
  };
}

/* Sources: what retrieval labelled, plus what the features justify. */
export function sourcesOf(c: ExploreCandidate, r: FeatureReading, m: Momentum, now: number, cold: boolean): ExploreSource[] {
  const out = new Set<ExploreSource>(c.sources);
  const f = r.features;
  if (f.sessionRelevance >= 0.3) out.add("session");
  if (f.personalRelevance >= 0.25) out.add("personalized");
  if (f.similarity >= 0.3) out.add("similar");
  if (f.networkProof > 0) out.add("network");
  if (m.trending) out.add("trending");
  if (m.rising) out.add("rising");
  if (isNewCandidate(c, now)) out.add("new");
  if (f.popularity >= 0.4) out.add("popular");
  if (!cold && r.band === "far") out.add("exploration");
  return [...out];
}

const PRIMARY_ORDER: ExploreSource[] = ["session", "personalized", "similar", "network", "trending", "rising", "new", "exploration", "popular"];

function primarySource(sources: ExploreSource[]): ExploreSource | null {
  for (const s of PRIMARY_ORDER) if (sources.includes(s)) return s;
  return null;
}

/* Which candidates a section considers at all. */
function inSection(
  section: ExploreSectionId,
  c: ExploreCandidate,
  m: Momentum,
  r: FeatureReading,
  p: Prepared,
): DropReason | null {
  const now = p.input.now;
  switch (section) {
    case "trending":
      return m.trending ? null : "not_in_section";
    case "rising":
      return m.rising ? null : "not_in_section";
    case "new-and-recent":
      if (!isNewCandidate(c, now)) return "not_in_section";
      return r.features.quality >= EXPLORE_V1.QUALITY_FLOOR ? null : "below_quality_floor";
    case "discussions":
      return (c.facts.commentCount ?? 0) > 0 || (c.facts.conversation ?? 0) > 0.05 ? null : "not_in_section";
    case "continue-exploring": {
      if (p.seeds.keys.length === 0) return "not_in_section";
      if (p.seeds.keys.includes(c.key) || p.input.profile.owned.has(c.key)) return "not_in_section";
      return null;
    }
    default:
      return null;
  }
}

function seedSimilarity(c: ExploreCandidate, seeds: Seeds): number {
  if (seeds.weights.size === 0) return 0;
  let best = 0;
  let terms = 0;
  for (const k of c.featureKeys) {
    const w = seeds.weights.get(k) ?? 0;
    if (k.startsWith("term:")) terms = Math.max(terms, w);
    else best = Math.max(best, w);
  }
  return clamp01(1 - (1 - best) * (1 - 0.5 * terms));
}

export type RankOptions = {
  /* A tab narrows every shelf to these types (the Topics tab is topics and
     categories). Null is the All tab. */
  onlyTypes?: ExploreEntityType[] | null;
  exclude?: Set<string>;
  size?: number;
};

export function rankSection(p: Prepared, section: ExploreSectionId, opts: RankOptions = {}): SectionRanking {
  const { profile, now, salt } = p.input;
  const size = opts.size ?? SECTION_SIZE[section];
  const objective = objectiveFor(section, p.input.assignment?.override ?? null);
  const types = SECTION_TYPES[section].filter((t) => !opts.onlyTypes || opts.onlyTypes.includes(t));
  const dropped: ExploreDrop[] = [];
  const scored: ExploreScored[] = [];
  let typed = 0;

  for (const c of p.input.pool) {
    if (!types.includes(c.entityType)) {
      dropped.push({ key: c.key, reason: "wrong_type", detail: null });
      continue;
    }
    typed++;
    const elig = p.eligibility.get(c.key);
    if (elig && !elig.eligible) {
      dropped.push({ key: c.key, reason: elig.reason === "dismissed" ? "dismissed" : "ineligible", detail: elig.reason });
      continue;
    }
    if (opts.exclude?.has(c.key)) {
      dropped.push({ key: c.key, reason: "already_trending", detail: null });
      continue;
    }
    const r = p.readings.get(c.key)!;
    const m = p.momentum.get(c.key) ?? NO_MOMENTUM;
    const miss = inSection(section, c, m, r, p);
    if (miss) {
      dropped.push({ key: c.key, reason: miss, detail: null });
      continue;
    }
    const parts = scorerFor(c.entityType).parts(c, r, m);
    if (section === "continue-exploring") parts.similarity = seedSimilarity(c, p.seeds);
    const value = objectiveValue(parts, objective);
    const final = applyGates(section, value, r.features, profile.cold) + unitHash(`${salt}:${section}:${c.key}`) * 1e-6;
    const sources = sourcesOf(c, r, m, now, profile.cold);
    scored.push({
      candidate: { ...c, sources },
      features: r.features,
      band: r.band,
      parts,
      value,
      final,
      primarySource: primarySource(sources),
      reason: null,
      exploration: false,
      duplicateOf: null,
    });
  }

  /* Continue exploring needs a real relation to a seed, not just any item. */
  let ranked = scored.sort((a, b) => b.final - a.final);
  if (section === "continue-exploring") {
    ranked = ranked.filter((s) => {
      if ((s.parts.similarity ?? 0) >= 0.2) return true;
      dropped.push({ key: s.candidate.key, reason: "below_relevance_floor", detail: "seed similarity" });
      return false;
    });
  }

  /* Discussions: people the viewer follows are the feed's job, unless that
     would leave the shelf empty (the rule loadDiscussions already had). */
  if (section === "discussions" && profile.followedAuthors.size > 0) {
    const fresh = ranked.filter((s) => !profile.followedAuthors.has(s.candidate.ownerId ?? ""));
    if (fresh.length > 0) {
      for (const s of ranked) if (!fresh.includes(s)) dropped.push({ key: s.candidate.key, reason: "not_in_section", detail: "followed author" });
      ranked = fresh;
    }
  }

  const { kept: unique, duplicates } = dedupe(ranked);
  for (const d of duplicates) dropped.push({ key: d.item.candidate.key, reason: "duplicate", detail: d.of });

  let list = unique;
  const heldByQuota = new Set<string>();
  if (MIXED_SECTIONS.has(section)) {
    const used = new Map<ExploreSource, number>();
    const within: ExploreScored[] = [];
    const held: ExploreScored[] = [];
    for (const s of list) {
      const src = s.primarySource;
      const cap = src ? Math.max(1, Math.ceil(size * EXPLORE_V1.SOURCE_QUOTA[src])) : Infinity;
      const n = src ? used.get(src) ?? 0 : 0;
      if (src && n >= cap) {
        held.push(s);
        heldByQuota.add(s.candidate.key);
        continue;
      }
      if (src) used.set(src, n + 1);
      within.push(s);
    }
    list = [...within, ...held];
  }

  if (section === "new-and-recent") {
    const { kept, cut } = capPerType(list, EXPLORE_V1.NEW_PER_TYPE);
    for (const s of cut) dropped.push({ key: s.candidate.key, reason: "diversity", detail: "per type cap" });
    list = kept;
  }

  if (section === "for-you") {
    /* Held back, not cut: over the cap only fills a shelf that would be short. */
    if (!opts.onlyTypes) {
      const { kept, cut } = capPerType(list, EXPLORE_V1.FOR_YOU_PER_TYPE);
      list = [...kept, ...cut];
    }
    const { placed, rest } = placeByBands(list, size, p.mix, profile.cold);
    list = [...placed, ...rest];
  }

  /* One per category (or provider) first, but only at cold start: with a
     profile, relevance leads and the per shelf cap of three keeps the variety.
     Spreading first would put an unrelated category above a relevant tool,
     which D128 rules out (found in the 4BI persona run). */
  const firstPassKey =
    profile.cold && (section === "recommended-tools" || section === "recommended-models")
      ? (s: ExploreScored) => s.candidate.groupKey
      : undefined;
  const { kept, cut, capped } = diversify(list, { size, mixed: MIXED_SECTIONS.has(section), firstPassKey });
  for (const s of cut) {
    const reason: DropReason = heldByQuota.has(s.candidate.key)
      ? "source_quota"
      : capped.has(s.candidate.key)
        ? "diversity"
        : "section_full";
    dropped.push({ key: s.candidate.key, reason, detail: null });
  }

  const debug: ExploreDebugEntry[] = [];
  kept.forEach((s, position) => {
    const c = s.candidate;
    const m = p.momentum.get(c.key) ?? NO_MOMENTUM;
    const r = p.readings.get(c.key)!;
    s.reason = reasonFor(s, {
      section,
      reading: r,
      momentum: m,
      isNew: isNewCandidate(c, now),
      interestLabel: interestLabel(c, p),
      sessionLabel: sessionLabel(c, p),
    });
    debug.push({
      key: c.key,
      entityType: c.entityType,
      sources: c.sources,
      primarySource: s.primarySource,
      band: s.band,
      features: s.features,
      parts: s.parts,
      value: s.value,
      final: s.final,
      position,
      exploration: s.exploration,
      reason: s.reason?.code ?? null,
    });
  });

  let note: string | null = null;
  if (kept.length === 0 && typed > 0) {
    if (section === "trending") note = "Not enough activity yet to call anything trending.";
    else if (section === "rising") note = "Nothing is picking up speed right now.";
    else if (section === "continue-exploring") note = null;
  }

  return { section, items: kept, debug, dropped, note };
}

function interestLabel(c: ExploreCandidate, p: Prepared): string | null {
  let best: string | null = null;
  let bestW = 0.2;
  for (const k of c.featureKeys) {
    if (!TAXONOMY.some((t) => k.startsWith(t))) continue;
    const w = weightOf(p.input.profile, k);
    if (w > bestW) {
      bestW = w;
      best = k;
    }
  }
  return best ? labelOf(p.labels, best) : null;
}

function sessionLabel(c: ExploreCandidate, p: Prepared): string | null {
  const own = new Set(c.featureKeys);
  let best: string | null = null;
  let bestOverlap = 0;
  for (const seed of p.input.profile.sessionSeeds) {
    if (seed.key === c.key) continue;
    const keys = p.keysOf(seed.key) ?? [];
    const overlap = keys.filter((k) => !k.startsWith("term:") && own.has(k)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = seed.key;
    }
  }
  return best ? p.labels.get(best) ?? null : null;
}

export const RANKED_SECTIONS: ExploreSectionId[] = [
  "for-you",
  "trending",
  "rising",
  "new-and-recent",
  "recommended-tools",
  "recommended-models",
  "people",
  "topics",
  "discussions",
  "videos",
  "continue-exploring",
];

/* Every shelf. Rising leaves out what Trending already shows. */
export function rankExplore(
  p: Prepared,
  opts: { onlyTypes?: ExploreEntityType[] | null; sections?: ExploreSectionId[] } = {},
): Map<ExploreSectionId, SectionRanking> {
  const out = new Map<ExploreSectionId, SectionRanking>();
  const wanted = opts.sections ?? RANKED_SECTIONS;
  const trending = rankSection(p, "trending", { onlyTypes: opts.onlyTypes });
  if (wanted.includes("trending")) out.set("trending", trending);
  const trendingKeys = new Set(trending.items.map((s) => s.candidate.key));
  for (const id of wanted) {
    if (id === "trending") continue;
    out.set(id, rankSection(p, id, { onlyTypes: opts.onlyTypes, exclude: id === "rising" ? trendingKeys : undefined }));
  }
  return out;
}

/* The admin "why not": the first recorded drop for a key in a section. */
export function whyNot(ranking: SectionRanking, key: string): ExploreDrop | null {
  if (ranking.items.some((s) => s.candidate.key === key)) return null;
  return ranking.dropped.find((d) => d.key === key) ?? null;
}
