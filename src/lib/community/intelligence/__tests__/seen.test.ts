import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankForYou } from "../feed";
import { reelsFeed } from "../reels";
import { buildInterestProfile, interestIn } from "../interests";
import {
  addToSeenCookie,
  isRecentlySeen,
  mergeCookieSeen,
  parseSeenCookie,
  seenKey,
  seenPenalty,
  SEEN,
  SEEN_COOKIE_MAX,
} from "../seen";
import type { InterestSignal, SeenState } from "../types";
import { H, NOW, cand, control, ctx, item } from "./fixtures";

/*
  The seen post regression suite (2026-09-24). Before the fix, a post seen once
  came back at the top on refresh. Every test here is a sentence from the bug
  brief, turned into an assertion.
*/

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

function seenState(entries: [string, number, "brief" | "viewed" | "consumed"][]): SeenState {
  const s: SeenState = new Map();
  for (const [id, at, depth] of entries) s.set(id, { lastAt: at, impressions: 1, depth, source: "history" });
  return s;
}

function likesOn(topicId: string, n: number): InterestSignal[] {
  return Array.from({ length: n }, (_, i) => ({ action: "like" as const, at: NOW - (i + 2) * H, postId: `old-${topicId}-${i}`, topicId, authorId: `fan-${i}` }));
}

