/*
  Sponsored Tools Ranking v1, the pure half (D204, D205). No database, no
  clock of its own: everything comes in as arguments, so every rule here has
  a test.

  THE PIPELINE, for one Search query or one Ask answer:

    sponsored campaigns -> candidates the organic retrieval already found
      -> eligibility (run active, tool live, placement not suspended, viewer
         caps, dismissals) -> relevance gate -> quality gate -> score
      -> diversity -> at most MAX_SPONSORED_TOOLS

  THREE RULES MAKE IT HONEST:

    1. PAYING BUYS ELIGIBILITY, NOT A POSITION. There is no bid. Every active
       sponsorship is the same $149.99, and order among them comes from the
       weighted components below.
    2. ONLY WHEN IT MATCHES. A sponsored tool is a candidate only when the
       organic retrieval found it for this query, and it must clear the
       relevance gate. Irrelevant queries cannot be bought.
    3. THE ORGANIC LIST IS NOT TOUCHED. This reads candidates and returns a
       separate list; nothing here scores, removes or reorders organic results.
*/

import { MAX_SPONSORED_TOOLS, SPONSORED_ACTIVE, type SponsoredConfig } from "./config";

/* One running sponsorship with the tool signals the auction scores. Mirrors
   the sponsored_campaigns() row. */
export type Campaign = {
  sponsorshipId: string;
  toolId: string;
  slug: string;
  /* Run state. sponsored_campaigns() only returns live runs; these are
     checked again here so the rule is in one testable place. */
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  toolStatus: string;
  placementSuspended: boolean;
  ownerActive: boolean;
  frequencyCap: number | null;
  verified: boolean;
  rating: number | null;
  ratingCount: number;
  likeCount: number;
  dislikeCount: number;
  hasLogo: boolean;
  hasTagline: boolean;
  hasDescription: boolean;
  websiteHttps: boolean;
  domainVerified: boolean;
  freshnessAt: string | null;
  categories: string[];
  views30d: number;
  clicks30d: number;
  saves30d: number;
  reporters30d: number;
  openReports: number;
};

/* A tool the organic retrieval found for this query, with how well it
   matched. relevance and fit are 0..1. */
export type SponsoredCandidate = {
  toolId: string;
  /* The organic Search relevance on its 0..1 scale, for the search query or
     the Ask question. */
  relevance: number;
  /* How well it fits what was asked beyond the words: category, tag and
     feature matches, the question's needs, the viewer's interests. */
  fit: number;
};

/* What this viewer has already been served on this surface. */
export type ViewerTool = {
  served24h: number;
  dismissed: boolean;
  inLastServe: boolean;
};

export type ViewerState = {
  tools: Map<string, ViewerTool>;
  lastQueryKey: string | null;
};

export const NO_VIEWER_STATE: ViewerState = { tools: new Map(), lastQueryKey: null };

export type Failure =
  | "not_sponsored"
  | "run_inactive"
  | "run_expired"
  | "tool_not_live"
  | "placement_suspended"
  | "owner_inactive"
  | "below_relevance"
  | "below_share_of_best"
  | "below_quality"
  | "no_website"
  | "reported"
  | "dismissed"
  | "frequency_cap"
  | "consecutive"
  | "over_limit";

export type Components = {
  relevance: number;
  quality: number;
  fit: number;
  performance: number;
  verification: number;
  freshness: number;
};

/* One line of the debug view: everything that was decided about one
   candidate, eligible or not. Never shown to an ordinary user. */
export type Decision = {
  toolId: string;
  slug: string;
  sponsorshipId: string | null;
  eligible: boolean;
  failures: Failure[];
  components: Components | null;
  /* 0..100, after the diversity penalty. */
  score: number | null;
  diversityPenalty: number;
  position: number | null;
};

export type SponsoredPick = {
  toolId: string;
  slug: string;
  sponsorshipId: string;
  position: number;
  score: number;
  components: Components;
};

export type RankInput = {
  surface: "search" | "ask";
  campaigns: Campaign[];
  candidates: SponsoredCandidate[];
  viewer?: ViewerState;
  queryKey?: string | null;
  now?: number;
  config?: SponsoredConfig;
};

