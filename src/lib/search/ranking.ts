import type {
  Candidate,
  ModelCandidate,
  ParsedQuery,
  PersonCandidate,
  ScoreBreakdown,
  Scored,
  ToolCandidate,
} from "./types";

/*
  Celpare search ranking v1.

  THE WHOLE POINT OF THIS FILE is that every number a search result's position
  depends on is in it. Retrieval answers "what matched and how"; this decides
  what that is worth. Nothing in a page or a component does arithmetic on a
  score, and no weight is written twice. Same split D29 settled for the feed, and
  the same reason: retuning search must not mean opening a query or a component.

  RELEVANCE DOMINATES, BY CONSTRUCTION AND NOT BY CONVENTION. Every signal is
  normalised to 0..1 first, relevance carries a weight an order of magnitude
  larger than any support signal, and the support signals are then CAPPED as a
  fraction of the relevance they are supporting. A tool with 50 likes that
  matches "ai video generator" exactly cannot be overtaken by a tool with 50,000
  likes that vaguely relates to video, because the support the popular one can
  earn is bounded by how well it matched in the first place. That is section 8 of
  the brief enforced arithmetically.

  WHAT IS NOT HERE. The auto hide threshold, the plan limits and anything a
  trigger enforces stay in the database, for the reason ranking.ts already wrote
  down for the feed: a trigger cannot read a TypeScript file, and a copy here
  would be a second number that drifts from the true one.

  tools.popularity_score IS NOT USED, and that is deliberate. It is a real column
  and it is dead: all 56 rows read 0 and no trigger maintains it, exactly the
  trap posts.score set for the feed. Popularity is computed here from counts that
  are actually written.
*/

