import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankFollowing, rankForYou, FEED, FEED_ALGORITHM } from "../feed";
import { rankWithFallback } from "../fallback";
import { runPipeline } from "../pipeline";
import { OBJECTIVES } from "../scoring";
import type { InterestSignal } from "../types";
import { H, NOW, cand, control, ctx, item, profileFrom, signals } from "./fixtures";

const base = (over: Partial<Parameters<typeof rankForYou>[0]> = {}) => ({
  context: ctx(),
  candidates: [],
  profile: null,
  signals: new Map(),
  assignment: control,
  pages: 1,
  viewerKey: "viewer",
  ...over,
});

function likes(topicId: string, n: number, authorId = "someone"): InterestSignal[] {
  return Array.from({ length: n }, (_, i) => ({
    action: "like" as const,
    at: NOW - (i + 1) * H,
    postId: `seed-${topicId}-${i}`,
    topicId,
    authorId,
  }));
}

describe("For You (feed_v2)", () => {
  it("serves a new user with no history, with exploration mixed in", () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      item({ authorId: `a${i % 6}`, createdAt: NOW - (i + 1) * H }),
    );
    const res = rankForYou(base({ candidates: items.map((i) => cand(i)) }));
    assert.equal(res.algorithm, FEED_ALGORITHM.forYou);
    assert.ok(res.items.length > 0, "a new user gets a feed");
    assert.equal(res.fallback, null);
    const ids = new Set(res.items.map((r) => r.item.id));
    assert.equal(ids.size, res.items.length, "no post twice");
  });

  it("lets relevance beat raw engagement for an experienced user", () => {
    const profile = profileFrom("viewer", likes("topic-code", 8));
    const relevant = item({ topicId: "topic-code", authorId: "small", createdAt: NOW - 3 * H });
    const popular = item({ topicId: "topic-news", authorId: "big", createdAt: NOW - 3 * H });
    const sig = new Map([
      [relevant.id, signals({ like: [0, 1, 0, 0, 0, 0] })],
      [popular.id, signals({ like: [0, 4, 6, 0, 0, 0], comment: [0, 2, 1, 0, 0, 0] })],
    ]);
    const res = rankForYou(base({ candidates: [cand(relevant), cand(popular)], profile, signals: sig }));
    assert.equal(res.items[0].item.id, relevant.id, "the matching post ranks first");
    assert.ok(res.items[0].reasons.includes("topic_interest"));
  });

  it("demotes what a person pushed away, and hides a muted author entirely", () => {
    const disliked = item({ authorId: "meh", topicId: "topic-x", createdAt: NOW - 1 * H });
    const other = item({ authorId: "fine", topicId: "topic-y", createdAt: NOW - 1 * H });
    const muted = item({ authorId: "muted", topicId: "topic-y", createdAt: NOW - 1 * H });
    const profile = profileFrom("viewer", [
      ...likes("topic-y", 3, "fine"),
      { action: "not_interested", at: NOW - H, postId: "old-1", authorId: "meh", topicId: "topic-x" },
      { action: "not_interested", at: NOW - H, postId: "old-2", authorId: "meh", topicId: "topic-x" },
      { action: "mute_author", at: NOW - H, authorId: "muted" },
    ]);
    const res = rankForYou(base({ candidates: [disliked, other, muted].map((i) => cand(i)), profile }));
    const order = res.items.map((r) => r.item.id);
    assert.ok(!order.includes(muted.id), "muted author never appears");
    assert.ok(order.indexOf(other.id) < order.indexOf(disliked.id), "negative interest ranks lower");
  });

  it("paginates by accumulating pages, stable across calls", () => {
    const items = Array.from({ length: 45 }, (_, i) =>
      item({ authorId: `a${i % 9}`, topicId: `t${i % 5}`, createdAt: NOW - (i + 1) * H }),
    );
    const profile = profileFrom("viewer", likes("t1", 4));
    const one = rankForYou(base({ candidates: items.map((i) => cand(i)), profile, pages: 1 }));
    const two = rankForYou(base({ candidates: items.map((i) => cand(i)), profile, pages: 2 }));
    assert.equal(one.items.length, FEED.PAGE_SIZE);
    assert.equal(one.complete, false);
    assert.equal(two.items.length, FEED.PAGE_SIZE * 2);
    assert.deepEqual(
      two.items.slice(0, FEED.PAGE_SIZE).map((r) => r.item.id),
      one.items.map((r) => r.item.id),
      "page 2 starts with page 1 unchanged",
    );
    const three = rankForYou(base({ candidates: items.map((i) => cand(i)), profile, pages: 3 }));
    assert.equal(three.complete, true);
  });

  it("suppresses a near duplicate of a post already in the feed", () => {
    const text = "Here is my full write up on evaluating retrieval agents with real tests";
    const a = item({ authorId: "a1", body: text, createdAt: NOW - 1 * H });
    const b = item({ authorId: "a2", body: `${text}!`, createdAt: NOW - 2 * H });
    const res = rankForYou(base({ candidates: [cand(a), cand(b)] }));
    assert.equal(res.items.length, 1);
  });

  it("never returns a post that was not a candidate (privacy stays with RLS)", () => {
    const items = Array.from({ length: 10 }, (_, i) => item({ authorId: `a${i}` }));
    const res = rankForYou(base({ candidates: items.map((i) => cand(i)) }));
    const allowed = new Set(items.map((i) => i.id));
    for (const r of res.items) assert.ok(allowed.has(r.item.id));
  });
});

