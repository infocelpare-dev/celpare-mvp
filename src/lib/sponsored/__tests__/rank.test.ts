import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_SPONSORED_TOOLS, SPONSORED_ACTIVE, SPONSORED_TOOLS_V1, weightSum } from "../config";
import {
  NO_VIEWER_STATE,
  isSponsoredEligible,
  performanceScore,
  qualityScore,
  rankSponsored,
  type Campaign,
  type SponsoredCandidate,
  type ViewerState,
} from "../rank";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const DAY = 86_400_000;

function campaign(toolId: string, over: Partial<Campaign> = {}): Campaign {
  return {
    sponsorshipId: `s-${toolId}`,
    toolId,
    slug: toolId,
    status: "active",
    startsAt: new Date(NOW - 5 * DAY).toISOString(),
    endsAt: new Date(NOW + 25 * DAY).toISOString(),
    toolStatus: "approved",
    placementSuspended: false,
    ownerActive: true,
    frequencyCap: null,
    verified: false,
    rating: null,
    ratingCount: 0,
    likeCount: 0,
    dislikeCount: 0,
    hasLogo: true,
    hasTagline: true,
    hasDescription: true,
    websiteHttps: true,
    domainVerified: false,
    freshnessAt: new Date(NOW - 10 * DAY).toISOString(),
    categories: [toolId],
    views30d: 0,
    clicks30d: 0,
    saves30d: 0,
    reporters30d: 0,
    openReports: 0,
    ...over,
  };
}

const cand = (toolId: string, relevance: number, fit = 0.5): SponsoredCandidate => ({ toolId, relevance, fit });

const rank = (campaigns: Campaign[], candidates: SponsoredCandidate[], extra: Partial<Parameters<typeof rankSponsored>[0]> = {}) =>
  rankSponsored({ surface: "search", campaigns, candidates, now: NOW, ...extra });

describe("config", () => {
  it("weights sum to 1", () => {
    assert.ok(Math.abs(weightSum(SPONSORED_TOOLS_V1) - 1) < 1e-9);
  });

  it("is the spec's v1 weighting", () => {
    assert.deepEqual(SPONSORED_TOOLS_V1.weights, {
      relevance: 0.45,
      quality: 0.2,
      fit: 0.15,
      performance: 0.1,
      verification: 0.05,
      freshness: 0.05,
    });
    assert.equal(SPONSORED_TOOLS_V1.version, "sponsored_tools_v1");
    assert.equal(MAX_SPONSORED_TOOLS, 3);
    assert.equal(SPONSORED_ACTIVE.max, MAX_SPONSORED_TOOLS);
  });

  it("has no bid anywhere", () => {
    const keys = Object.keys(campaign("a")).concat(Object.keys(SPONSORED_TOOLS_V1), Object.keys(SPONSORED_TOOLS_V1.weights));
    assert.ok(!keys.some((k) => /bid|cpc|cpm|budget/i.test(k)), keys.join(","));
  });
});

describe("eligibility", () => {
  it("an active $149.99 sponsorship on a live tool is eligible", () => {
    assert.equal(isSponsoredEligible(campaign("a"), NOW), true);
  });

  it("an expired sponsorship is not", () => {
    assert.equal(isSponsoredEligible(campaign("a", { endsAt: new Date(NOW - DAY).toISOString() }), NOW), false);
  });

  it("one that has not started is not", () => {
    assert.equal(isSponsoredEligible(campaign("a", { startsAt: new Date(NOW + DAY).toISOString() }), NOW), false);
  });

  it("a cancelled or ended sponsorship is not", () => {
    assert.equal(isSponsoredEligible(campaign("a", { status: "cancelled" }), NOW), false);
    assert.equal(isSponsoredEligible(campaign("a", { status: "ended" }), NOW), false);
  });

  it("a suspended or unpublished tool is not", () => {
    /* Suspending a tool sends it back to the queue: status leaves approved. */
    for (const s of ["pending", "draft", "changes_required", "rejected"]) {
      assert.equal(isSponsoredEligible(campaign("a", { toolStatus: s }), NOW), false, s);
    }
  });

  it("a placement suspended by an admin, or an inactive owner, is not", () => {
    assert.equal(isSponsoredEligible(campaign("a", { placementSuspended: true }), NOW), false);
    assert.equal(isSponsoredEligible(campaign("a", { ownerActive: false }), NOW), false);
  });

  it("an ineligible run is never served even if a stale list returns it", () => {
    const out = rank([campaign("a", { status: "ended" })], [cand("a", 0.9)]);
    assert.equal(out.picks.length, 0);
    assert.deepEqual(out.decisions[0].failures, ["run_inactive"]);
  });
});