export type RankOutput = {
  version: string;
  picks: SponsoredPick[];
  decisions: Decision[];
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

/* -------------------------------------------------------------- eligibility */

/*
  Run and tool state. The database decides this first (sponsored_campaigns()
  returns only live runs); this is the same rule again, so a stale cache or a
  future caller cannot serve an ended run.
*/
export function runFailures(c: Campaign, now: number = Date.now()): Failure[] {
  const out: Failure[] = [];
  if (c.status !== "active") out.push("run_inactive");
  const starts = c.startsAt ? Date.parse(c.startsAt) : NaN;
  const ends = c.endsAt ? Date.parse(c.endsAt) : NaN;
  if (c.status === "active" && (!Number.isFinite(starts) || !Number.isFinite(ends) || starts > now || ends <= now)) {
    out.push("run_expired");
  }
  if (c.toolStatus !== "approved") out.push("tool_not_live");
  if (c.placementSuspended) out.push("placement_suspended");
  if (!c.ownerActive) out.push("owner_inactive");
  return out;
}

export function isSponsoredEligible(c: Campaign, now: number = Date.now()): boolean {
  return runFailures(c, now).length === 0;
}

/* ----------------------------------------------------------------- signals */

/*
  Tool quality, 0..1. Profile completeness, a working https website, verified
  domain ownership, rating and likes, minus report penalties. Verification of
  the TOOL is its own small component and is not counted here as well.
*/
export function qualityScore(c: Campaign): number {
  const completeness = ((c.hasLogo ? 1 : 0) + (c.hasTagline ? 1 : 0) + (c.hasDescription ? 1 : 0)) / 3;
  const website = c.websiteHttps ? 1 : 0;
  const ownership = c.domainVerified ? 1 : 0.5;
  /* Five ghost ratings of 3.5 keep one 5 star review from meaning much. */
  const rating =
    c.ratingCount > 0 && c.rating !== null
      ? (Number(c.rating) * c.ratingCount + 3.5 * 5) / (c.ratingCount + 5) / 5
      : 0.6;
  const likes = (c.likeCount + 2) / (c.likeCount + c.dislikeCount + 4);
  const penalty = Math.min(0.3, c.openReports * 0.1) + Math.min(0.2, c.reporters30d * 0.05);
  return clamp01(0.35 * completeness + 0.2 * website + 0.15 * ownership + 0.15 * rating + 0.15 * likes - penalty);
}

/*
  Sponsored performance, 0..1. Exactly neutral (0.5) until the campaign has
  enough on screen views, then the engaged rate (clicks, saves counted
  double) smoothed toward a typical ad's rate. Twice the typical rate is the
  top of the scale, so raw click rate cannot run away with the ranking.
*/
export function performanceScore(c: Campaign, config: SponsoredConfig = SPONSORED_ACTIVE): number {
  if (c.views30d < config.performanceMinViews) return 0.5;
  const engaged = c.clicks30d + 2 * c.saves30d;
  const rate =
    (engaged + config.performancePriorRate * config.performancePriorViews) /
    (c.views30d + config.performancePriorViews);
  return clamp01((0.5 * rate) / config.performancePriorRate);
}

export function freshnessScore(c: Campaign, now: number, config: SponsoredConfig = SPONSORED_ACTIVE): number {
  const at = c.freshnessAt ? Date.parse(c.freshnessAt) : NaN;
  if (!Number.isFinite(at)) return 0;
  const days = Math.max(0, (now - at) / 86_400_000);
  return clamp01(Math.pow(0.5, days / config.freshnessHalfLifeDays));
}

export function components(
  c: Campaign,
  cand: SponsoredCandidate,
  relevance: number,
  now: number,
  config: SponsoredConfig = SPONSORED_ACTIVE,
): Components {
  return {
    relevance: clamp01(relevance),
    quality: qualityScore(c),
    fit: clamp01(cand.fit),
    performance: performanceScore(c, config),
    verification: c.verified ? 1 : 0,
    freshness: freshnessScore(c, now, config),
  };
}

/* The weighted sum, 0..1. No bid term exists. */
export function sponsoredScore(x: Components, config: SponsoredConfig = SPONSORED_ACTIVE): number {
  const w = config.weights;
  return (
    w.relevance * x.relevance +
    w.quality * x.quality +
    w.fit * x.fit +
    w.performance * x.performance +
    w.verification * x.verification +
    w.freshness * x.freshness
  );
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  let both = 0;
  for (const x of new Set(b)) if (sa.has(x)) both++;
  return both / (sa.size + new Set(b).size - both);
}

/* ------------------------------------------------------------------ ranking */

export function rankSponsored(input: RankInput): RankOutput {
  const config = input.config ?? SPONSORED_ACTIVE;
  const now = input.now ?? Date.now();
  const viewer = input.viewer ?? NO_VIEWER_STATE;
  const limit = Math.min(config.max, MAX_SPONSORED_TOOLS);
  const byTool = new Map(input.campaigns.map((c) => [c.toolId, c]));
  const decisions: Decision[] = [];

  /* One candidate per tool, the best match if retrieval listed it twice. */
  const seen = new Map<string, SponsoredCandidate>();
  for (const cand of input.candidates) {
    const prev = seen.get(cand.toolId);
    if (!prev || cand.relevance > prev.relevance) seen.set(cand.toolId, cand);
  }
  const candidates = [...seen.values()];
  const best = candidates.reduce((b, c) => Math.max(b, c.relevance), 0);

  type Live = { c: Campaign; cand: SponsoredCandidate; x: Components; base: number; decision: Decision };
  const live: Live[] = [];

  for (const cand of candidates) {
    const c = byTool.get(cand.toolId);
    if (!c) continue; /* Not sponsored: the overwhelmingly common case, not logged. */

    const failures: Failure[] = runFailures(c, now);

    /* The relevance gate, the same on both surfaces: Ask's candidates carry
       Search's relevance for the question (askSponsoredCandidates). */
    if (cand.relevance < config.minRelevance) failures.push("below_relevance");
    else if (cand.relevance < best * config.minShareOfBest) failures.push("below_share_of_best");

    /* The quality and policy gate. */
    if (!c.websiteHttps) failures.push("no_website");
    if (c.reporters30d >= config.maxReporters || c.openReports >= config.maxOpenReports) failures.push("reported");
    const quality = qualityScore(c);
    if (quality < config.minQuality) failures.push("below_quality");

    /* The viewer. */
    const v = viewer.tools.get(c.toolId);
    if (v?.dismissed) failures.push("dismissed");
    const cap = c.frequencyCap ?? config.maxImpressionsPerViewerPerDay;
    if (v && v.served24h >= cap) failures.push("frequency_cap");
    if (
      config.maxConsecutiveServes === 1 &&
      v?.inLastServe &&
      (input.queryKey ?? null) !== viewer.lastQueryKey
    ) {
      failures.push("consecutive");
    }

    /* Relevance is scored against the best match for the query, so the
       strongest organic result is 1.0. */
    const relevance = best > 0 ? cand.relevance / best : 0;
    const x = components(c, cand, relevance, now, config);
    const base = sponsoredScore(x, config);
    const decision: Decision = {
      toolId: c.toolId,
      slug: c.slug,
      sponsorshipId: c.sponsorshipId,
      eligible: failures.length === 0,
      failures,
      components: x,
      score: round1(base * 100),
      diversityPenalty: 0,
      position: null,
    };
    decisions.push(decision);
    if (decision.eligible) live.push({ c, cand, x, base, decision });
  }

  /*
    Greedy diversity. Each round takes the best adjusted score, where a tool
    loses diversityPenalty times the share of categories it has with any pick
    already made. Ties fall to relevance, then the slug, so a run is
    reproducible.
  */
  const picks: SponsoredPick[] = [];
  const pool = [...live];
  while (pool.length > 0) {
    let bestIdx = -1;
    let bestAdj = -Infinity;
    let bestPen = 0;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      const overlap = picks.reduce((m, q) => Math.max(m, jaccard(p.c.categories, byTool.get(q.toolId)?.categories ?? [])), 0);
      const pen = config.diversityPenalty * overlap;
      const adj = p.base - pen;
      const cur = bestIdx >= 0 ? pool[bestIdx] : null;
      if (
        adj > bestAdj + 1e-9 ||
        (cur &&
          Math.abs(adj - bestAdj) <= 1e-9 &&
          (p.x.relevance > cur.x.relevance || (p.x.relevance === cur.x.relevance && p.c.slug < cur.c.slug)))
      ) {
        bestIdx = i;
        bestAdj = adj;
        bestPen = pen;
      }
    }
    const [p] = pool.splice(bestIdx, 1);
    p.decision.diversityPenalty = round1(bestPen * 100);
    p.decision.score = round1(bestAdj * 100);
    if (picks.length >= limit) {
      p.decision.eligible = false;
      p.decision.failures.push("over_limit");
      continue;
    }
    p.decision.position = picks.length;
    picks.push({
      toolId: p.c.toolId,
      slug: p.c.slug,
      sponsorshipId: p.c.sponsorshipId,
      position: picks.length,
      score: round1(bestAdj * 100),
      components: p.x,
    });
  }

  decisions.sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || (b.score ?? -1) - (a.score ?? -1));
  return { version: config.version, picks, decisions };
}
