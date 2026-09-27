import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FEED_ALGORITHM, rankForYou } from "../feed";
import { LIFECYCLE_CONFIG, WAVES, configDrift, isFresh, stateToDistribution, type Stage, type StoredPostState } from "../lifecycle";
import { REELS_ALGORITHM } from "../reels";
import { risingContent, trendingPosts } from "../trending";
import { clampDurationMs, detectLanguage, hamming, nearestDuplicate, simhash64, tokenCount } from "../upload";
import { H, NOW, cand, control, ctx, item, profileFrom, signals } from "./fixtures";

/*
  Post Intelligence (4BG, 2026-09-25). The lifecycle state machine itself is
  SQL (post_next_stage) and is tested with made up numbers against the
  database; these are the TypeScript halves: upload processing, how a stored
  state becomes reach, the stale fallback, and trending and rising v2.
*/

const state = (postId: string, stage: Stage, over: Partial<StoredPostState> = {}): StoredPostState => ({
  postId,
  stage,
  wave: 0,
  newAuthor: false,
  perfScore: 1,
  velocity: 0,
  referenceHourly: 0.3,
  stageSince: NOW - H,
  computedAt: NOW - 60_000,
  stale: false,
  ...over,
});

describe("upload_v1: language", () => {
  it("names common languages and refuses to guess", () => {
    assert.equal(detectLanguage("This is the best tool for agents and it is what you need"), "en");
    assert.equal(detectLanguage("Esta es la mejor herramienta para los agentes y es muy buena"), "es");
    assert.equal(detectLanguage("Das ist nicht das beste Werkzeug, aber es ist sehr gut und auch schnell"), "de");
    assert.equal(detectLanguage("これはとても良いツールです"), "ja");
    assert.equal(detectLanguage("Это очень хороший инструмент"), "ru");
    assert.equal(detectLanguage("🔥🔥🔥"), "und");
    assert.equal(detectLanguage("hello"), "und");
    assert.equal(detectLanguage(""), "und");
  });
});

describe("upload_v1: near duplicates by simhash", () => {
  const base =
    "Claude Opus shipped a faster coding agent today with better tool use, longer context windows, cheaper tokens, and a new benchmark lead on software engineering tasks";

  it("the same text hashes the same, and fits a signed bigint", () => {
    const a = simhash64(base);
    assert.ok(a !== null);
    assert.equal(a, simhash64(base));
    assert.ok(a >= -(BigInt(2) ** BigInt(63)) && a < BigInt(2) ** BigInt(63));
  });

  it("a lightly edited copy is closer than an unrelated post", () => {
    const a = simhash64(base)!;
    const edited = simhash64(base.replace("today", "this morning"))!;
    const other = simhash64(
      "Our team moved the whole design system to a new token format and wrote down every migration step for the frontend group",
    )!;
    assert.ok(hamming(a, edited) < hamming(a, other), `${hamming(a, edited)} vs ${hamming(a, other)}`);
    assert.ok(hamming(a, other) > 3);
  });

  it("short posts are never near duplicates", () => {
    assert.equal(simhash64("wow"), null);
    assert.equal(simhash64("great video"), null);
    assert.equal(nearestDuplicate(null, [{ postId: "x", authorId: "a", simhash: BigInt(1) }]), null);
  });

  it("nearestDuplicate returns the closest candidate within the distance", () => {
    const a = simhash64(base)!;
    const hit = nearestDuplicate(a, [
      { postId: "far", authorId: "b", simhash: ~a },
      { postId: "same", authorId: "c", simhash: a },
    ]);
    assert.equal(hit?.postId, "same");
    assert.equal(hit?.score, 1);
    assert.equal(nearestDuplicate(a, [{ postId: "far", authorId: "b", simhash: ~a }]), null);
  });

  it("counts meaningful words and clamps a reported duration", () => {
    assert.equal(tokenCount("the and of"), 0);
    assert.ok(tokenCount(base) > 10);
    assert.equal(clampDurationMs("12345.6"), 12346);
    assert.equal(clampDurationMs(-5), null);
    assert.equal(clampDurationMs("nope"), null);
    assert.equal(clampDurationMs(1e12), 86_400_000);
  });
});

describe("distribution_v2: a stored state becomes reach", () => {
  it("a stale or missing state falls back (null), a fresh one does not", () => {
    assert.equal(stateToDistribution(undefined, 0, NOW), null);
    assert.equal(stateToDistribution(state("a", "testing", { stale: true }), 0, NOW), null);
    assert.equal(stateToDistribution(state("a", "testing", { computedAt: NOW - 30 * 60_000 }), 0, NOW), null);
    assert.ok(stateToDistribution(state("a", "testing"), 0, NOW));
    assert.equal(isFresh(state("a", "viral"), NOW), true);
  });

  it("waves widen the slice; a new author starts at wave 1's slice", () => {
    assert.equal(stateToDistribution(state("a", "testing"), 0, NOW)?.fraction, WAVES[0].fraction);
    assert.equal(stateToDistribution(state("a", "testing", { newAuthor: true }), 0, NOW)?.fraction, WAVES[1].fraction);
    assert.equal(stateToDistribution(state("a", "promising", { wave: 1 }), 0, NOW)?.fraction, WAVES[1].fraction);
    assert.equal(stateToDistribution(state("a", "viral", { wave: 4 }), 0, NOW)?.stage, "broad");
  });

  it("held and suppressed are demoted to the reduce slice, never removed", () => {
    for (const s of ["held", "suppressed"] as Stage[]) {
      const d = stateToDistribution(state("a", s), 0, NOW);
      assert.equal(d?.stage, "reduce");
      assert.ok((d?.fraction ?? 0) > 0);
    }
  });

  it("within a wave, a post doing better than its usual is lifted more", () => {
    const usual = stateToDistribution(state("a", "promising", { wave: 1, perfScore: 1 }), 0, NOW)!;
    const strong = stateToDistribution(state("a", "promising", { wave: 1, perfScore: 2 }), 0, NOW)!;
    assert.ok(strong.boost > usual.boost);
    /* ...but not beyond the next wave's lift at its own usual. */
    const next = stateToDistribution(state("a", "accelerating", { wave: 2, perfScore: 1 }), 0, NOW)!;
    assert.ok(strong.boost <= next.boost * 1.2);
  });
});

