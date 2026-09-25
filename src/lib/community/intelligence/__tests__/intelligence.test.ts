import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXPLORATION, NEGATIVE, SIGNALS } from "../config";
import { applyDiversity, applyKindDiversity } from "../diversity";
import { explorationSlots, FEED, rankForYou } from "../feed";
import { freshnessScore } from "../freshness";
import { buildInterestProfile, interestIn, isColdStart } from "../interests";
import { wilsonLower } from "../math";
import { explorationValue, noveltyOf, saturationOf } from "../novelty";
import { engagementQuality } from "../quality";
import { reelsFeed } from "../reels";
import { OBJECTIVES, objectiveForIntent, predictEngagement, mlPredictEngagement } from "../scoring";
import { adjacencyTo, lexicalProvider, topicAdjacency, withFallback } from "../semantic";
import { buildSessionProfile, inferIntent } from "../session";
import type { InterestSignal, RankedItem } from "../types";
import { LIFECYCLE, VIRAL, viralState, type ViralAssessment } from "../viral";
import { H, NOW, cand, control, ctx, item, signals } from "./fixtures";

const forYou = (over: Partial<Parameters<typeof rankForYou>[0]> = {}) =>
  rankForYou({
    context: ctx(),
    candidates: [],
    profile: null,
    signals: new Map(),
    assignment: control,
    pages: 1,
    viewerKey: "viewer",
    ...over,
  });

const r = (i: ReturnType<typeof item>): RankedItem => ({ item: i, score: 1, reasons: [], sources: ["fresh"] });

function acts(action: InterestSignal["action"], n: number, over: Partial<InterestSignal> = {}, spacingH = 1): InterestSignal[] {
  return Array.from({ length: n }, (_, i) => ({ action, at: NOW - (i + 1) * spacingH * H, postId: `${action}-${i}-${over.topicId ?? ""}`, ...over }));
}

describe("Signal configuration", () => {
  it("gives actions different meaning, by tier", () => {
    assert.ok(SIGNALS.save.weight > SIGNALS.like.weight);
    assert.ok(SIGNALS.like.weight > SIGNALS.video_start.weight);
    assert.equal(SIGNALS.seen.weight, 0, "an impression means nothing about wanting");
    assert.equal(SIGNALS.not_interested.tier, "strong_negative");
    assert.equal(SIGNALS.skip.tier, "contextual_negative");
  });
});

describe("Interest horizons and strength", () => {
  it("long term needs repetition; one old action fades", () => {
    const repeated = buildInterestProfile("me", acts("like", 12, { topicId: "ai" }, 24 * 7), NOW);
    const once = buildInterestProfile("me", [{ action: "like", at: NOW - 60 * 24 * H, postId: "x", topicId: "ai" }], NOW);
    assert.ok((repeated.longTerm.get("topic:ai") ?? 0) > (once.longTerm.get("topic:ai") ?? 0) * 5);
    assert.equal(repeated.positiveCounts.get("topic:ai"), 12, "confidence comes from the number of actions");
  });

  it("short term reflects the last days only", () => {
    const p = buildInterestProfile("me", [...acts("like", 3, { topicId: "new" }), { action: "like", at: NOW - 10 * 24 * H, postId: "o", topicId: "old" }], NOW);
    assert.ok((p.shortTerm.get("topic:new") ?? 0) > 0);
    assert.equal(p.shortTerm.get("topic:old"), undefined);
  });

  it("a long read counts more than a glance", () => {
    const glance = buildInterestProfile("me", [{ action: "dwell", at: NOW - H, postId: "p", topicId: "t", value: 3000 }], NOW);
    const read = buildInterestProfile("me", [{ action: "dwell", at: NOW - H, postId: "p", topicId: "t", value: 30000 }], NOW);
    assert.equal(glance.longTerm.get("topic:t"), undefined);
    assert.ok((read.longTerm.get("topic:t") ?? 0) > SIGNALS.dwell.weight);
  });
});

