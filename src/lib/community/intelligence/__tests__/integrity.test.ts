import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAuthorDiversity,
  applyContentDiversity,
  applyFrequencyControls,
  applyMediaDiversity,
  applyTopicDiversity,
} from "../diversity";
import { assignVariant, computeGuardrails, guardrailsHold, type Experiment } from "../experiments";
import { explainReason } from "../explain";
import { buildInterestProfile, getSessionInterestProfile, interestIn, isColdStart, updateUserInterestProfile } from "../interests";
import { contentExists, contentIsRecommendationEligible, spamRisk } from "../safety";
import { parseSignalRows } from "../signals";
import { rankPeople, getRecommendedTopics, recommendSimilarPosts, rankDiscussions } from "../recommendations";
import type { RankedItem } from "../types";
import { H, NOW, item, profileFrom, signals } from "./fixtures";

const r = (i: ReturnType<typeof item>): RankedItem => ({ item: i, score: 1, reasons: [], sources: ["fresh"] });

describe("Safety and eligibility", () => {
  const p = item({ authorId: "a" });

  it("separates existing from recommendable", () => {
    assert.equal(contentExists(p), true);
    assert.equal(contentExists(null), false, "a deleted post never reaches ranking");
    const held = contentIsRecommendationEligible(p, signals({ report: [1, 1, 0, 0, 0, 0] }), null);
    assert.equal(held.eligible, false);
    assert.equal(held.reason, "pending_reports");
  });

  it("holds reported content out of For You but not out of Following", () => {
    const s = signals({ report: [1, 1, 0, 0, 0, 0] });
    assert.equal(contentIsRecommendationEligible(p, s, null, { followingSurface: true }).eligible, true);
    const q = signals({}, { qualifiedReports: 1 });
    assert.equal(contentIsRecommendationEligible(p, q, null, { followingSurface: true }).eligible, false, "a moderator's decision holds everywhere");
  });

  it("excludes suspended authors and muted creators and topics", () => {
    assert.equal(contentIsRecommendationEligible(p, signals({}, { authorInactive: true }), null).reason, "author_inactive");
    const profile = profileFrom("viewer", [
      { action: "mute_author", at: NOW, authorId: "a" },
      { action: "mute_topic", at: NOW, topicId: "topic-agents" },
    ]);
    assert.equal(contentIsRecommendationEligible(p, signals({}), profile).reason, "muted_author");
    const other = item({ authorId: "b" });
    assert.equal(contentIsRecommendationEligible(other, signals({}), profile).reason, "muted_topic");
  });

  it("scores obvious spam as risky and blocks it", () => {
    const spam = item({ body: "BUY NOW http://x.co http://y.co http://z.co #a #b #c #d #e #f #g #h #i #j", linkUrl: "http://x.co" });
    assert.ok(spamRisk(spam) >= 0.85);
    assert.equal(contentIsRecommendationEligible(spam, signals({}), null, { spam: spamRisk(spam) }).reason, "spam");
    const repeat = item({ authorId: "r", body: "Same exact promotional text posted again and again today" });
    const again = item({ authorId: "r", body: "Same exact promotional text posted again and again today" });
    assert.ok(spamRisk(again, [repeat, again]) >= 0.35);
  });
});

describe("Diversity and frequency", () => {
  it("limits a repeated creator", () => {
    const list = [...Array.from({ length: 5 }, () => r(item({ authorId: "x" }))), r(item({ authorId: "y" }))];
    const out = applyAuthorDiversity(list).map((t) => t.item.authorId);
    assert.deepEqual(out.slice(0, 4), ["x", "x", "y", "x"]);
    assert.equal(out.length, 6, "nothing dropped");
  });

  it("limits a repeated topic and a repeated media type", () => {
    const topics = [...Array.from({ length: 5 }, () => r(item({ topicId: "t" }))), r(item({ topicId: "u" }))];
    assert.equal(applyTopicDiversity(topics)[3].item.topicId, "u");
    const media = [...Array.from({ length: 5 }, () => r(item({ media: "video" }))), r(item({ media: "image" }))];
    assert.equal(applyMediaDiversity(media)[3].item.media, "image");
  });

  it("removes a duplicate post", () => {
    const a = item({ body: "A long enough post about evaluating agents in production today" });
    const b = item({ body: "A long enough post about evaluating agents in production today." });
    assert.equal(applyContentDiversity([r(a), r(b)]).length, 1);
    const short1 = item({ body: "wow" });
    const short2 = item({ body: "wow" });
    assert.equal(applyContentDiversity([r(short1), r(short2)]).length, 2, "short captions are not duplicates");
  });

  it("caps one creator's share of a page and moves heavily seen posts to the end", () => {
    const list = [...Array.from({ length: 10 }, () => r(item({ authorId: "x" }))), ...Array.from({ length: 10 }, (_, i) => r(item({ authorId: `o${i}` })))];
    const out = applyFrequencyControls(list, null, 10, NOW);
    assert.ok(out.slice(0, 10).filter((t) => t.item.authorId === "x").length <= 3);
    const seenItem = item();
    const profile = profileFrom("v", [1, 2, 3].map((k) => ({ action: "seen" as const, at: NOW - k * H, postId: seenItem.id })));
    const out2 = applyFrequencyControls([r(seenItem), r(item()), r(item())], profile, 10, NOW);
    assert.equal(out2[out2.length - 1].item.id, seenItem.id);
  });
});