export const WEIGHTS = {
  /* ------------------------------------------------------------------
     The blend. Each is applied to a signal already normalised to 0..1.
     ------------------------------------------------------------------ */
  RELEVANCE: 100,
  /* Reserved for embeddings. Nothing supplies a semantic similarity today, so
     this contributes exactly zero and the interface is what matters: a vector
     score lands in candidate.semantic and the formula already has a place for
     it. Section 5 asks for retrieval to be upgradeable without rewriting the
     ranking layer, and an unused term costs nothing. */
  SEMANTIC: 45,
  QUALITY: 18,
  POPULARITY: 14,
  ENGAGEMENT: 10,
  FRESHNESS: 6,
  PERSONALIZATION: 12,
  BEHAVIOUR: 8,

  /*
    The cap that keeps popularity in its place. Support (everything that is not
    relevance or semantics) may contribute at most this multiple of the relevance
    contribution the candidate already earned. At 0.55 a perfect match with no
    audience still outranks a weak match with every signal maxed out.
  */
  SUPPORT_CAP_RATIO: 0.55,
  /* A little support is allowed even at low relevance, or a directory of new
     tools with no engagement would order arbitrarily. */
  SUPPORT_FLOOR: 4,

  /* ------------------------------------------------------------------
     Relevance components. These are the weights INSIDE the 0..1
     relevance signal, so they are relative to each other only.
     ------------------------------------------------------------------ */
  R_EXACT: 1.0,
  R_PREFIX: 0.46,
  R_PHRASE: 0.5,
  R_NAME_SIMILARITY: 0.34,
  R_TERM_COVERAGE: 0.5,
  R_TS_RANK: 0.22,
  R_CATEGORY: 0.3,
  R_TAG: 0.26,
  R_FEATURE: 0.22,
  R_PLATFORM: 0.12,
  R_SKILL: 0.28,
  R_EXPERTISE: 0.28,
  R_COMPANY: 0.2,
  R_PROVIDER: 0.26,
  R_MODALITY: 0.2,

  /*
    How much an intent mismatch costs on the All tab. A multiplier, never a
    filter: "machine learning engineers" puts people first and still shows the
    tools underneath.
  */
  INTENT_MATCH: 1.0,
  INTENT_NEUTRAL: 0.9,
  INTENT_MISMATCH: 0.72,

  /* ------------------------------------------------------------------
     Quality, popularity, freshness.
     ------------------------------------------------------------------ */
  /* The prior for the confidence adjusted rating: how many reviews a tool needs
     before its own average outweighs the catalogue average. Low, because the
     catalogue is small; raise it as reviews arrive. */
  RATING_PRIOR_COUNT: 8,
  RATING_PRIOR_MEAN: 3.8,

  /* Saturation points. Each count is divided by its own scale before the log, so
     views and likes and reviews arrive at the blend on the same footing. This is
     the brief's "do not add views + likes + stars" made explicit: nothing is
     summed before it is normalised. */
  SCALE_VIEWS_30D: 500,
  SCALE_VIEWS_TOTAL: 5000,
  SCALE_LIKES: 200,
  SCALE_SAVES: 200,
  SCALE_REVIEWS: 50,
  SCALE_MENTIONS: 25,
  SCALE_FOLLOWERS: 500,
  SCALE_POST_ENGAGEMENT: 50,

  /* Inside the popularity signal. */
  P_VIEWS_30D: 0.4,
  P_VIEWS_TOTAL: 0.15,
  P_LIKES: 0.25,
  P_SAVES: 0.3,
  P_REVIEWS: 0.2,
  P_MENTIONS: 0.15,

  /* Popularity decays. A tool that was busy two years ago and is quiet now must
     not hold a permanent lead, which is the same reasoning GRAVITY applies to
     the feed. Half life in days, applied to the LAST SEEN activity rather than
     to the creation date. */
  POPULARITY_HALF_LIFE_DAYS: 180,

  /* Inside quality. */
  Q_VERIFIED: 0.3,
  Q_RATING: 0.35,
  Q_COMPLETENESS: 0.2,
  Q_HAS_REVIEWS: 0.15,

  /* Freshness half life in days. Low weight on purpose: a good tool does not
     become wrong because it is a year old. */
  FRESHNESS_HALF_LIFE_DAYS: 120,

  /* ------------------------------------------------------------------
     Behaviour, and the loop it must not close.
     ------------------------------------------------------------------ */
  /* An impression at rank 1 collects clicks because it is at rank 1. So the
     observed click rate is compared against what that POSITION earns anyway,
     and only the surplus counts. Below this many impressions the rate is noise
     and is ignored entirely. */
  BEHAVIOUR_MIN_IMPRESSIONS: 8,
  /* A save, a follow or an outbound click is worth more than a click, because
     the person went on to do something with what they found. */
  BEHAVIOUR_STRONG_MULTIPLIER: 2.5,
  /* Expected click rate by position, so the surplus is measurable. Rough and
     documented as rough: it is a placeholder for a measured curve, and it
     cannot be measured before there is traffic. */
  POSITION_CTR: [0.28, 0.16, 0.11, 0.08, 0.06, 0.05, 0.04, 0.035, 0.03, 0.025],

  /* ------------------------------------------------------------------
     Penalties.
     ------------------------------------------------------------------ */
  /* A tool with nothing but a name is not ready to be recommended. */
  PENALTY_INCOMPLETE: 0.25,
  /* There is deliberately no PENALTY_REPORTED. Reports are counted in the
     database and a post past the threshold is already hidden by tg_reports_count,
     so search never sees it. A weight here would be a number that never fires,
     which is worse than an absent one because it reads as a control. */

  /*
    Below this relevance, the best result in the whole pool is a weak match and
    the page says so above the list.

    MEASURED, NOT PICKED. Against the real catalogue: "claude" scores 0.75,
    "ai video generator" 0.39, "best ai coding tools" 0.26, "transcribe audio"
    0.26, "ai that turns text into videos" 0.20, and the nonsense query
    "zzzz nothing matches this query" scores 0.042, because one rare word out of
    five happened to appear in one description. 0.10 sits in the gap.

    IT DOES NOT HIDE ANYTHING. Retrieval ORs its arms, so almost any English
    sentence matches something somewhere, and dropping those would be claiming
    nothing was found when something was. The person is told the match is weak
    and given the refinement advice instead, with what came closest underneath.
  */
  WEAK_RESULT_RELEVANCE: 0.1,

  /* ------------------------------------------------------------------
     Retrieval and paging.
     ------------------------------------------------------------------ */
  TOOL_POOL: 60,
  MODEL_POOL: 40,
  PEOPLE_POOL: 30,
  POST_POOL: 30,
  /* Per tab, per page. */
  PAGE_SIZE: 12,
  /* How many rows the All tab shows before "see all in this tab". */
  ALL_TAB_PER_TYPE: 4,

  /* ------------------------------------------------------------------
     Diversity, applied after ranking.
     ------------------------------------------------------------------ */
  MAX_PER_CATEGORY_RUN: 2,
  MAX_PER_DEVELOPER: 3,
  MAX_PER_PROVIDER_RUN: 2,
} as const;