describe("Session and intent", () => {
  const sessionActs: InterestSignal[] = [
    { action: "complete", at: NOW - 20 * 60_000, postId: "v1", topicId: "coding", authorId: "a1" },
    { action: "open", at: NOW - 15 * 60_000, postId: "p1", topicId: "coding", authorId: "a2" },
    { action: "save", at: NOW - 12 * 60_000, postId: "p2", topicId: "coding", authorId: "a3" },
    { action: "search", at: NOW - 5 * 60_000, term: "llm coding" },
  ];

  it("recognises this sitting's interest from every kind of action", () => {
    const s = buildSessionProfile("me", sessionActs, NOW);
    assert.ok((s.interests.get("topic:coding") ?? 0) > 0);
    assert.ok((s.interests.get("term:llm") ?? 0) > 0, "the search counts");
    assert.ok(s.consumed.has("p2"));
  });

  it("does not reach outside the window", () => {
    const s = buildSessionProfile("me", [{ action: "save", at: NOW - 3 * H, postId: "x", topicId: "old" }], NOW);
    assert.equal(s.interests.size, 0);
    assert.equal(s.lastAt, 0);
  });

  it("session interest lifts related posts now, without the long term profile having it", () => {
    const coding = item({ authorId: "z1", topicId: "coding", createdAt: NOW - 30 * H, body: "A new llm coding assistant review" });
    const other = item({ authorId: "z2", topicId: "cooking", createdAt: NOW - 30 * H, body: "Bread recipes" });
    const session = buildSessionProfile("me", sessionActs, NOW);
    const withSession = forYou({ candidates: [other, coding].map((i) => cand(i)), session });
    assert.equal(withSession.items[0].item.id, coding.id);
    assert.ok(withSession.items[0].reasons.includes("session_interest"));
  });

  it("infers research, deep interest, social, topic exploration and browsing", () => {
    assert.equal(inferIntent("me", sessionActs, NOW).intent, "research");
    assert.equal(inferIntent("me", acts("save", 2, { topicId: "t" }, 0.1), NOW).intent, "deep_interest");
    assert.equal(inferIntent("me", acts("like", 3, { authorId: "fav" }, 0.1), NOW).intent, "social");
    const explore = ["a", "b", "c"].map((a, i) => ({ action: "open" as const, at: NOW - (i + 1) * 60_000, postId: `o${i}`, topicId: "t", authorId: a }));
    assert.equal(inferIntent("me", explore, NOW).intent, "topic_exploration");
    assert.equal(inferIntent("me", [], NOW).intent, "browsing");
  });

  it("intent bends the objective: research leans on quality, deep interest explores less", () => {
    const base = OBJECTIVES.for_you;
    assert.ok(objectiveForIntent(base, "research").quality > base.quality);
    assert.ok(objectiveForIntent(base, "deep_interest").exploration < base.exploration);
    assert.ok(explorationSlots(1, false, "deep_interest") <= explorationSlots(1, false, "browsing"));
  });
});