describe("Interest model", () => {
  it("builds long term, short term and negative interest from actions", () => {
    const p = buildInterestProfile(
      "me",
      [
        { action: "save", at: NOW - 2 * H, postId: "p1", topicId: "code", authorId: "ann" },
        { action: "like", at: NOW - 20 * 24 * H, postId: "p2", topicId: "news", authorId: "bob" },
        { action: "not_interested", at: NOW - H, postId: "p3", topicId: "crypto", authorId: "zed" },
        { action: "search", at: NOW - H, term: "vector databases" },
      ],
      NOW,
    );
    assert.ok((p.shortTerm.get("topic:code") ?? 0) > 0, "recent save is short term");
    assert.equal(p.shortTerm.get("topic:news"), undefined, "a like from three weeks ago is not short term");
    assert.ok((p.longTerm.get("topic:news") ?? 0) > 0);
    assert.ok((p.negative.get("topic:crypto") ?? 0) > 0);
    assert.ok((p.longTerm.get("term:vector") ?? 0) > 0, "searches become term interests");
    assert.ok(p.notInterested.has("p3"));
  });

  it("ignores engagement with your own posts", () => {
    const p = buildInterestProfile("me", [{ action: "like", at: NOW, postId: "x", authorId: "me", topicId: "t" }], NOW);
    assert.equal(p.longTerm.get("author:me"), undefined);
  });

  it("updates one signal at a time without mutating the old profile", () => {
    const p = buildInterestProfile("me", [], NOW);
    const q = updateUserInterestProfile(p, { action: "save", at: NOW, topicId: "t", postId: "x" });
    assert.equal(p.longTerm.size, 0);
    assert.ok(q.longTerm.size > 0);
  });

  it("uses Compare and Ask Celpare as interest, without recommending tools", () => {
    const p = buildInterestProfile(
      "me",
      [
        { action: "compare", at: NOW - H, toolId: "tool-1" },
        { action: "ask", at: NOW - H, term: "best model for coding agents" },
      ],
      NOW,
    );
    const post = item({ toolId: "tool-1", body: "My coding agents setup" });
    assert.ok(interestIn(p, post).entity > 0, "a post about a compared tool matches");
    assert.ok(interestIn(p, post).terms > 0, "Ask terms match post words");
  });

  it("builds a session profile that remembers what was consumed", () => {
    const a = item({ topicId: "t1" });
    const s = getSessionInterestProfile([{ item: a, at: NOW - 60_000, percentWatched: 90 }], NOW);
    assert.ok(s.consumed.has(a.id));
    assert.ok((s.interests.get("topic:t1") ?? 0) > 0);
  });

  it("flags cold start", () => {
    assert.equal(isColdStart(null), true);
    assert.equal(isColdStart(buildInterestProfile("me", [], NOW)), true);
  });
});

