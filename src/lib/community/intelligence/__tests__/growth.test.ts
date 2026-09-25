import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DISTRIBUTION, distributionStage, inAudience } from "../distribution";
import { calculateViralDecay } from "../freshness";
import { creatorQuality } from "../quality";
import {
  risingContent,
  trendingCreators,
  trendingDiscussions,
  trendingHashtags,
  trendingPosts,
  trendingTopics,
} from "../trending";
import { calculateAcceleration, calculateVelocity, detectBreakoutContent } from "../viral";
import { H, NOW, item, signals } from "./fixtures";

describe("Viral (viral_v1)", () => {
  it("detects a fast growing post", () => {
    const fast = item({ authorId: "c1", createdAt: NOW - 5 * H });
    const pool = [
      { item: fast, signals: signals({ like: [6, 6, 0, 0, 0, 0], share: [2, 1, 0, 0, 0, 0] }) },
      ...Array.from({ length: 4 }, (_, i) => ({
        item: item({ authorId: `o${i}`, createdAt: NOW - 50 * H }),
        signals: signals({ like: [0, 0, 0, 2, 0, 0] }),
      })),
    ];
    const v = detectBreakoutContent(pool, NOW).get(fast.id)!;
    assert.equal(v.breakout, true);
    assert.ok(v.acceleration > 0);
  });

  it("does not call a slow, steady post viral", () => {
    const slow = item({ authorId: "c1", createdAt: NOW - 30 * H });
    const pool = [
      { item: slow, signals: signals({ like: [0, 1, 1, 1, 0, 0] }) },
      { item: item({ authorId: "c2", createdAt: NOW - 30 * H }), signals: signals({ like: [0, 1, 1, 1, 0, 0] }) },
    ];
    assert.equal(detectBreakoutContent(pool, NOW).get(slow.id)!.breakout, false);
  });

  it("does not call high lifetime engagement viral when nothing is happening now", () => {
    const old = item({ authorId: "c1", createdAt: NOW - 400 * H });
    const pool = [{ item: old, signals: signals({ like: [0, 0, 0, 0, 0, 500], comment: [0, 0, 0, 0, 0, 120] }) }];
    const v = detectBreakoutContent(pool, NOW).get(old.id)!;
    assert.equal(v.breakout, false);
    assert.equal(v.score, 0);
  });

  it("lets a new small creator break out, where a big account's usual numbers do not", () => {
    const newbie = item({ authorId: "newbie", createdAt: NOW - 4 * H });
    const bigPost = item({ authorId: "big", createdAt: NOW - 4 * H });
    const bigHistory = Array.from({ length: 5 }, () => ({
      item: item({ authorId: "big", createdAt: NOW - 60 * H }),
      signals: signals({ like: [0, 0, 0, 0, 0, 60] }),
    }));
    const pool = [
      { item: newbie, signals: signals({ like: [4, 3, 0, 0, 0, 0], save: [1, 1, 0, 0, 0, 0] }) },
      { item: bigPost, signals: signals({ like: [4, 3, 0, 0, 0, 0], save: [1, 1, 0, 0, 0, 0] }) },
      ...bigHistory,
    ];
    const res = detectBreakoutContent(pool, NOW);
    assert.equal(res.get(newbie.id)!.breakout, true, "the small creator breaks out");
    assert.equal(res.get(bigPost.id)!.breakout, false, "the same numbers are normal for the big account");
  });

  it("decays: the boost fades once a post is past its first day", () => {
    assert.equal(calculateViralDecay(10), 1);
    assert.ok(calculateViralDecay(60) < 0.3);
    assert.ok(calculateViralDecay(200) < 0.002);
  });

  it("measures velocity and acceleration from the buckets", () => {
    const s = signals({ like: [3, 3, 2, 0, 0, 0] });
    const v = calculateVelocity(s);
    assert.equal(v.recent, 1);
    assert.ok(Math.abs(v.previous - 2 / 18) < 1e-9);
    assert.ok(calculateAcceleration(v) > 0);
  });
});