describe("Ranking features", () => {
  it("author affinity: a creator somebody keeps engaging with rises", () => {
    const profile = buildInterestProfile("me", [...acts("like", 5, { authorId: "fav", topicId: "x" }), ...acts("comment", 2, { authorId: "fav", topicId: "x" })], NOW);
    const fav = item({ authorId: "fav", topicId: "y", createdAt: NOW - 5 * H });
    const stranger = item({ authorId: "s", topicId: "y", createdAt: NOW - 5 * H });
    const res = forYou({ candidates: [stranger, fav].map((i) => cand(i)), profile });
    assert.equal(res.items[0].item.id, fav.id);
    assert.equal(res.items[0].explanation?.primary, "interacted_with_author");
  });

  it("topic affinity comes from interactions, not only follows", () => {
    const profile = buildInterestProfile("me", acts("save", 3, { topicId: "startups" }), NOW);
    assert.ok(interestIn(profile, item({ topicId: "startups" })).topic > 0.8);
  });

  it("semantic similarity: similar to a saved post, not to itself", () => {
    const saved = item({ authorId: "k1", body: "Vector databases for retrieval augmented generation" });
    const similar = item({ authorId: "k2", body: "Choosing vector databases for retrieval", createdAt: NOW - 5 * H });
    const plain = item({ authorId: "k3", body: "Weekend hiking photos", createdAt: NOW - 5 * H });
    const profile = buildInterestProfile("me", [{ action: "save", at: NOW - 2 * H, postId: saved.id, authorId: "k1" }], NOW);
    const seeds = { liked: new Map(), saved: new Map([[saved.id, new Set(["vector", "databases", "retrieval", "augmented", "generation"])]]), watched: new Map() };
    const res = forYou({ candidates: [plain, similar].map((i) => cand(i)), profile, seeds });
    assert.equal(res.items[0].item.id, similar.id);
    assert.ok(res.items[0].reasons.includes("similar_to_saved"));
  });

  it("freshness is a feature with momentum, not a flat boost", () => {
    const p = item({ createdAt: NOW - 10 * H });
    const quiet = freshnessScore(p, signals({}), NOW, "post");
    const busy = freshnessScore(p, signals({ like: [2, 2, 0, 0, 0, 0], save: [1, 0, 0, 0, 0, 0] }), NOW, "post");
    assert.ok(busy > quiet);
    assert.ok(freshnessScore(item({ createdAt: NOW - 400 * H }), signals({}), NOW, "post") < 0.01);
  });

  it("quality is confidence aware: 2 of 3 does not beat 40 of 60", () => {
    assert.ok(wilsonLower(2, 3) < wilsonLower(40, 60));
    const small = engagementQuality(signals({ impression: [0, 3, 0, 0, 0, 0], save: [0, 2, 0, 0, 0, 0] }));
    const big = engagementQuality(signals({ impression: [0, 60, 0, 0, 0, 0], save: [0, 40, 0, 0, 0, 0] }));
    assert.ok(big.meaningfulRate > small.meaningfulRate);
  });

  it("novelty drops for repeated topic, creator and wording", () => {
    const p = item({ authorId: "same", topicId: "ai", body: "Agents that plan and act" });
    const fresh = noveltyOf(p, { topicCounts: new Map(), authorCounts: new Map(), mediaCounts: new Map(), bodies: [], total: 0 });
    const tired = noveltyOf(p, { topicCounts: new Map([["ai", 5]]), authorCounts: new Map([["same", 4]]), mediaCounts: new Map(), bodies: ["Agents that plan and act well"], total: 9 });
    assert.equal(fresh, 1);
    assert.ok(tired < 0.4);
  });

  it("saturation is a session effect that leaves long term interest alone", () => {
    const p = item({ topicId: "ai" });
    assert.equal(saturationOf(p, new Map([["ai", 2]])), 0);
    assert.ok(saturationOf(p, new Map([["ai", 6]])) > 0.5);
  });
});