describe("Following (following_v2)", () => {
  it("shows only followed authors, newest and unseen first", () => {
    const profile = profileFrom("viewer", [
      { action: "follow", at: NOW - 100 * H, authorId: "f1" },
      { action: "follow", at: NOW - 100 * H, authorId: "f2" },
    ]);
    const newer = item({ authorId: "f1", createdAt: NOW - 1 * H });
    const older = item({ authorId: "f2", createdAt: NOW - 30 * H });
    const stranger = item({ authorId: "x", createdAt: NOW - 1 * H });
    const res = rankFollowing(
      base({ context: ctx({ surface: "following", algorithm: "following_v1" }), candidates: [older, newer, stranger].map((i) => cand(i, "following")), profile }),
    );
    assert.equal(res.algorithm, FEED_ALGORITHM.following);
    assert.deepEqual(res.items.map((r) => r.item.id), [newer.id, older.id]);
    assert.ok(res.items[0].reasons.includes("new_from_followed"));
  });

  it("keeps one prolific account from taking over", () => {
    const profile = profileFrom("viewer", [
      { action: "follow", at: NOW - 100 * H, authorId: "loud" },
      { action: "follow", at: NOW - 100 * H, authorId: "quiet" },
    ]);
    const loud = Array.from({ length: 8 }, (_, i) => item({ authorId: "loud", createdAt: NOW - (i + 1) * 0.1 * H }));
    const quiet = [item({ authorId: "quiet", createdAt: NOW - 5 * H }), item({ authorId: "quiet", createdAt: NOW - 6 * H })];
    const res = rankFollowing(
      base({ context: ctx({ surface: "following", algorithm: "following_v1" }), candidates: [...loud, ...quiet].map((i) => cand(i, "following")), profile }),
    );
    const authors = res.items.map((r) => r.item.authorId);
    for (let i = 2; i < authors.length; i++) {
      const run = authors[i] === authors[i - 1] && authors[i] === authors[i - 2];
      if (run) assert.ok(!authors.slice(i).includes("quiet"), "a run of three only once nobody else is left");
    }
    assert.ok(authors.slice(0, 4).includes("quiet"), "the quiet account surfaces early");
  });

  it("puts already seen posts behind unseen ones", () => {
    const seenPost = item({ authorId: "f1", createdAt: NOW - 1 * H });
    const unseen = item({ authorId: "f1", createdAt: NOW - 3 * H });
    const profile = profileFrom("viewer", [
      { action: "follow", at: NOW - 100 * H, authorId: "f1" },
      { action: "seen", at: NOW - 0.5 * H, postId: seenPost.id },
      { action: "seen", at: NOW - 0.4 * H, postId: seenPost.id },
      { action: "seen", at: NOW - 0.3 * H, postId: seenPost.id },
    ]);
    const res = rankFollowing(
      base({ context: ctx({ surface: "following", algorithm: "following_v1" }), candidates: [cand(seenPost), cand(unseen)], profile }),
    );
    assert.equal(res.items[0].item.id, unseen.id);
  });
});

describe("Fallbacks", () => {
  it("serves eligible posts in time order when ranking throws", () => {
    const a = item({ createdAt: NOW - 5 * H, authorId: "a1" });
    const b = item({ createdAt: NOW - 1 * H, authorId: "a2" });
    const reported = item({ createdAt: NOW - 0.5 * H, authorId: "a3" });
    const sig = new Map([[reported.id, signals({}, { qualifiedReports: 1 })]]);
    let logged = 0;
    const res = rankWithFallback(
      () => {
        throw new Error("boom");
      },
      { candidates: [a, b, reported].map((i) => cand(i)), signals: sig, profile: null, pageSize: 20, pages: 1 },
      () => logged++,
    );
    assert.equal(res.algorithm, "fallback_v1");
    assert.equal(res.fallback, "boom");
    assert.deepEqual(res.items.map((r) => r.item.id), [b.id, a.id], "time order, ineligible excluded");
    assert.equal(logged, 1);
  });

  it("ranks without personalisation when the profile could not be loaded", () => {
    const items = Array.from({ length: 5 }, (_, i) => item({ authorId: `a${i}` }));
    const res = rankForYou(base({ candidates: items.map((i) => cand(i)), profile: null }));
    assert.equal(res.items.length, 5);
  });

  it("ranks without engagement signals when analytics could not be read", () => {
    const items = Array.from({ length: 5 }, (_, i) => item({ authorId: `a${i}`, createdAt: NOW - i * H }));
    const res = rankForYou(base({ candidates: items.map((i) => cand(i)), signals: new Map() }));
    assert.equal(res.items.length, 5);
  });

  it("returns an empty, complete page for an empty pool", () => {
    const res = rankForYou(base({ candidates: [] }));
    assert.equal(res.items.length, 0);
    assert.equal(res.complete, true);
  });

  it("keeps the pipeline's output a subset of its input under every objective", () => {
    const items = Array.from({ length: 30 }, (_, i) => item({ authorId: `a${i % 4}`, media: i % 3 ? "text" : "video" }));
    for (const objective of Object.values(OBJECTIVES)) {
      const out = runPipeline({
        context: ctx(),
        candidates: items.map((i) => cand(i)),
        profile: null,
        signals: new Map(),
        objective,
        freshnessProfile: "post",
        pageSize: 10,
      });
      assert.ok(out.length <= items.length);
    }
  });
});