describe("Trending and Rising (trending_v1, rising_v1)", () => {
  const recent = item({ authorId: "c1", topicId: "t-hot", body: "Shipping an agent today #agents #launch", createdAt: NOW - 3 * H });
  const oldPopular = item({ authorId: "c2", topicId: "t-cold", body: "Old favourite #classic", createdAt: NOW - 300 * H });
  const quiet = item({ authorId: "c3", topicId: "t-hot", body: "Also about #agents", createdAt: NOW - 20 * H });
  const sig = new Map([
    [recent.id, signals({ like: [3, 4, 0, 0, 0, 0], comment: [1, 2, 0, 0, 0, 0], repost: [1, 0, 0, 0, 0, 0] })],
    [oldPopular.id, signals({ like: [0, 0, 0, 0, 0, 900], comment: [0, 0, 0, 0, 0, 200] })],
    [quiet.id, signals({ like: [0, 0, 2, 0, 0, 0] })],
  ]);
  const input = { items: [recent, oldPopular, quiet], signals: sig, now: NOW };

  it("ranks by recent velocity and ignores old lifetime totals", () => {
    const t = trendingPosts(input);
    assert.equal(t[0].item.id, recent.id);
    assert.ok(!t.some((x) => x.item.id === oldPopular.id));
  });

  it("finds the trending topic, hashtag and creator", () => {
    assert.equal(trendingTopics(input)[0].key, "t-hot");
    assert.equal(trendingHashtags(input)[0].key, "agents");
    assert.equal(trendingCreators(input)[0].key, "c1");
  });

  it("finds rising content that is young, accelerating and not saturated", () => {
    const young = item({ authorId: "n1", createdAt: NOW - 8 * H });
    const pool = {
      items: [young, recent],
      signals: new Map([
        [young.id, signals({ like: [1, 2, 0, 0, 0, 0] })],
        [recent.id, sig.get(recent.id)!],
      ]),
      now: NOW,
    };
    const r = risingContent(pool, 10, new Set([recent.id]));
    assert.equal(r[0]?.item.id, young.id);
    assert.ok(!r.some((x) => x.item.id === recent.id), "what already trends is excluded from rising");
  });

  it("ranks discussions by conversation, not comment count", () => {
    const dialogue = item({ authorId: "d1", createdAt: NOW - 5 * H });
    const pile = item({ authorId: "d2", createdAt: NOW - 5 * H });
    const d = trendingDiscussions({
      items: [dialogue, pile],
      signals: new Map([
        [dialogue.id, signals({ comment: [2, 2, 0, 0, 0, 0], like: [0, 1, 0, 0, 0, 0] }, { events: { comment: [5, 5, 0, 0, 0, 0] } })],
        [pile.id, signals({ comment: [0, 1, 0, 0, 0, 0], like: [0, 1, 0, 0, 0, 0] }, { events: { comment: [0, 12, 0, 0, 0, 0] } })],
      ]),
      now: NOW,
    });
    assert.equal(d[0].item.id, dialogue.id);
  });

  it("keeps reported and inactive authors' posts out of trending", () => {
    const bad = item({ authorId: "bad", createdAt: NOW - 2 * H });
    const t = trendingPosts({
      items: [bad],
      signals: new Map([[bad.id, signals({ like: [5, 5, 0, 0, 0, 0] }, { qualifiedReports: 1 })]]),
      now: NOW,
    });
    assert.equal(t.length, 0);
  });
});

describe("New upload distribution (distribution_v1)", () => {
  it("puts a new post in the test stage with a limited audience", () => {
    const p = item({ createdAt: NOW - 1 * H });
    const st = distributionStage(p, signals({ impression: [2, 0, 0, 0, 0, 0] }), NOW);
    assert.equal(st.stage, "test");
    let inside = 0;
    for (let i = 0; i < 2000; i++) if (inAudience(`viewer-${i}`, p.id, st, 0)) inside++;
    const share = inside / 2000;
    assert.ok(Math.abs(share - DISTRIBUTION.FRACTION.test) < 0.05, `about ${DISTRIBUTION.FRACTION.test} of viewers, got ${share}`);
  });

  it("always includes viewers with strong topic or creator interest", () => {
    const p = item();
    const st = distributionStage(p, signals({}), NOW);
    assert.equal(inAudience("anyone", p.id, st, 0.9), true);
  });

  it("puts a new Reel through the same test", () => {
    const r = item({ media: "video", createdAt: NOW - 2 * H });
    assert.equal(distributionStage(r, signals({}), NOW).stage, "test");
  });

  it("treats a new creator neutrally rather than burying them", () => {
    assert.equal(creatorQuality(undefined), 0.5);
    assert.equal(creatorQuality({ postQualities: [], duplicateShare: 0, qualifiedReports: 0 }), 0.5);
  });

  it("expands a post whose first audience responded well", () => {
    const p = item({ createdAt: NOW - 20 * H });
    const st = distributionStage(
      p,
      signals({ impression: [0, 10, 10, 0, 0, 0], like: [0, 4, 4, 0, 0, 0], save: [0, 2, 2, 0, 0, 0], comment: [0, 2, 1, 0, 0, 0], repost: [0, 1, 1, 0, 0, 0] }),
      NOW,
    );
    assert.equal(st.stage, "expand");
    assert.ok(st.fraction > DISTRIBUTION.FRACTION.test);
  });

  it("reduces a post its first audience pushed away", () => {
    const p = item({ createdAt: NOW - 20 * H });
    const st = distributionStage(
      p,
      signals({ impression: [0, 10, 10, 0, 0, 0], not_interested: [0, 3, 2, 0, 0, 0] }),
      NOW,
    );
    assert.equal(st.stage, "reduce");
  });

  it("moves a breakout to broad distribution", () => {
    const p = item({ createdAt: NOW - 3 * H });
    const st = distributionStage(p, signals({}), NOW, { breakout: true, score: 0.8, ratio: 5, acceleration: 0.5, velocity: { recent: 2, previous: 0 } });
    assert.equal(st.stage, "broad");
  });
});