describe("Exploration", () => {
  it("prefers adjacent topics and never picks low quality", () => {
    const pool = [
      item({ topicId: "agents", body: "model tool prompt planning agents" }),
      item({ topicId: "code", body: "model tool prompt code editor" }),
      item({ topicId: "cooking", body: "bread flour oven yeast" }),
    ];
    const adj = topicAdjacency(pool);
    assert.ok(adjacencyTo(adj, "code", ["agents"]) > adjacencyTo(adj, "cooking", ["agents"]));
    const base = { adjacency: adj, userTopics: ["agents"], engagementQuality: 0.5, freshness: 0.5, knownAuthor: false, exposure: { topicCounts: new Map(), authorCounts: new Map(), mediaCounts: new Map(), bodies: [], total: 0 } };
    assert.equal(explorationValue(pool[1], { ...base, contentQuality: EXPLORATION.MIN_CONTENT_QUALITY - 0.1 }), 0, "low quality is never explored");
    assert.ok(explorationValue(pool[1], { ...base, contentQuality: 0.8 }) > explorationValue(pool[2], { ...base, contentQuality: 0.8 }));
  });

  it("puts exploration picks in the feed, labelled as exploration, never first", () => {
    const profile = buildInterestProfile("me", acts("save", 4, { topicId: "agents" }), NOW);
    const liked = Array.from({ length: 12 }, (_, i) => item({ authorId: `l${i}`, topicId: "agents", createdAt: NOW - (i + 1) * H, body: `agents planning tool use part ${i} with detailed notes on evaluation` }));
    const adjacent = Array.from({ length: 4 }, (_, i) => item({ authorId: `n${i}`, topicId: "code", createdAt: NOW - (i + 2) * H, body: `code editor tool use and planning notes ${i} with detailed examples` }));
    const res = forYou({ candidates: [...liked, ...adjacent].map((i) => cand(i)), profile });
    const exp = res.items.filter((x) => x.explanation?.primary === "exploration");
    assert.ok(exp.length >= 1, "exploration is present");
    assert.notEqual(res.items[0].explanation?.primary, "exploration");
    assert.ok(exp.length <= Math.ceil(EXPLORATION.MAX_SHARE * FEED.PAGE_SIZE));
  });
});

describe("Negative feedback, precise", () => {
  it("one not interested is a nudge; repeated ones reject the topic", () => {
    const one = buildInterestProfile("me", [{ action: "not_interested", at: NOW - H, postId: "p1", topicId: "crypto" }], NOW);
    const three = buildInterestProfile("me", [1, 2, 3].map((i) => ({ action: "not_interested" as const, at: NOW - i * H, postId: `p${i}`, topicId: "crypto" })), NOW);
    const probe = item({ topicId: "crypto" });
    assert.ok(interestIn(one, probe).negative <= NEGATIVE.LEVELS[1] + 1e-9);
    assert.ok(interestIn(three, probe).negative >= NEGATIVE.LEVELS[3] * 0.9);
  });

  it("positive interest in the same topic softens a single rejection", () => {
    const fan = buildInterestProfile("me", [...acts("save", 6, { topicId: "ai" }), { action: "not_interested", at: NOW - H, postId: "q", topicId: "ai" }, { action: "not_interested", at: NOW - 2 * H, postId: "q2", topicId: "ai" }], NOW);
    const stranger = buildInterestProfile("me", [{ action: "not_interested", at: NOW - H, postId: "q", topicId: "ai" }, { action: "not_interested", at: NOW - 2 * H, postId: "q2", topicId: "ai" }], NOW);
    const probe = item({ topicId: "ai" });
    assert.ok(interestIn(fan, probe).negative < interestIn(stranger, probe).negative);
  });

  it("dislike is configured and acts like a rejection of the post", () => {
    const p = buildInterestProfile("me", [{ action: "dislike", at: NOW - H, postId: "d1", topicId: "t" }], NOW);
    assert.ok(p.notInterested.has("d1"));
    assert.equal(p.negativeCounts.get("topic:t"), 1);
  });

  it("content similar to a rejected post is pushed down", () => {
    const rejected = item({ authorId: "r1", body: "Why this crypto token will moon next week guaranteed" });
    const similar = item({ authorId: "r2", body: "This crypto token will moon next week, guaranteed", createdAt: NOW - 2 * H });
    const other = item({ authorId: "r3", body: "Notes on testing retrieval systems", createdAt: NOW - 2 * H });
    const profile = buildInterestProfile("me", [{ action: "not_interested", at: NOW - H, postId: rejected.id, authorId: "r1" }], NOW);
    const ids = forYou({ candidates: [rejected, similar, other].map((i) => cand(i)), profile }).items.map((x) => x.item.id);
    assert.ok(!ids.includes(rejected.id));
    assert.ok(ids.indexOf(other.id) < ids.indexOf(similar.id));
  });
});