describe("Seen post suppression", () => {
  it("1. a post just seen is not in the primary (unseen) part of the next feed", () => {
    const a = item({ authorId: "a1", topicId: "t", createdAt: NOW - 1 * H });
    const others = Array.from({ length: 5 }, (_, i) => item({ authorId: `o${i}`, topicId: "t", createdAt: NOW - (i + 2) * H }));
    const res = forYou({ candidates: [a, ...others].map((i) => cand(i)), seen: seenState([[a.id, NOW - 60_000, "brief"]]) });
    const ids = res.items.map((r) => r.item.id);
    assert.equal(ids[ids.length - 1], a.id, "the seen post is last, behind every unseen post");
  });

  it("2. after seeing A, B and C, unseen D, E and F come first", () => {
    const [A, B, C, D, E, F] = Array.from({ length: 6 }, (_, i) => item({ authorId: `x${i}`, createdAt: NOW - (i + 1) * H }));
    const seen = seenState([[A.id, NOW - 120_000, "viewed"], [B.id, NOW - 90_000, "viewed"], [C.id, NOW - 60_000, "brief"]]);
    const res = forYou({ candidates: [A, B, C, D, E, F].map((i) => cand(i)), seen });
    assert.deepEqual(new Set(res.items.slice(0, 3).map((r) => r.item.id)), new Set([D.id, E.id, F.id]));
  });

  it("3. a strongly relevant, popular seen post still loses to a weaker unseen one", () => {
    const profile = buildInterestProfile("viewer", likesOn("hot", 8), NOW);
    const seenStar = item({ authorId: "star", topicId: "hot", createdAt: NOW - 1 * H, counts: { likes: 90, comments: 20, saves: 10, reposts: 5 } });
    const plain = item({ authorId: "plain", topicId: "cold", createdAt: NOW - 5 * H });
    const res = forYou({
      candidates: [seenStar, plain].map((i) => cand(i)),
      profile,
      seen: seenState([[seenStar.id, NOW - 30_000, "brief"]]),
    });
    assert.equal(res.items[0].item.id, plain.id);
  });

  it("4. refresh: the same seen state gives the same suppression", () => {
    const posts = Array.from({ length: 8 }, (_, i) => item({ authorId: `r${i}`, createdAt: NOW - (i + 1) * H }));
    const seen = seenState([[posts[0].id, NOW - 60_000, "viewed"], [posts[1].id, NOW - 50_000, "viewed"]]);
    const first = forYou({ candidates: posts.map((i) => cand(i)), seen }).items.map((r) => r.item.id);
    const again = forYou({ candidates: posts.map((i) => cand(i)), seen }).items.map((r) => r.item.id);
    assert.deepEqual(first, again);
    assert.ok(first.indexOf(posts[0].id) >= 6 && first.indexOf(posts[1].id) >= 6);
  });

  it("5. pagination: a later page never repeats a post from an earlier one", () => {
    const posts = Array.from({ length: 50 }, (_, i) => item({ authorId: `p${i % 10}`, topicId: `t${i % 4}`, createdAt: NOW - (i + 1) * H }));
    const seen = seenState(posts.slice(0, 5).map((p, i) => [p.id, NOW - (i + 1) * 60_000, "brief"]));
    const two = forYou({ candidates: posts.map((i) => cand(i)), seen, pages: 2 }).items.map((r) => r.item.id);
    assert.equal(new Set(two).size, two.length, "no id twice across pages");
    const one = forYou({ candidates: posts.map((i) => cand(i)), seen, pages: 1 }).items.map((r) => r.item.id);
    assert.deepEqual(two.slice(0, one.length), one, "page 1 unchanged when page 2 is added");
  });

  it("6. a small pool that has all been seen still returns every post", () => {
    const posts = Array.from({ length: 4 }, (_, i) => item({ authorId: `s${i}`, createdAt: NOW - (i + 1) * H }));
    const seen = seenState(posts.map((p, i) => [p.id, NOW - (i + 1) * 60_000, "viewed"]));
    const res = forYou({ candidates: posts.map((i) => cand(i)), seen });
    assert.equal(res.items.length, 4);
    assert.ok(res.items.every((r) => r.explanation?.primary === "resurfaced"), "honestly labelled as resurfaced");
  });

  it("6b. unseen posts are used before any seen one, then seen ones fill in", () => {
    const [A, B, C, D] = Array.from({ length: 4 }, (_, i) => item({ authorId: `q${i}`, createdAt: NOW - (i + 1) * H }));
    const seen = seenState([[A.id, NOW - 60_000, "viewed"], [B.id, NOW - 50_000, "viewed"], [C.id, NOW - 40_000, "viewed"]]);
    const ids = forYou({ candidates: [A, B, C, D].map((i) => cand(i)), seen }).items.map((r) => r.item.id);
    assert.equal(ids[0], D.id);
    assert.equal(ids.length, 4);
  });

  it("7. a watched video goes behind related videos it did not replace", () => {
    const watched = item({ media: "video", authorId: "v1", topicId: "ai", createdAt: NOW - 50 * H, body: "Coding agents that write tests for you" });
    const related = item({ media: "video", authorId: "v2", topicId: "ai", createdAt: NOW - 50 * H, body: "How coding agents plan their work" });
    const res = reelsFeed({
      context: ctx({ surface: "reels", algorithm: "reels_v2" }),
      candidates: [watched, related].map((i) => cand(i, "video")),
      profile: null,
      signals: new Map(),
      assignment: control,
      viewerKey: "viewer",
      seen: seenState([[watched.id, NOW - 5 * 60_000, "consumed"]]),
    });
    assert.deepEqual(res.items.map((r) => r.item.id), [related.id, watched.id]);
  });

  it("7b. a fully consumed post is held back longer than one that flashed past", () => {
    const now = NOW;
    const brief = { lastAt: now - 20 * H, impressions: 1, depth: "brief" as const, source: "history" as const };
    const consumed = { ...brief, depth: "consumed" as const };
    assert.equal(isRecentlySeen(brief, now), false, "a glance 20h ago is back in the unseen tier");
    assert.equal(isRecentlySeen(consumed, now), true, "a post read 20h ago is still held back");
  });

  it("8. not interested is stronger than seen: the post is gone, not just behind", () => {
    const p = item({ authorId: "n1" });
    const other = item({ authorId: "n2" });
    const profile = buildInterestProfile("viewer", [{ action: "not_interested", at: NOW - H, postId: p.id, authorId: "n1" }], NOW);
    const res = forYou({ candidates: [p, other].map((i) => cand(i)), profile });
    assert.ok(!res.items.some((r) => r.item.id === p.id));
  });

  it("9. seeing a post is not disliking its topic", () => {
    const base = buildInterestProfile("viewer", likesOn("ai", 3), NOW);
    const seenLots = buildInterestProfile(
      "viewer",
      [...likesOn("ai", 3), ...Array.from({ length: 10 }, (_, i) => ({ action: "seen" as const, at: NOW - i * 60_000, postId: `ai-${i}`, topicId: "ai", authorId: "someone" }))],
      NOW,
    );
    const probe = item({ topicId: "ai", authorId: "fresh" });
    assert.equal(interestIn(seenLots, probe).negative, 0);
    assert.equal(interestIn(seenLots, probe).topic, interestIn(base, probe).topic, "impressions change no interest");
  });

  it("9b. reading a post raises interest in its topic while the post itself is suppressed", () => {
    const read = item({ authorId: "w1", topicId: "rag", createdAt: NOW - 2 * H, body: "Chunking strategies for retrieval pipelines that actually work" });
    const sibling = item({ authorId: "w2", topicId: "rag", createdAt: NOW - 3 * H, body: "Evaluating recall in retrieval pipelines" });
    const unrelated = item({ authorId: "w3", topicId: "music", createdAt: NOW - 2 * H, body: "My favourite synth presets this month" });
    const profile = buildInterestProfile(
      "viewer",
      [
        ...likesOn("music", 1),
        { action: "open", at: NOW - 10 * 60_000, postId: read.id, topicId: "rag", authorId: "w1" },
        { action: "dwell", at: NOW - 9 * 60_000, postId: read.id, topicId: "rag", authorId: "w1", value: 25_000 },
        { action: "save", at: NOW - 8 * 60_000, postId: read.id, topicId: "rag", authorId: "w1" },
      ],
      NOW,
    );
    const ids = forYou({ candidates: [read, sibling, unrelated].map((i) => cand(i)), profile }).items.map((r) => r.item.id);
    assert.equal(ids[0], sibling.id, "the related unseen post leads");
    assert.equal(ids[ids.length - 1], read.id, "the consumed post itself is last");
  });

  it("10. a near copy of a post just read is held back too", () => {
    const text = "Top ten AI coding tools I tried this month and what each is good at";
    const original = item({ authorId: "c1", body: text, createdAt: NOW - 5 * H });
    const copy = item({ authorId: "c2", body: `${text}.`, createdAt: NOW - 1 * H });
    const different = item({ authorId: "c3", body: "A walk through fine tuning with small data", createdAt: NOW - 6 * H });
    const res = forYou({
      candidates: [original, copy, different].map((i) => cand(i)),
      seen: seenState([[original.id, NOW - 10 * 60_000, "viewed"]]),
    });
    assert.equal(res.items[0].item.id, different.id);
  });

  it("11. after suppression, one creator does not refill the page when others exist", () => {
    const heavy = Array.from({ length: 6 }, (_, i) => item({ authorId: "A", createdAt: NOW - (i + 1) * 0.2 * H }));
    const rest = Array.from({ length: 4 }, (_, i) => item({ authorId: `b${i}`, createdAt: NOW - (i + 3) * H }));
    const seen = seenState([[heavy[0].id, NOW - 60_000, "viewed"]]);
    const authors = forYou({ candidates: [...heavy, ...rest].map((i) => cand(i)), seen }).items.map((r) => r.item.authorId);
    assert.ok(!(authors[0] === "A" && authors[1] === "A" && authors[2] === "A"), "no run of three from A at the top");
  });

  it("12. reasons stay truthful: a resurfaced post never claims to be similar to itself", () => {
    const watchedPost = item({ authorId: "t1", topicId: "t", createdAt: NOW - 3 * H, body: "Distillation of large models into small ones explained" });
    const profile = buildInterestProfile(
      "viewer",
      [{ action: "complete", at: NOW - 30 * 60_000, postId: watchedPost.id, authorId: "t1", topicId: "t" }],
      NOW,
    );
    const seeds = { liked: new Map(), saved: new Map(), watched: new Map([[watchedPost.id, new Set(["distillation", "large", "models", "small", "explained"])]]) };
    const res = forYou({ candidates: [cand(watchedPost)], profile, seeds });
    const r = res.items[0];
    assert.equal(r.explanation?.primary, "resurfaced");
    assert.ok(!r.reasons.includes("similar_to_watched"), "not similar to itself");
  });
});