/* ---------------------------------------------------------------------------
   Normalisation primitives.
   --------------------------------------------------------------------------- */

/*
  A count to 0..1, saturating.

  log1p rather than a straight ratio, because the difference between 0 and 100
  views matters and the difference between 40,000 and 40,100 does not. Dividing
  by log1p(scale) puts "scale" at 1.0 and lets anything larger exceed it
  slightly, which is then clamped.
*/
export function saturate(count: number, scale: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  return clamp01(Math.log1p(count) / Math.log1p(Math.max(scale, 1)));
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/* Exponential decay to 0..1 by half life. */
export function decay(days: number, halfLifeDays: number): number {
  if (!Number.isFinite(days)) return 0;
  const age = Math.max(0, days);
  return Math.pow(0.5, age / Math.max(halfLifeDays, 1));
}

export function daysSince(iso: string | null, now: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  /* A row written a second into the future must not produce a negative age. */
  return Math.max(0, now - then) / 86_400_000;
}

/*
  The confidence adjusted rating, 0..1.

  5.0 from one review must not outrank 4.8 from 8,000. A Bayesian average pulls
  a small sample towards the catalogue prior and leaves a large one alone, which
  is section 10's "statistically defensible method" and is one line rather than a
  Wilson interval that would need a binomial the star scale does not give.
*/
export function bayesianRating(rating: number | null, count: number): number {
  const n = Math.max(0, count);
  if (!rating || n === 0) return 0;

  const prior = WEIGHTS.RATING_PRIOR_COUNT;
  const adjusted =
    (prior * WEIGHTS.RATING_PRIOR_MEAN + n * rating) / (prior + n);

  /* Onto 0..1. A 5 star scale where 1 is the floor, not 0: nobody rates below 1,
     so treating 1 as zero quality is what the scale actually means. */
  return clamp01((adjusted - 1) / 4);
}

/* ---------------------------------------------------------------------------
   Relevance. The dominant signal.
   --------------------------------------------------------------------------- */

function termCoverage(hits: number, total: number): number {
  if (total <= 0) return 0;
  return clamp01(hits / total);
}

/*
  Relevance is a weighted sum of the match signals, divided by the maximum a
  candidate of that kind could have scored, so it lands on 0..1 regardless of how
  many signals that entity type has. Without that division a tool (eleven
  signals) would always out-relevance a person (seven).
*/
function relevanceOf(candidate: Candidate, parsed: ParsedQuery): number {
  const m = candidate.match;
  const w = WEIGHTS;

  let score = 0;
  let max = 0;

  const add = (weight: number, value: number) => {
    score += weight * clamp01(value);
    max += weight;
  };

  add(w.R_EXACT, m.exact ? 1 : 0);
  /* A prefix match is worth more while the person is still typing and less once
     they have finished the word, which is what `partial` is for. */
  add(w.R_PREFIX, m.prefix ? (parsed.partial ? 1 : 0.8) : 0);
  add(w.R_PHRASE, m.phrase ? 1 : 0);
  add(w.R_NAME_SIMILARITY, m.nameSimilarity);
  add(w.R_TERM_COVERAGE, termCoverage(m.termHits, m.termTotal));
  /* ts_rank_cd is unbounded in principle and small in practice. Saturating at 1
     rather than clamping keeps a very high rank from flattening. */
  add(w.R_TS_RANK, saturate(m.tsRank * 10, 10));

  if (candidate.type === "tool") {
    add(w.R_CATEGORY, candidate.match.category ? 1 : 0);
    add(w.R_TAG, candidate.match.tag ? 1 : 0);
    add(w.R_FEATURE, candidate.match.feature ? 1 : 0);
    add(w.R_PLATFORM, candidate.match.platform ? 1 : 0);
  } else if (candidate.type === "model") {
    add(w.R_PROVIDER, candidate.match.provider ? 1 : 0);
    add(w.R_TAG, candidate.match.tag ? 1 : 0);
    add(w.R_MODALITY, candidate.match.modality ? 1 : 0);
  } else if (candidate.type === "person") {
    add(w.R_SKILL, candidate.match.skill ? 1 : 0);
    add(w.R_EXPERTISE, candidate.match.expertise ? 1 : 0);
    add(w.R_COMPANY, candidate.match.company ? 1 : 0);
  }

  return max > 0 ? clamp01(score / max) : 0;
}

/* ---------------------------------------------------------------------------
   Quality, popularity, engagement, freshness.
   --------------------------------------------------------------------------- */

/* How filled in a tool's record is. A profile with a logo, a tagline, a
   description, pricing, tags, features and a category is one somebody can
   actually choose from. */
function toolCompleteness(t: ToolCandidate): number {
  const parts = [
    Boolean(t.logoUrl),
    Boolean(t.tagline),
    (t.description?.length ?? 0) > 80,
    Boolean(t.pricing || t.pricingModel),
    t.tags.length > 0,
    t.features.length > 0,
    t.categories.length > 0,
  ];
  return parts.filter(Boolean).length / parts.length;
}

function modelCompleteness(m: ModelCandidate): number {
  const parts = [
    Boolean(m.provider),
    (m.description?.length ?? 0) > 60,
    Boolean(m.contextWindow),
    m.modalities.length > 0,
    m.tags.length > 0,
    m.inputPrice !== null || m.outputPrice !== null,
  ];
  return parts.filter(Boolean).length / parts.length;
}

function personCompleteness(p: PersonCandidate): number {
  const parts = [
    Boolean(p.fullName),
    Boolean(p.bio),
    Boolean(p.avatarUrl),
    p.skills.length > 0 || p.expertise.length > 0,
  ];
  return parts.filter(Boolean).length / parts.length;
}

function qualityOf(candidate: Candidate): number {
  const w = WEIGHTS;

  if (candidate.type === "tool") {
    return clamp01(
      w.Q_VERIFIED * (candidate.verified ? 1 : 0) +
        w.Q_RATING * bayesianRating(candidate.rating, candidate.ratingCount) +
        w.Q_COMPLETENESS * toolCompleteness(candidate) +
        w.Q_HAS_REVIEWS * saturate(candidate.engagement.reviews, w.SCALE_REVIEWS),
    );
  }

  if (candidate.type === "model") {
    return clamp01(
      w.Q_COMPLETENESS * modelCompleteness(candidate) +
        w.Q_VERIFIED * (candidate.provider ? 0.5 : 0),
    );
  }

  if (candidate.type === "person") {
    return clamp01(
      w.Q_VERIFIED * (candidate.developerVerified ? 1 : 0) +
        w.Q_COMPLETENESS * personCompleteness(candidate) +
        0.2 * saturate(candidate.followerCount, w.SCALE_FOLLOWERS),
    );
  }

  /* A post's quality is its engagement. There is nothing else to read. */
  return saturate(
    candidate.likeCount + candidate.commentCount * 2 + candidate.saveCount * 3,
    WEIGHTS.SCALE_POST_ENGAGEMENT,
  );
}

/*
  Popularity: normalised engagement multiplied by a decay on how recently that
  engagement happened.

  Each count is saturated on its OWN scale before anything is added, which is the
  brief's rule about scales. The decay is keyed on the last activity we can see:
  30 day views when there are any, otherwise the publication date, which is the
  most recent thing known about a tool nobody has opened.
*/
function popularityOf(candidate: Candidate, now: number): number {
  const w = WEIGHTS;

  if (candidate.type === "tool") {
    const e = candidate.engagement;
    const raw = clamp01(
      w.P_VIEWS_30D * saturate(e.views30d, w.SCALE_VIEWS_30D) +
        w.P_VIEWS_TOTAL * saturate(e.viewsTotal, w.SCALE_VIEWS_TOTAL) +
        w.P_LIKES * saturate(candidate.likeCount, w.SCALE_LIKES) +
        w.P_SAVES * saturate(e.saves, w.SCALE_SAVES) +
        w.P_REVIEWS * saturate(e.reviews, w.SCALE_REVIEWS) +
        w.P_MENTIONS * saturate(e.mentions, w.SCALE_MENTIONS),
    );

    /* Recent views are proof of current interest, so a tool with any is not
       decayed at all. Without them, age stands in for silence. */
    if (e.views30d > 0) return raw;
    return (
      raw *
      decay(
        daysSince(candidate.publishedAt ?? candidate.createdAt, now),
        w.POPULARITY_HALF_LIFE_DAYS,
      )
    );
  }

  if (candidate.type === "model") {
    return clamp01(
      w.P_SAVES * saturate(candidate.engagement.saves, w.SCALE_SAVES) +
        w.P_MENTIONS * saturate(candidate.engagement.mentions, w.SCALE_MENTIONS),
    );
  }

  if (candidate.type === "person") {
    return saturate(candidate.followerCount, w.SCALE_FOLLOWERS);
  }

  return saturate(
    candidate.likeCount + candidate.commentCount + candidate.saveCount,
    w.SCALE_POST_ENGAGEMENT,
  );
}

/* Engagement QUALITY, which is not the same as volume: the proportion of people
   who did something durable rather than merely looked. */
function engagementQualityOf(candidate: Candidate): number {
  if (candidate.type === "tool") {
    const e = candidate.engagement;
    if (e.viewsTotal < 10) return 0;
    const durable = e.saves + e.reviews * 2 + candidate.likeCount;
    return clamp01(durable / e.viewsTotal);
  }

  if (candidate.type === "post") {
    if (candidate.likeCount + candidate.commentCount === 0) return 0;
    return clamp01(
      (candidate.saveCount * 3 + candidate.commentCount * 2) /
        Math.max(candidate.likeCount + candidate.commentCount, 1),
    );
  }

  return 0;
}

function freshnessOf(candidate: Candidate, now: number): number {
  const iso =
    candidate.type === "tool"
      ? (candidate.publishedAt ?? candidate.createdAt)
      : candidate.createdAt;
  return decay(daysSince(iso, now), WEIGHTS.FRESHNESS_HALF_LIFE_DAYS);
}

/* ---------------------------------------------------------------------------
   Behaviour: the click signal, position adjusted.
   --------------------------------------------------------------------------- */

function expectedCtr(position: number): number {
  const table = WEIGHTS.POSITION_CTR;
  const i = Math.max(0, Math.round(position));
  return table[Math.min(i, table.length - 1)] ?? 0.02;
}

/*
  The SURPLUS click rate, not the rate.

  observed - expected(position). A result that gets 28% of clicks at rank 1 has
  told us nothing, because rank 1 earns that anyway. A result that gets 28% at
  rank 7 has told us it should not be at rank 7. That is what stops the feedback
  loop the brief warns about: without the subtraction, whatever is on top is
  promoted for being on top.
*/
function behaviourOf(candidate: Candidate): number {
  const b = candidate.behaviour;
  if (b.impressions < WEIGHTS.BEHAVIOUR_MIN_IMPRESSIONS) return 0;

  const observed =
    (b.clicks + b.strong * WEIGHTS.BEHAVIOUR_STRONG_MULTIPLIER) / b.impressions;
  const surplus = observed - expectedCtr(b.avgPosition);
  if (surplus <= 0) return 0;

  /* Saturating, so one wildly clicked result cannot swamp relevance. */
  return clamp01(surplus / 0.3);
}

/* ---------------------------------------------------------------------------
   Personalization.
   --------------------------------------------------------------------------- */

export type Affinity = {
  /* Lowercased value to weight. Built by personalization.ts from what this
     account has actually saved, liked and opened. */
  categories: Map<string, number>;
  tags: Map<string, number>;
  /* Ids this person follows, for people results. */
  following: Set<string>;
  /* Their own recent searches, normalised. */
  recent: string[];
};

export const NO_AFFINITY: Affinity = {
  categories: new Map(),
  tags: new Map(),
  following: new Set(),
  recent: [],
};

/*
  Personalization NUDGES, it never decides.

  Its weight is a twelfth of relevance and it is inside the support cap, so a
  person searching for a specific tool still gets that tool first whatever their
  history says. Section 14's rule, enforced by the same cap that holds popularity
  down rather than by a second mechanism.
*/
function personalizationOf(candidate: Candidate, affinity: Affinity): number {
  const maxWeight = Math.max(
    1,
    ...affinity.categories.values(),
    ...affinity.tags.values(),
  );

  if (candidate.type === "tool") {
    let best = 0;
    for (const c of candidate.categories) {
      best = Math.max(best, affinity.categories.get(c.toLowerCase()) ?? 0);
    }
    for (const t of candidate.tags) {
      best = Math.max(best, (affinity.tags.get(t.toLowerCase()) ?? 0) * 0.8);
    }
    return clamp01(best / maxWeight);
  }

  if (candidate.type === "model") {
    let best = 0;
    for (const t of candidate.tags) {
      best = Math.max(best, affinity.tags.get(t.toLowerCase()) ?? 0);
    }
    return clamp01(best / maxWeight);
  }

  if (candidate.type === "person") {
    /* Somebody you follow is somebody you know. Their content is more likely to
       be what you meant, and it is also the one case where personalization is
       not a guess. */
    return affinity.following.has(candidate.id) ? 1 : 0;
  }

  return affinity.following.has(candidate.authorId) ? 0.8 : 0;
}

/* ---------------------------------------------------------------------------
   Penalties.
   --------------------------------------------------------------------------- */

function penaltyOf(candidate: Candidate): number {
  let penalty = 0;

  if (candidate.type === "tool") {
    if (toolCompleteness(candidate) < 0.4) penalty += WEIGHTS.PENALTY_INCOMPLETE;
  }
  if (candidate.type === "model") {
    if (modelCompleteness(candidate) < 0.4) penalty += WEIGHTS.PENALTY_INCOMPLETE;
  }
  if (candidate.type === "person") {
    if (personCompleteness(candidate) < 0.3) penalty += WEIGHTS.PENALTY_INCOMPLETE;
  }

  return clamp01(penalty);
}

/* ---------------------------------------------------------------------------
   Intent, on the blended tab.
   --------------------------------------------------------------------------- */

function intentMultiplier(candidate: Candidate, parsed: ParsedQuery): number {
  const w = WEIGHTS;
  const i = parsed.intent;

  if (i === "general") return w.INTENT_NEUTRAL;

  if (i === "entity") {
    /* A name could be any of them, so nothing is penalised. What decides an
       entity query is the exact match inside relevance, which is where it
       belongs. */
    return w.INTENT_NEUTRAL;
  }

  const matches =
    (i === "tool" && candidate.type === "tool") ||
    (i === "model" && candidate.type === "model") ||
    (i === "person" && candidate.type === "person") ||
    (i === "post" && candidate.type === "post");

  if (matches) return w.INTENT_MATCH;

  /* A tool intent still wants the models: "coding ai" is answered by both. The
     mismatch price is small for the neighbouring type and full for the rest. */
  const neighbouring =
    (i === "tool" && candidate.type === "model") ||
    (i === "model" && candidate.type === "tool");

  return neighbouring ? w.INTENT_NEUTRAL : w.INTENT_MISMATCH;
}

/* ---------------------------------------------------------------------------
   The scoring function.
   --------------------------------------------------------------------------- */

export type RankContext = {
  parsed: ParsedQuery;
  affinity: Affinity;
  now: number;
  /* Semantic similarity by candidate id, when a vector index exists. Nothing
     fills this today; the term is in the formula so adding one later is a
     retrieval change rather than a ranking rewrite. */
  semantic?: Map<string, number>;
};

export function scoreCandidate(
  candidate: Candidate,
  ctx: RankContext,
): ScoreBreakdown {
  const w = WEIGHTS;

  const relevance = relevanceOf(candidate, ctx.parsed);
  const semantic = ctx.semantic?.get(candidate.id) ?? 0;
  const quality = qualityOf(candidate);
  const popularity = popularityOf(candidate, ctx.now);
  const engagement = engagementQualityOf(candidate);
  const freshness = freshnessOf(candidate, ctx.now);
  const personalization = personalizationOf(candidate, ctx.affinity);
  const behaviour = behaviourOf(candidate);
  const penalty = penaltyOf(candidate);

  const relevancePart = w.RELEVANCE * relevance + w.SEMANTIC * semantic;

  /*
    THE CAP. Support is everything that is not about the query, and it may only
    ever be worth a fraction of what the query match earned. This is the single
    line that makes "relevance dominates popularity" true rather than intended.
  */
  const supportRaw =
    w.QUALITY * quality +
    w.POPULARITY * popularity +
    w.ENGAGEMENT * engagement +
    w.FRESHNESS * freshness +
    w.PERSONALIZATION * personalization +
    w.BEHAVIOUR * behaviour;

  const supportCap = relevancePart * w.SUPPORT_CAP_RATIO + w.SUPPORT_FLOOR;
  const support = Math.min(supportRaw, supportCap);

  const penaltyPart = penalty * (w.QUALITY + w.POPULARITY);

  const total = Math.max(
    0,
    (relevancePart + support - penaltyPart) * intentMultiplier(candidate, ctx.parsed),
  );

  return {
    relevance: relevancePart,
    semantic: w.SEMANTIC * semantic,
    quality: w.QUALITY * quality,
    popularity: w.POPULARITY * popularity,
    engagement: w.ENGAGEMENT * engagement,
    freshness: w.FRESHNESS * freshness,
    personalization: w.PERSONALIZATION * personalization,
    behaviour: w.BEHAVIOUR * behaviour,
    penalty: penaltyPart,
    total,
  };
}

/*
  Why this matched, in a handful of words.

  The brief asks every result to show why it matched. This reads the signals
  rather than the score, so it says something true: "Exact match" only when the
  name IS the query, "Matches AI Coding" only when a category actually matched.
  Null when there is nothing honest to say, and the card then shows nothing
  rather than a filler phrase.
*/
export function reasonFor(candidate: Candidate, parsed: ParsedQuery): string | null {
  const m = candidate.match;

  if (m.exact) return "Exact match";
  if (m.prefix) return `Starts with "${parsed.raw}"`;

  if (candidate.type === "tool") {
    if (candidate.match.category && candidate.categories.length > 0) {
      return `In ${candidate.categories[0]}`;
    }
    if (candidate.match.tag) {
      const hit = candidate.tags.find((t) =>
        parsed.terms.includes(t.toLowerCase()),
      );
      if (hit) return `Tagged ${hit}`;
    }
    if (candidate.match.feature) return "Feature match";
  }

  if (candidate.type === "model") {
    if (candidate.match.provider && candidate.provider) {
      return `By ${candidate.provider}`;
    }
    if (candidate.match.modality) return "Modality match";
  }

  if (candidate.type === "person") {
    if (candidate.match.skill) {
      const hit = candidate.skills.find((s) =>
        parsed.terms.includes(s.toLowerCase()),
      );
      if (hit) return `Skilled in ${hit}`;
    }
    if (candidate.match.expertise) {
      const hit = candidate.expertise.find((s) =>
        parsed.terms.includes(s.toLowerCase()),
      );
      if (hit) return `Works on ${hit}`;
    }
    if (candidate.match.company && candidate.company) {
      return `At ${candidate.company}`;
    }
  }

  if (m.phrase) return "Phrase match";
  if (m.termHits > 0 && m.termTotal > 1) {
    return `Matches ${m.termHits} of ${m.termTotal} words`;
  }
  if (m.nameSimilarity > 0.45) return "Similar name";

  return null;
}

/*
  rankCandidates.

  The seam a learned ranker replaces. It takes candidates and a context, it
  returns them ordered with their feature vector attached, and it knows nothing
  about how they were retrieved or how they will be drawn. A gradient boosted
  model, a logistic model or a neural ranker substitutes for the body of this
  function and changes nothing above or below it.
*/
export function rankCandidates<T extends Candidate>(
  candidates: T[],
  ctx: RankContext,
): Scored<T>[] {
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, ctx),
      reason: reasonFor(candidate, ctx.parsed),
    }))
    .sort((a, b) => b.score.total - a.score.total);
}

