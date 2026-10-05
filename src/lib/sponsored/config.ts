/*
  Sponsored Tools Ranking, the one place its numbers live (D204, D205).

  A developer pays $149.99 a month to sponsor one live tool. That buys
  ELIGIBILITY for a labelled Sponsored slot, never a position: there is no bid,
  no tier and no way to pay more. Among the sponsored tools that match a search
  or an Ask question, order comes from relevance, quality, fit, sponsored
  performance, verification and freshness, with the weights below.

  VERSIONED. Every serve and every event records `version`, so a number can be
  traced to the rules that produced it. Changing a weight or a threshold means
  adding sponsored_tools_v2 here and pointing SPONSORED_ACTIVE at it, never
  editing v1 in place.
*/

export const SPONSORSHIP_PRICE_CENTS = 14999;

/* The hard ceiling on sponsored tools per Search query and per Ask answer. */
export const MAX_SPONSORED_TOOLS = 3;

export type SponsoredConfig = {
  version: string;
  weights: {
    relevance: number;
    quality: number;
    fit: number;
    performance: number;
    verification: number;
    freshness: number;
  };
  /* The relevance gate, on Search's 0..1 relevance scale, for Search and for
     Ask (which is measured on the same scale). Both must hold. */
  minRelevance: number;
  minShareOfBest: number;
  /* Below this a tool is not shown however well it matches. */
  minQuality: number;
  /* Distinct people reporting the ad in 30 days, and open moderation reports on
     the tool, at which it stops being served until an admin looks. */
  maxReporters: number;
  maxOpenReports: number;
  /* Sponsored performance needs this many on screen views before it moves
     away from neutral, so a new campaign is not punished for having no data. */
  performanceMinViews: number;
  /* The click rate a typical ad is assumed to have, and how many views of it
     the prior is worth. */
  performancePriorRate: number;
  performancePriorViews: number;
  /* Days for the freshness signal to halve. */
  freshnessHalfLifeDays: number;
  /* Impressions of one tool per viewer per 24 hours, unless the campaign sets
     its own frequency_cap. */
  maxImpressionsPerViewerPerDay: number;
  /* How many serves in a row one tool may take for one viewer on one surface.
     1: a tool shown in the last serve sits the next one out, unless it is the
     same query seen again (a reload, a tab switch). null turns it off. */
  maxConsecutiveServes: 1 | null;
  /* Taken off a candidate's score for each share of categories it has in
     common with a tool already picked. Small on purpose: it decides between
     close scores and never lifts a weak match over a strong one. */
  diversityPenalty: number;
  max: number;
};

export const SPONSORED_TOOLS_V1: SponsoredConfig = {
  version: "sponsored_tools_v1",
  weights: {
    relevance: 0.45,
    quality: 0.2,
    fit: 0.15,
    performance: 0.1,
    verification: 0.05,
    freshness: 0.05,
  },
  /*
    MEASURED, 2026-10-05, against the real catalogue (D204). "video editor":
    captions 0.454, descript 0.327, framelift 0.258, and cursor 0.186 because
    "editor" matches "code editor"; cursor is out on both counts. "ai coding
    tool": codex 0.312 to github-copilot 0.276, all in. "code editor":
    github-copilot 0.247 of 0.444 (56%) in, codex 0.201 (45%) out.
  */
  minRelevance: 0.2,
  minShareOfBest: 0.5,
  minQuality: 0.4,
  maxReporters: 3,
  maxOpenReports: 2,
  performanceMinViews: 50,
  performancePriorRate: 0.05,
  performancePriorViews: 100,
  freshnessHalfLifeDays: 180,
  maxImpressionsPerViewerPerDay: 5,
  /* Off by the founder's call, 2026-10-05, before v1 shipped: it hid an ad on
     a refined query ("ai coding tool" then "best ai coding tool"), and the
     daily cap already stops one tool dominating. */
  maxConsecutiveServes: null,
  diversityPenalty: 0.06,
  max: MAX_SPONSORED_TOOLS,
};

export const SPONSORED_ACTIVE = SPONSORED_TOOLS_V1;

export const SPONSORED_VERSIONS: Record<string, SponsoredConfig> = {
  [SPONSORED_TOOLS_V1.version]: SPONSORED_TOOLS_V1,
};

export function weightSum(c: SponsoredConfig): number {
  const w = c.weights;
  return w.relevance + w.quality + w.fit + w.performance + w.verification + w.freshness;
}