describe("Seen decay and resurfacing", () => {
  it("penalty is total inside the window, fades after it, and ends", () => {
    const r = { lastAt: NOW, impressions: 1, depth: "viewed" as const, source: "history" as const };
    assert.equal(seenPenalty(r, NOW + 1 * H), 1);
    const after = seenPenalty(r, NOW + (SEEN.FALLBACK_HOURS.viewed + 1) * H);
    assert.ok(after > 0 && after <= SEEN.PENALTY_MAX);
    assert.equal(seenPenalty(r, NOW + (SEEN.PENALTY_UNTIL_DAYS * 24 + 1) * H), 0);
  });

  it("repeated impressions hold a post back longer", () => {
    const once = { lastAt: NOW, impressions: 1, depth: "brief" as const, source: "history" as const };
    const often = { ...once, impressions: SEEN.REPEAT_IMPRESSIONS };
    const t = NOW + (SEEN.FALLBACK_HOURS.brief + 1) * H;
    assert.equal(isRecentlySeen(once, t), false);
    assert.equal(isRecentlySeen(often, t), true);
  });

  it("an old post seen long ago can resurface normally", () => {
    const old = item({ authorId: "e1", createdAt: NOW - 400 * H });
    const res = forYou({ candidates: [cand(old)], seen: seenState([[old.id, NOW - 30 * 24 * H, "consumed"]]) });
    assert.equal(res.items[0].explanation?.primary === "resurfaced", false);
  });
});