describe("relevance gate", () => {
  it("a relevant sponsored tool is shown", () => {
    assert.deepEqual(rank([campaign("video")], [cand("video", 0.45)]).picks.map((p) => p.toolId), ["video"]);
  });

  it("an irrelevant sponsored tool is excluded however good it is", () => {
    const strong = campaign("video", { verified: true, rating: 5, ratingCount: 100, domainVerified: true });
    const out = rank([strong], [cand("accounting", 0.6), cand("video", 0.1)]);
    assert.equal(out.picks.length, 0);
    assert.deepEqual(out.decisions[0].failures, ["below_relevance"]);
  });

  it("a sponsored tool the query did not retrieve is not a candidate at all", () => {
    assert.equal(rank([campaign("video")], [cand("accounting", 0.6)]).picks.length, 0);
  });

  it("one far weaker than the best organic match is excluded (measured case)", () => {
    const out = rank(
      [campaign("cursor"), campaign("framelift")],
      [cand("captions", 0.454), cand("descript", 0.327), cand("cursor", 0.186), cand("framelift", 0.258)],
    );
    assert.deepEqual(out.picks.map((p) => p.toolId), ["framelift"]);
  });

  it("Ask clears the same gate as Search", () => {
    const ask = (cands: SponsoredCandidate[]) =>
      rankSponsored({ surface: "ask", campaigns: [campaign("a"), campaign("b")], candidates: cands, now: NOW }).picks.map((p) => p.toolId);
    assert.deepEqual(ask([cand("a", 0.45), cand("b", 0.15)]), ["a"]);
    assert.deepEqual(ask([cand("a", 0.45), cand("b", 0.21)]), ["a"]);
    assert.deepEqual(ask([cand("a", 0.4), cand("b", 0.3)]), ["a", "b"]);
  });

  it("the top of a weak list is still weak (measured: Claude on an accounting question)", () => {
    /* An order based score would have made the first of these 1.0. */
    const out = rankSponsored({ surface: "ask", campaigns: [campaign("claude")], candidates: [cand("claude", 0.12)], now: NOW });
    assert.equal(out.picks.length, 0);
    assert.deepEqual(out.decisions[0].failures, ["below_relevance"]);
  });
});

describe("quality and policy gate", () => {
  it("no https website is excluded", () => {
    assert.ok(rank([campaign("a", { websiteHttps: false })], [cand("a", 0.5)]).decisions[0].failures.includes("no_website"));
  });

  it("an empty profile is below quality", () => {
    const empty = campaign("a", { hasLogo: false, hasTagline: false, hasDescription: false, likeCount: 0, dislikeCount: 20 });
    assert.ok(qualityScore(empty) < SPONSORED_ACTIVE.minQuality);
    assert.ok(rank([empty], [cand("a", 0.5)]).decisions[0].failures.includes("below_quality"));
  });

  it("enough reports pull an ad", () => {
    assert.ok(rank([campaign("a", { reporters30d: 3 })], [cand("a", 0.5)]).decisions[0].failures.includes("reported"));
    assert.ok(rank([campaign("a", { openReports: 2 })], [cand("a", 0.5)]).decisions[0].failures.includes("reported"));
  });
});