describe("Cross surface learning", () => {
  const post = (topicId: string, extra: Partial<ReturnType<typeof item>> = {}) => item({ topicId, ...extra });

  it("Search to Feed: searched words make matching posts more relevant", () => {
    const p = buildInterestProfile("me", [{ action: "search", at: NOW - H, term: "llm coding agents" }], NOW);
    assert.ok(interestIn(p, post("x", { body: "Coding agents with an llm" })).terms > 0);
  });

  it("Explore to Feed: a tool opened in Explore makes posts about it relevant", () => {
    const p = buildInterestProfile("me", [{ action: "explore", at: NOW - H, toolId: "cursor" }, { action: "explore", at: NOW - 2 * H, toolId: "cursor" }], NOW);
    assert.ok(interestIn(p, post("x", { toolId: "cursor" })).entity > 0);
  });

  it("Compare to Feed: compared models make posts about them relevant", () => {
    const p = buildInterestProfile("me", [{ action: "compare", at: NOW - H, modelId: "m1" }], NOW);
    assert.ok(interestIn(p, post("x", { modelId: "m1" })).entity > 0);
  });

  it("Reels to Feed: a 95% watch of an AI video lifts AI posts in the feed", () => {
    /* Two finished AI videos: one alone is under the cold start threshold
       (interests.ts isColdStart), where nothing is personalised. Under v2 this
       test passed with one video only through the exploration tie break. */
    const p = buildInterestProfile("me", [
      { action: "watch", at: NOW - H, postId: "v", topicId: "ai", value: 95 },
      { action: "complete", at: NOW - H, postId: "v", topicId: "ai" },
      { action: "watch", at: NOW - 2 * H, postId: "v2", topicId: "ai", value: 95 },
      { action: "complete", at: NOW - 2 * H, postId: "v2", topicId: "ai" },
    ], NOW);
    const ai = post("ai", { authorId: "u1", createdAt: NOW - 5 * H });
    const other = post("food", { authorId: "u2", createdAt: NOW - 5 * H });
    assert.equal(forYou({ candidates: [other, ai].map((i) => cand(i)), profile: p }).items[0].item.id, ai.id);
  });

  it("Feed to Reels: saving research posts makes research videos rank first", () => {
    const p = buildInterestProfile("me", acts("save", 3, { topicId: "research" }), NOW);
    const researchVid = item({ media: "video", topicId: "research", authorId: "v1", createdAt: NOW - 50 * H });
    const otherVid = item({ media: "video", topicId: "gaming", authorId: "v2", createdAt: NOW - 50 * H });
    const res = reelsFeed({ context: ctx({ surface: "reels", algorithm: "reels_v2" }), candidates: [otherVid, researchVid].map((i) => cand(i, "video")), profile: p, signals: new Map(), assignment: control, viewerKey: "me" });
    assert.equal(res.items[0].item.id, researchVid.id);
  });
});

describe("Diversity by content type", () => {
  it("limits runs of one kind (questions, launches)", () => {
    const qs = Array.from({ length: 5 }, () => r(item({ kind: "question" })));
    const out = applyKindDiversity([...qs, r(item({ kind: "launch" }))]);
    assert.equal(out[3].item.kind, "launch");
  });

  it("lets a preferred format run one longer", () => {
    const vids = Array.from({ length: 5 }, (_, i) => r(item({ media: "video", authorId: `v${i}`, topicId: `t${i}` })));
    const img = r(item({ media: "image", authorId: "i", topicId: "ti" }));
    const plain = applyDiversity([...vids, img]).map((x) => x.item.media);
    const pref = applyDiversity([...vids, img], { preferredMedia: "video" }).map((x) => x.item.media);
    assert.equal(plain.indexOf("image"), 3);
    assert.equal(pref.indexOf("image"), 4);
  });
});