describe("Recommendations", () => {
  it("recommends people from relationships, never from follower count", () => {
    const profile = profileFrom("me", [{ action: "follow", at: NOW, authorId: "already" }]);
    const recs = rankPeople(
      "me",
      [
        { id: "me", mutualFollows: 9, followsViewer: true, topics: new Map(), interaction: 1, quality: 1 },
        { id: "already", mutualFollows: 9, followsViewer: true, topics: new Map(), interaction: 1, quality: 1 },
        { id: "fan", mutualFollows: 0, followsViewer: true, topics: new Map(), interaction: 0, quality: 0.5 },
        { id: "stranger", mutualFollows: 0, followsViewer: false, topics: new Map(), interaction: 0, quality: 1 },
      ],
      profile,
    );
    assert.deepEqual(recs.map((x) => x.id), ["fan"]);
    assert.ok(recs[0].reasons.includes("follows_you"));
  });

  it("recommends topics from reading and searching, and never a muted one", () => {
    const profile = profileFrom("me", [
      { action: "like", at: NOW, topicId: "t-code", postId: "p" },
      { action: "search", at: NOW, term: "audio transcription" },
      { action: "mute_topic", at: NOW, topicId: "t-news" },
    ]);
    const topics = [
      { id: "t-code", slug: "code", name: "Code", description: null },
      { id: "t-audio", slug: "audio", name: "Audio", description: "Speech, music and transcription" },
      { id: "t-news", slug: "news", name: "News", description: null },
    ];
    const recs = getRecommendedTopics(profile, topics).map((x) => x.topic.id);
    assert.ok(recs.includes("t-code"));
    assert.ok(recs.includes("t-audio"));
    assert.ok(!recs.includes("t-news"));
  });

  it("recommends similar posts to a seed", () => {
    const seed = item({ body: "Fine tuning small language models on a single GPU" });
    const close = item({ authorId: "b", body: "Tips for fine tuning language models cheaply on one GPU" });
    const far = item({ authorId: "c", topicId: "other", body: "Photography with my new camera lens" });
    const recs = recommendSimilarPosts([seed], { items: [seed, close, far], signals: new Map(), profile: null, now: NOW });
    assert.equal(recs[0].item.id, close.id);
    assert.ok(!recs.some((x) => x.item.id === seed.id));
  });

  it("ranks discussions and skips posts with no conversation", () => {
    const talk = item({ authorId: "a" });
    const silent = item({ authorId: "b" });
    const recs = rankDiscussions({
      items: [talk, silent],
      signals: new Map([[talk.id, signals({ comment: [1, 2, 0, 0, 0, 0] }, { events: { comment: [2, 4, 0, 0, 0, 0] } })]]),
      profile: null,
      now: NOW,
    });
    assert.deepEqual(recs.map((x) => x.item.id), [talk.id]);
  });
});

describe("Experiments and explanations", () => {
  it("is control for everybody while no experiment runs", () => {
    assert.equal(assignVariant("anyone", "feed_v1").variant, "control");
  });

  it("assigns deterministically and roughly by weight", () => {
    const exp: Experiment = {
      id: "feed_v1_fresh",
      algorithm: "feed_v1",
      controlWeight: 1,
      variants: [{ id: "variant_a", weight: 1, override: { freshness: 1.2 } }],
      active: true,
    };
    assert.equal(assignVariant("u1", "feed_v1", [exp]).variant, assignVariant("u1", "feed_v1", [exp]).variant);
    let a = 0;
    for (let i = 0; i < 2000; i++) if (assignVariant(`u${i}`, "feed_v1", [exp]).variant === "variant_a") a++;
    assert.ok(a > 850 && a < 1150);
  });

  it("fails a variant whose guardrails get worse", () => {
    const base = { impressions: 1000, notInterested: 10, reports: 1, spamImpressions: 0, sessions: 100, abandonedSessions: 20, topCreatorImpressions: 100, distinctCreators: 50, distinctTopics: 10, returningUsers: 40, users: 100 };
    const control = computeGuardrails(base);
    assert.equal(guardrailsHold(control, computeGuardrails(base)), true);
    assert.equal(guardrailsHold(control, computeGuardrails({ ...base, notInterested: 30 })), false);
  });

  it("explains without numbers", () => {
    assert.equal(explainReason("follows_author", "Ada"), "Because you follow Ada");
    assert.ok(!/\d/.test(explainReason("trending_in_interests")));
  });
});

describe("Signal parsing", () => {
  it("parses feed_post_signals rows", () => {
    const m = parseSignalRows([
      { post_id: "p", signal: "like", bucket: 0, n: 2, uniq: 2, value: null },
      { post_id: "p", signal: "like", bucket: 9, n: 5, uniq: 4, value: null },
      { post_id: "p", signal: "watch", bucket: 9, n: 3, uniq: 3, value: 71.5 },
      { post_id: "p", signal: "qualified_reports", bucket: 9, n: 1, uniq: 1, value: null },
      { post_id: "p", signal: "unknown_future_signal", bucket: 9, n: 1, uniq: 1, value: null },
    ]);
    const s = m.get("p")!;
    assert.equal(s.byType.like!.n[0], 2);
    assert.equal(s.byType.like!.totalUniq, 4);
    assert.equal(s.byType.watch!.avg, 71.5);
    assert.equal(s.qualifiedReports, 1);
  });
});