describe("ranking", () => {
  it("payment alone does not decide position: every run is the same, and the better match leads", () => {
    const out = rank([campaign("a"), campaign("b")], [cand("a", 0.3), cand("b", 0.45)]);
    assert.deepEqual(out.picks.map((p) => p.toolId), ["b", "a"]);
  });

  it("a higher quality tool can outrank an equally relevant one", () => {
    const good = campaign("good", { rating: 4.8, ratingCount: 40, likeCount: 30, domainVerified: true });
    const thin = campaign("thin", { hasLogo: false, likeCount: 0, dislikeCount: 3 });
    const out = rank([thin, good], [cand("thin", 0.4), cand("good", 0.4)]);
    assert.deepEqual(out.picks.map((p) => p.toolId), ["good", "thin"]);
  });

  it("verification is a small signal, never a trump card", () => {
    const verified = campaign("v", { verified: true });
    const plain = campaign("p");
    /* Clearly more relevant beats verified. */
    assert.deepEqual(rank([verified, plain], [cand("v", 0.3), cand("p", 0.45)]).picks[0].toolId, "p");
    /* At equal relevance, verified edges ahead. */
    assert.deepEqual(rank([verified, plain], [cand("v", 0.4), cand("p", 0.4)]).picks[0].toolId, "v");
  });

  it("relevance dominates: a weak but eligible match cannot pass a strong one on everything else", () => {
    const perfect = campaign("w", { verified: true, rating: 5, ratingCount: 200, likeCount: 100, domainVerified: true, views30d: 1000, clicks30d: 200 });
    const out = rank([perfect, campaign("s")], [cand("w", 0.23), cand("s", 0.45, 0.5)]);
    assert.equal(out.picks[0].toolId, "s");
  });

  it("a new campaign is neutral on performance, not punished", () => {
    assert.equal(performanceScore(campaign("a", { views30d: 10, clicks30d: 0 })), 0.5);
    assert.equal(performanceScore(campaign("a", { views30d: 0 })), 0.5);
  });

  it("click rate is smoothed and capped", () => {
    const hot = performanceScore(campaign("a", { views30d: 60, clicks30d: 60 }));
    assert.ok(hot <= 1 && hot > 0.5);
    const cold = performanceScore(campaign("a", { views30d: 5000, clicks30d: 0 }));
    assert.ok(cold < 0.5 && cold >= 0);
  });

  it("scores are reported 0..100 and versioned", () => {
    const out = rank([campaign("a")], [cand("a", 0.4)]);
    assert.equal(out.version, "sponsored_tools_v1");
    assert.ok(out.picks[0].score > 0 && out.picks[0].score <= 100);
  });

  it("does not change the candidates it was given", () => {
    const candidates = [cand("a", 0.4), cand("b", 0.3)];
    const before = JSON.stringify(candidates);
    rank([campaign("a"), campaign("b")], candidates);
    assert.equal(JSON.stringify(candidates), before);
  });
});

describe("maximum results", () => {
  for (const n of [0, 1, 2, 3, 10, 100]) {
    it(`${n} sponsored and relevant gives ${Math.min(n, 3)}`, () => {
      const ids = Array.from({ length: n }, (_, i) => `t${i}`);
      const out = rank(ids.map((id) => campaign(id)), ids.map((id) => cand(id, 0.4)));
      assert.equal(out.picks.length, Math.min(n, MAX_SPONSORED_TOOLS));
      assert.ok(out.picks.length <= MAX_SPONSORED_TOOLS);
      if (n > 3) assert.equal(out.decisions.filter((d) => d.failures.includes("over_limit")).length, n - 3);
    });
  }

  it("a config asking for more is still capped at three", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const out = rank(ids.map((id) => campaign(id)), ids.map((id) => cand(id, 0.4)), { config: { ...SPONSORED_TOOLS_V1, max: 10 } });
    assert.equal(out.picks.length, 3);
  });

  it("never forces three: one relevant gives one", () => {
    const out = rank([campaign("a"), campaign("b"), campaign("c")], [cand("a", 0.4), cand("b", 0.05), cand("c", 0.05)]);
    assert.equal(out.picks.length, 1);
  });
});