describe("Viral lifecycle", () => {
  const a = (over: Partial<ViralAssessment>): ViralAssessment => ({ velocity: { recent: 0, previous: 0 }, acceleration: 0, ratio: 0, score: 0, breakout: false, reference: 1, recentEngagers: 0, ...over });

  it("moves through normal, rising, breakout, viral, saturated and decayed", () => {
    assert.equal(viralState(a({})), "normal");
    assert.equal(viralState(a({ acceleration: 0.5, ratio: 1.5, velocity: { recent: 1.5, previous: 0.2 } })), "rising");
    assert.equal(viralState(a({ breakout: true, ratio: VIRAL.BREAKOUT_RATIO, recentEngagers: 3 })), "breakout");
    assert.equal(viralState(a({ breakout: true, ratio: VIRAL.BREAKOUT_RATIO * LIFECYCLE.VIRAL_RATIO_FACTOR, recentEngagers: VIRAL.MIN_RECENT_ENGAGERS * 2 })), "viral");
    assert.equal(viralState(a({ velocity: { recent: 1.2, previous: 5 }, ratio: 1.2, acceleration: -0.8 })), "saturated");
    assert.equal(viralState(a({ velocity: { recent: 0.1, previous: 5 }, ratio: 0.1, acceleration: -1 })), "decayed");
  });
});

describe("ML readiness and failure", () => {
  it("predictEngagement uses the heuristic, and the ML slot is honestly empty", () => {
    assert.equal(mlPredictEngagement, null);
    const f = forYou({ candidates: [cand(item())] }).items[0];
    assert.ok(f);
    assert.equal(typeof predictEngagement, "function");
  });

  it("a failing embedding provider falls back to lexical similarity", () => {
    const broken = { id: "embed_test", similarity: () => { throw new Error("vector service down"); } };
    const safe = withFallback(broken);
    assert.equal(safe.similarity("vector databases", "vector databases"), lexicalProvider.similarity("vector databases", "vector databases"));
  });

  it("cold start is still a cold start with the new signals", () => {
    assert.equal(isColdStart(buildInterestProfile("me", acts("seen", 20), NOW)), true, "impressions alone are not evidence");
  });
});

describe("Evaluation", () => {
  it("adjusts opens for position: the same opens lower down count for more", async () => {
    const { positionAdjustedOpenRate, gini, evaluate } = await import("../evaluation");
    const top = positionAdjustedOpenRate([{ position: 0, impressions: 100, opens: 12 }]);
    const low = positionAdjustedOpenRate([{ position: 9, impressions: 100, opens: 12 }]);
    assert.ok(Math.abs(top - 1) < 1e-9, "exactly what slot 1 earns anyway");
    assert.ok(low > 3 * top);
    assert.equal(gini([5, 5, 5, 5]), 0);
    assert.ok(gini([0, 0, 0, 20]) > 0.7);
    const e = evaluate({ positions: [], meaningfulActions: 5, impressions: 100, impressionsByCreator: [10, 90], impressionsToSmallCreators: 20, impressionsOfFreshPosts: 40, distinctTopics: 4, notInterested: 2, reports: 1, unsafeImpressions: 0, users: 10, returningUsers: 4 });
    assert.equal(e.creators.smallCreatorShare, 0.2);
    assert.equal(e.longTerm.returnRate, 0.4);
  });

  it("the registry gathers every table without an import cycle", async () => {
    const { REGISTRY } = await import("../registry");
    assert.ok(REGISTRY.algorithms.feed_v2);
    assert.ok(REGISTRY.seen.FALLBACK_HOURS.consumed > REGISTRY.seen.FALLBACK_HOURS.brief);
    assert.equal(typeof REGISTRY.signals.save.weight, "number");
  });
});