describe("feed_v4 and reels_v3 read the stored state", () => {
  it("names the new versions", () => {
    assert.equal(FEED_ALGORITHM.forYou, "feed_v4");
    assert.equal(REELS_ALGORITHM, "reels_v3");
  });

  const viewer = profileFrom("viewer", [{ action: "like", at: NOW - 5 * H, postId: "seed", topicId: "topic-agents", authorId: "someone" }]);
  const run = (states: Map<string, StoredPostState>, a: ReturnType<typeof item>, b: ReturnType<typeof item>) =>
    rankForYou({
      context: ctx({ algorithm: "feed_v4", userId: "viewer" }),
      candidates: [cand(a), cand(b)],
      profile: viewer,
      signals: new Map(),
      assignment: control,
      pages: 1,
      viewerKey: "viewer",
      postStates: states,
    }).items.map((r) => r.item.id);

  it("a viral post outranks an otherwise equal suppressed one", () => {
    const a = item({ authorId: "author-1", createdAt: NOW - 3 * H });
    const b = item({ authorId: "author-2", createdAt: NOW - 3 * H });
    const order = run(new Map([[a.id, state(a.id, "suppressed")], [b.id, state(b.id, "viral", { wave: 4, perfScore: 2 })]]), a, b);
    assert.deepEqual(order, [b.id, a.id]);
    const flipped = run(new Map([[a.id, state(a.id, "viral", { wave: 4, perfScore: 2 })], [b.id, state(b.id, "suppressed")]]), a, b);
    assert.deepEqual(flipped, [a.id, b.id]);
  });

  it("stale states change nothing: the feed ranks as it would without them", () => {
    const a = item({ authorId: "author-1", createdAt: NOW - 3 * H });
    const b = item({ authorId: "author-2", createdAt: NOW - 4 * H });
    const none = run(new Map(), a, b);
    const stale = run(new Map([[a.id, state(a.id, "suppressed", { stale: true })], [b.id, state(b.id, "viral", { stale: true })]]), a, b);
    assert.deepEqual(stale, none);
  });

  it("nothing is removed: a suppressed post still appears", () => {
    const a = item({ authorId: "author-1" });
    const b = item({ authorId: "author-2" });
    const order = run(new Map([[a.id, state(a.id, "suppressed")], [b.id, state(b.id, "held")]]), a, b);
    assert.equal(order.length, 2);
  });
});

describe("trending_v2 and rising_v2", () => {
  const busy = () =>
    signals({ like: [3, 2, 1], comment: [1, 1], impression: [8, 6, 4] });

  it("a held or suppressed post never trends", () => {
    const a = item({ authorId: "author-1" });
    const b = item({ authorId: "author-2" });
    const sig = new Map([[a.id, busy()], [b.id, busy()]]);
    const plain = trendingPosts({ items: [a, b], signals: sig, now: NOW }).map((x) => x.item.id);
    assert.equal(plain.length, 2);
    const v2 = trendingPosts({ items: [a, b], signals: sig, now: NOW, states: new Map([[a.id, state(a.id, "held")]]) }).map((x) => x.item.id);
    assert.deepEqual(v2, [b.id]);
  });

  it("a stored viral post outranks an equal one the tick has seen cool", () => {
    const a = item({ authorId: "author-1" });
    const b = item({ authorId: "author-2" });
    const sig = new Map([[a.id, busy()], [b.id, busy()]]);
    const states = new Map([[a.id, state(a.id, "cooling")], [b.id, state(b.id, "viral", { wave: 4 })]]);
    assert.deepEqual(trendingPosts({ items: [a, b], signals: sig, now: NOW, states }).map((x) => x.item.id), [b.id, a.id]);
  });

  it("rising leaves out what has already peaked", () => {
    const young = (id: string) => item({ id, authorId: id, createdAt: NOW - 5 * H });
    const a = young("rise-a");
    const b = young("rise-b");
    const speeding = () => signals({ like: [3, 0, 0], comment: [1], impression: [4, 1] });
    const sig = new Map([[a.id, speeding()], [b.id, speeding()]]);
    const plain = risingContent({ items: [a, b], signals: sig, now: NOW }).map((x) => x.item.id);
    assert.equal(plain.length, 2);
    const v2 = risingContent({ items: [a, b], signals: sig, now: NOW, states: new Map([[a.id, state(a.id, "peak")]]) }).map((x) => x.item.id);
    assert.deepEqual(v2, [b.id]);
  });
});

describe("the two copies of the lifecycle config", () => {
  it("reports no drift when they match and names the key when they do not", () => {
    const db = JSON.parse(JSON.stringify(LIFECYCLE_CONFIG));
    assert.deepEqual(configDrift(db), []);
    db.test_viewers = 99;
    assert.deepEqual(configDrift(db), ["test_viewers"]);
    assert.deepEqual(configDrift(null), ["(no database config)"]);
  });

  it("ignores key order inside nested objects, as jsonb reorders them", () => {
    const db = JSON.parse(JSON.stringify(LIFECYCLE_CONFIG));
    db.units = { share: 3, save: 2.5, like: 1, repost: 3, comment: 2, complete: 1, follow_after: 4 };
    assert.deepEqual(configDrift(db), []);
  });
});