describe("viewer", () => {
  const viewer = (tools: Record<string, Partial<{ served24h: number; dismissed: boolean; inLastServe: boolean }>>, lastQueryKey: string | null = null): ViewerState => ({
    tools: new Map(Object.entries(tools).map(([k, v]) => [k, { served24h: 0, dismissed: false, inLastServe: false, ...v }])),
    lastQueryKey,
  });

  it("a dismissed ad stays hidden", () => {
    assert.equal(rank([campaign("a")], [cand("a", 0.4)], { viewer: viewer({ a: { dismissed: true } }) }).picks.length, 0);
  });

  it("the daily cap applies, and a campaign's own cap wins", () => {
    assert.equal(rank([campaign("a")], [cand("a", 0.4)], { viewer: viewer({ a: { served24h: 5 } }) }).picks.length, 0);
    assert.equal(rank([campaign("a")], [cand("a", 0.4)], { viewer: viewer({ a: { served24h: 4 } }) }).picks.length, 1);
    assert.equal(rank([campaign("a", { frequencyCap: 2 })], [cand("a", 0.4)], { viewer: viewer({ a: { served24h: 2 } }) }).picks.length, 0);
  });

  it("v1 has the consecutive rule off: a refined query still shows the ad", () => {
    assert.equal(SPONSORED_TOOLS_V1.maxConsecutiveServes, null);
    const out = rank([campaign("a"), campaign("b")], [cand("a", 0.45), cand("b", 0.4)], {
      viewer: viewer({ a: { inLastServe: true, served24h: 1 } }, "q1"),
      queryKey: "q2",
    });
    assert.deepEqual(out.picks.map((p) => p.toolId), ["a", "b"]);
  });

  const consecutive = { ...SPONSORED_TOOLS_V1, maxConsecutiveServes: 1 as const };

  it("with the rule on, a tool in the last serve sits out the next one", () => {
    const out = rank([campaign("a"), campaign("b")], [cand("a", 0.45), cand("b", 0.4)], {
      viewer: viewer({ a: { inLastServe: true, served24h: 1 } }, "q1"),
      queryKey: "q2",
      config: consecutive,
    });
    assert.deepEqual(out.picks.map((p) => p.toolId), ["b"]);
  });

  it("but not when it is the same query seen again", () => {
    const out = rank([campaign("a")], [cand("a", 0.45)], {
      viewer: viewer({ a: { inLastServe: true, served24h: 1 } }, "q1"),
      queryKey: "q1",
      config: consecutive,
    });
    assert.equal(out.picks.length, 1);
  });

  it("no viewer state is no restriction", () => {
    assert.equal(rank([campaign("a")], [cand("a", 0.4)], { viewer: NO_VIEWER_STATE }).picks.length, 1);
  });
});

describe("diversity", () => {
  it("penalises a near duplicate when a close alternative exists", () => {
    const out = rank(
      [
        campaign("gen1", { categories: ["video generation"] }),
        campaign("gen2", { categories: ["video generation"] }),
        campaign("editor", { categories: ["video editing"] }),
      ],
      [cand("gen1", 0.45), cand("gen2", 0.44), cand("editor", 0.43)],
    );
    assert.deepEqual(out.picks.map((p) => p.toolId), ["gen1", "editor", "gen2"]);
    assert.ok(out.decisions.find((d) => d.toolId === "gen2")!.diversityPenalty > 0);
  });

  it("does not destroy relevance: a much better duplicate still beats a weak alternative", () => {
    const out = rank(
      [
        campaign("gen1", { categories: ["video generation"] }),
        campaign("gen2", { categories: ["video generation"] }),
        campaign("other", { categories: ["video editing"] }),
      ],
      [cand("gen1", 0.45), cand("gen2", 0.45), cand("other", 0.24)],
    );
    assert.deepEqual(out.picks.map((p) => p.toolId).slice(0, 2), ["gen1", "gen2"]);
  });

  it("a duplicate is still shown when there is nothing else", () => {
    const out = rank(
      [campaign("gen1", { categories: ["video"] }), campaign("gen2", { categories: ["video"] })],
      [cand("gen1", 0.45), cand("gen2", 0.44)],
    );
    assert.equal(out.picks.length, 2);
  });
});