/* ---------------------------------------------------------------------------
   The empty search state, which is a different problem.
   --------------------------------------------------------------------------- */

/*
  There is no query, so there is no relevance, so the weights above do not apply:
  the support cap would flatten everything to the same number. Recommendation is
  its own small blend, and it lives here rather than in recommendations.ts so
  that every weight in search is still in one file.
*/
export const RECOMMEND = {
  QUALITY: 40,
  POPULARITY: 30,
  FRESHNESS: 14,
  PERSONALIZATION: 26,
  /* An incomplete record is worse here than in a result list. A person who typed
     nothing is being SHOWN something, so it had better be worth showing. */
  PENALTY: 45,
  /* How many candidates to consider before picking. */
  POOL: 40,
  /* How many survive to the screen. Small on purpose: this is the state before
     anybody has asked for anything, and section 2 says a small number. */
  SHOW_TOOLS: 4,
  SHOW_MODELS: 3,
  SHOW_PEOPLE: 3,
  /* One per category, so four image generators cannot fill it. Section 17. */
  MAX_PER_CATEGORY: 1,
} as const;

export function scoreRecommendation(
  candidate: Candidate,
  ctx: RankContext,
): ScoreBreakdown {
  const r = RECOMMEND;

  const quality = qualityOf(candidate);
  const popularity = popularityOf(candidate, ctx.now);
  const freshness = freshnessOf(candidate, ctx.now);
  const personalization = personalizationOf(candidate, ctx.affinity);
  const penalty = penaltyOf(candidate);

  const total = Math.max(
    0,
    r.QUALITY * quality +
      r.POPULARITY * popularity +
      r.FRESHNESS * freshness +
      r.PERSONALIZATION * personalization -
      r.PENALTY * penalty,
  );

  return {
    relevance: 0,
    semantic: 0,
    quality: r.QUALITY * quality,
    popularity: r.POPULARITY * popularity,
    engagement: 0,
    freshness: r.FRESHNESS * freshness,
    personalization: r.PERSONALIZATION * personalization,
    behaviour: 0,
    penalty: r.PENALTY * penalty,
    total,
  };
}

export function rankRecommendations<T extends Candidate>(
  candidates: T[],
  ctx: RankContext,
): Scored<T>[] {
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreRecommendation(candidate, ctx),
      /* No query, so there is no "why it matched" to state. A reason invented
         here would be the filler phrase reasonFor() refuses to produce. */
      reason: null,
    }))
    .sort((a, b) => b.score.total - a.score.total);
}