describe("The session seen cookie", () => {
  it("round trips, upgrades depth, and caps its size", () => {
    let v = addToSeenCookie(null, "a0000001-0000-4000-8000-000000000001", "brief", NOW);
    v = addToSeenCookie(v, "a0000001-0000-4000-8000-000000000001", "viewed", NOW + 1000);
    const parsed = parseSeenCookie(v);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].depth, "viewed");
    assert.equal(parsed[0].key, seenKey("a0000001-0000-4000-8000-000000000001"));
    for (let i = 0; i < 120; i++) v = addToSeenCookie(v, `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, "brief", NOW);
    assert.equal(parseSeenCookie(v).length, SEEN_COOKIE_MAX);
    assert.ok(v.length < 2400, "stays well under a cookie's 4 KB");
  });

  it("ignores garbage and entries newer than the frozen ranking time", () => {
    assert.deepEqual(parseSeenCookie("zzz.<script>.12"), []);
    const id = "b0000002-0000-4000-8000-000000000002";
    const v = addToSeenCookie(null, id, "viewed", NOW + 60_000);
    const state: SeenState = new Map();
    mergeCookieSeen(state, parseSeenCookie(v), [id], NOW);
    assert.equal(state.size, 0, "seen after the first page was built: not applied to its order");
    mergeCookieSeen(state, parseSeenCookie(v), [id], NOW + 120_000);
    assert.equal(state.get(id)?.source, "session");
  });
});

describe("Reload rotation when everything has been seen", () => {
  it("brings back what was seen longest ago first, and moves what was just seen to the back", () => {
    const [A, B, C] = Array.from({ length: 3 }, (_, i) => item({ authorId: `z${i}`, createdAt: NOW - (i + 1) * H }));
    const first = seenState([[A.id, NOW - 30 * 60_000, "brief"], [B.id, NOW - 20 * 60_000, "brief"], [C.id, NOW - 10 * 60_000, "brief"]]);
    const one = forYou({ candidates: [A, B, C].map((i) => cand(i)), seen: first }).items.map((r) => r.item.id);
    assert.deepEqual(one, [A.id, B.id, C.id]);
    /* The person looks at A (it was on top), then reloads. */
    const after = seenState([[A.id, NOW - 1 * 60_000, "brief"], [B.id, NOW - 20 * 60_000, "brief"], [C.id, NOW - 10 * 60_000, "brief"]]);
    const two = forYou({ candidates: [A, B, C].map((i) => cand(i)), seen: after }).items.map((r) => r.item.id);
    assert.deepEqual(two, [B.id, C.id, A.id], "the reload shows a different first post");
  });
});
