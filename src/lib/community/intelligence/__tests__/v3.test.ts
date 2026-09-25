import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FEED, FEED_ALGORITHM, rankForYou } from "../feed";
import { examinationProbability } from "../evaluation";
import { buildInterestProfile, ignoreLevel, interestIn } from "../interests";
import { applySourceQuota, splitSameStory, type DropReason } from "../pipeline";
import { baitRisk, outperformance } from "../quality";
import { reelsFeed } from "../reels";
import { addToSeenCookie, expectedReadMs, isRecentlySeen, markSeen, parseSeenCookie, seenPenalty, SEEN } from "../seen";
import { sameStory } from "../text";
import type { InterestSignal, NetworkEngagement, SeenState } from "../types";
import { H, NOW, cand, control, ctx, item, signals } from "./fixtures";

/*
  feed_v3 (2026-09-25). One test per behaviour the brief asked for and the
  plan named. Synthetic inputs to pure functions, as everywhere in this suite.
*/

const forYou = (over: Partial<Parameters<typeof rankForYou>[0]> = {}) =>
  rankForYou({
    context: ctx({ algorithm: FEED_ALGORITHM.forYou }),
    candidates: [],
    profile: null,
    signals: new Map(),
    assignment: control,
    pages: 1,
    viewerKey: "viewer",
    ...over,
  });

function served(id: string, times: number, at = NOW - 10 * 60_000): SeenState {
  const s: SeenState = new Map();
  for (let i = 0; i < times; i++) markSeen(s, id, at, "served", "history", false);
  return s;
}

const seenRows = (authorId: string, positions: number[], at = NOW - 2 * H): InterestSignal[] =>
  positions.map((position, i) => ({ action: "seen", at: at - i * 60_000, postId: `${authorId}-p${i}`, authorId, topicId: `t-${authorId}`, position }));

describe("feed_v3 is what For You and Following run", () => {
  it("names v3 on both surfaces", () => {
    assert.equal(FEED_ALGORITHM.forYou, "feed_v3");
    assert.equal(FEED_ALGORITHM.following, "following_v3");
    assert.equal(forYou({ candidates: [cand(item())] }).algorithm, "feed_v3");
  });
});

describe("Served state (delivered, never on screen)", () => {
  it("a post served once carries a light penalty and stays in the unseen tier", () => {
    const s = served("a", 1);
    const r = s.get("a");
    assert.equal(r?.depth, "served");
    assert.equal(isRecentlySeen(r, NOW), false);
    const p = seenPenalty(r, NOW);
    assert.ok(p > 0 && p <= SEEN.SERVED_PENALTY, `penalty ${p}`);
  });

  it("the penalty fades within a day", () => {
    const r = served("a", 1, NOW - 25 * H).get("a");
    assert.equal(seenPenalty(r, NOW), 0);
  });

  it("refresh rotates: of two equal posts, the one just delivered goes second", () => {
    const a = item({ authorId: "a1", createdAt: NOW - 2 * H });
    const b = item({ authorId: "b1", createdAt: NOW - 2 * H });
    const first = forYou({ candidates: [cand(a), cand(b)] }).items.map((r) => r.item.id);
    const top = first[0];
    const after = forYou({ candidates: [cand(a), cand(b)], seen: served(top, 1) }).items.map((r) => r.item.id);
    assert.notEqual(after[0], top, "the delivered post no longer leads");
    assert.equal(after.length, 2, "nothing disappears");
  });

  it("delivered three times and never seen, it goes to the recently seen tier", () => {
    const r = served("a", SEEN.SERVED_TO_TIER).get("a");
    assert.equal(isRecentlySeen(r, NOW), true);
    const a = item({ authorId: "a1", createdAt: NOW - 1 * H });
    const others = Array.from({ length: 3 }, (_, i) => item({ authorId: `o${i}`, createdAt: NOW - 20 * H }));
    const res = forYou({ candidates: [a, ...others].map((i) => cand(i)), seen: served(a.id, SEEN.SERVED_TO_TIER) });
    assert.equal(res.items[res.items.length - 1].item.id, a.id);
  });

  it("a delivery never extends how long a seen post counts as seen", () => {
    const s: SeenState = new Map();
    markSeen(s, "a", NOW - 10 * H, "brief", "history");
    markSeen(s, "a", NOW - 1 * H, "served", "history", false);
    assert.equal(s.get("a")?.depth, "brief");
    assert.equal(s.get("a")?.lastAt, NOW - 10 * H);
  });

  it("seeing a delivered post upgrades it to seen, from the moment it was seen", () => {
    const s = served("a", 2, NOW - 3 * H);
    markSeen(s, "a", NOW - 1 * H, "brief", "history");
    assert.equal(s.get("a")?.depth, "brief");
    assert.equal(s.get("a")?.lastAt, NOW - 1 * H);
  });

  it("the cookie holds served entries, evicts them first, and never lets one overwrite a seen entry", () => {
    const seenId = "c0000000-0000-4000-8000-000000000000";
    let v = addToSeenCookie(null, seenId, "brief", NOW);
    v = addToSeenCookie(v, seenId, "served", NOW + 1000);
    assert.equal(parseSeenCookie(v)[0].depth, "brief");
    for (let i = 0; i < 150; i++) v = addToSeenCookie(v, `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, "served", NOW);
    const parsed = parseSeenCookie(v);
    assert.ok(parsed.some((e) => e.depth === "brief"), "the seen entry survived");
    assert.ok(v.length < 2400);
  });

  it("pagination never repeats a post", () => {
    const items = Array.from({ length: 45 }, (_, i) => item({ authorId: `a${i % 9}`, topicId: `t${i % 5}`, createdAt: NOW - (i + 1) * H }));
    const res = forYou({ candidates: items.map((i) => cand(i)), pages: 3 });
    const ids = res.items.map((r) => r.item.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("Position aware ignores", () => {
  it("one pass over changes nothing", () => {
    const p = buildInterestProfile("viewer", seenRows("x", [0]), NOW);
    assert.equal(ignoreLevel(p, "author:x"), 0);
  });

  it("three passes over at the top weigh against the author a little, capped", () => {
    const p = buildInterestProfile("viewer", seenRows("x", [0, 1, 2]), NOW);
    const lvl = ignoreLevel(p, "author:x");
    assert.ok(lvl > 0 && lvl <= 0.3, `level ${lvl}`);
    assert.ok(interestIn(p, item({ authorId: "x", topicId: null })).negative > 0);
  });

  it("the same three deep in the feed weigh less, because those slots are skimmed", () => {
    const top = ignoreLevel(buildInterestProfile("viewer", seenRows("x", [0, 1, 2]), NOW), "author:x");
    const deep = ignoreLevel(buildInterestProfile("viewer", seenRows("x", [18, 19, 20]), NOW), "author:x");
    assert.ok(examinationProbability(0) > examinationProbability(18));
    assert.ok(deep < top, `deep ${deep} top ${top}`);
  });

  it("a post that was read, liked or dwelt on is not a pass over", () => {
    const rows = seenRows("x", [0, 1, 2]);
    const withDwell: InterestSignal[] = [...rows, { action: "dwell", at: NOW - H, postId: rows[0].postId, authorId: "x", value: 8000 }];
    assert.equal(ignoreLevel(buildInterestProfile("viewer", withDwell, NOW), "author:x"), 0);
  });

  it("real interest in the author offsets passing over", () => {
    const likes: InterestSignal[] = Array.from({ length: 4 }, (_, i) => ({ action: "like", at: NOW - (i + 5) * H, postId: `l${i}`, authorId: "x" }));
    const cold = buildInterestProfile("viewer", seenRows("x", [0, 1, 2]), NOW);
    const fan = buildInterestProfile("viewer", [...likes, ...seenRows("x", [0, 1, 2])], NOW);
    const probe = item({ authorId: "x", topicId: null });
    assert.ok(interestIn(fan, probe).negative < interestIn(cold, probe).negative);
  });
});

describe("Network and social proof (counts only)", () => {
  const net = (n: Partial<NetworkEngagement>): NetworkEngagement => ({ likers: 0, commenters: 0, reposters: 0, ...n });

  it("posts the people you follow commented on rank higher, and say so truthfully", () => {
    const a = item({ authorId: "s1", createdAt: NOW - 3 * H });
    const b = item({ authorId: "s2", createdAt: NOW - 3 * H });
    const network = new Map([[b.id, net({ commenters: 2 })]]);
    const res = forYou({ candidates: [cand(a), cand(b, "network")], network });
    assert.equal(res.items[0].item.id, b.id);
    assert.equal(res.items[0].explanation?.primary, "commented_by_following");
  });

  it("likes rank but never explain: they are private", () => {
    const b = item({ authorId: "s2", createdAt: NOW - 3 * H });
    const res = forYou({ candidates: [cand(b, "network")], network: new Map([[b.id, net({ likers: 3 })]]) });
    const reasons = [res.items[0].explanation?.primary, ...(res.items[0].explanation?.supporting ?? [])];
    assert.ok(!reasons.some((r) => r === "commented_by_following" || r === "reposted_by_following"));
  });
});

describe("Two way author affinity", () => {
  it("someone who comments on your posts rises in your feed", () => {
    const engaged = buildInterestProfile("viewer", [
      ...Array.from({ length: 3 }, (_, i): InterestSignal => ({ action: "engaged_me", at: NOW - (i + 1) * H, authorId: "fan" })),
      { action: "like", at: NOW - 10 * H, postId: "z", authorId: "other" },
    ], NOW);
    assert.ok(interestIn(engaged, item({ authorId: "fan", topicId: null })).author > 0);
  });

  it("a mutual follow (friends) is stronger than a one way follow", () => {
    /* Somebody else is this person's strongest author, so following f alone
       does not already put f at the top of the scale. */
    const history: InterestSignal[] = [
      ...Array.from({ length: 6 }, (_, i): InterestSignal => ({ action: "like", at: NOW - (i + 1) * H, postId: `o${i}`, authorId: "other" })),
      { action: "follow", at: NOW - H, authorId: "f" },
    ];
    const oneWay = buildInterestProfile("viewer", history, NOW);
    const mutual = buildInterestProfile("viewer", [...history, { action: "followed_by", at: NOW - H, authorId: "f" }], NOW);
    const probe = item({ authorId: "f", topicId: null });
    assert.ok(interestIn(mutual, probe).author > interestIn(oneWay, probe).author);
  });

  it("none of it enters the session or marks anything seen", () => {
    const p = buildInterestProfile("viewer", [{ action: "engaged_me", at: NOW - 60_000, authorId: "fan" }], NOW);
    assert.equal(p.seen.size, 0);
  });
});

describe("Conversation first", () => {
  it("a conversation the author joins beats a pile of likes at equal relevance", () => {
    const liked = item({ authorId: "l", createdAt: NOW - 5 * H });
    const talked = item({ authorId: "t", createdAt: NOW - 5 * H });
    const sig = new Map([
      [liked.id, signals({ like: [0, 2, 4, 0, 0, 0], impression: [0, 5, 10, 0, 0, 0] })],
      [talked.id, signals({ comment: [0, 1, 2, 0, 0, 0], author_reply: [0, 1, 1, 0, 0, 0], impression: [0, 5, 10, 0, 0, 0] }, { events: { comment: [0, 3, 4, 0, 0, 0] } })],
    ]);
    const res = forYou({ candidates: [cand(liked), cand(talked)], signals: sig });
    assert.equal(res.items[0].item.id, talked.id);
  });
});

describe("Engagement bait", () => {
  it("is detected, and demoted rather than removed", () => {
    assert.ok(baitRisk("Comment YES and I will send you the prompt pack") > 0);
    assert.equal(baitRisk("How I cut our Claude bill by 40% with prompt caching and batching."), 0);
    const bait = item({ authorId: "b", body: "Like this if you use Cursor every day. Follow me for more!", createdAt: NOW - 2 * H });
    const plain = item({ authorId: "p", body: "What we learned moving our code review to Cursor over three months", createdAt: NOW - 2 * H });
    const res = forYou({ candidates: [cand(bait), cand(plain)] });
    assert.equal(res.items.length, 2, "not removed");
    assert.equal(res.items[0].item.id, plain.id, "demoted");
  });
});

describe("Source balancing", () => {
  it("no source floods the first stage while others have candidates", () => {
    const mk = (source: "trending" | "topic" | "fresh", n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `${source}-${i}`, sources: [source] as ("trending" | "topic" | "fresh")[] }));
    const ordered = [...mk("trending", 100), ...mk("topic", 100), ...mk("fresh", 20)];
    const { kept } = applySourceQuota(ordered, 50, 0);
    const count = (s: string) => kept.filter((k) => k.sources[0] === s).length;
    assert.equal(kept.length, 50);
    assert.ok(count("trending") <= Math.ceil(0.45 * 50), `trending ${count("trending")}`);
    assert.ok(count("fresh") >= 5, `fresh ${count("fresh")}`);
  });

  it("never leaves the pool short when one source is all there is", () => {
    const ordered = Array.from({ length: 80 }, (_, i) => ({ id: `t${i}`, sources: ["trending" as const] }));
    assert.equal(applySourceQuota(ordered, 50, 0).kept.length, 50);
  });
});

describe("Creator relative performance", () => {
  it("a post well above its creator's usual scores above 0.5; no baseline is 0.5", () => {
    const stats = { postQualities: [0.2, 0.25, 0.3], duplicateShare: 0, qualifiedReports: 0 };
    assert.ok(outperformance(0.7, stats) > 0.5);
    assert.ok(outperformance(0.1, stats) < 0.5);
    assert.equal(outperformance(0.9, { postQualities: [0.2], duplicateShare: 0, qualifiedReports: 0 }), 0.5);
  });
});

describe("One story, shown once", () => {
  const o = { windowHours: 72, jaccard: 0.3, minSharedNames: 1 };
  it("recognises the brief's three posts as one story, and unrelated posts as not", () => {
    const A = { body: "Claude released a new feature.", createdAt: NOW };
    assert.ok(sameStory(A, { body: "New Claude feature announced today.", createdAt: NOW }, o));
    assert.ok(sameStory(A, { body: "Claude just launched another feature.", createdAt: NOW }, o));
    assert.ok(!sameStory(A, { body: "Claude pricing changed for teams", createdAt: NOW }, o));
    assert.ok(!sameStory(A, { body: "Claude just launched another feature.", createdAt: NOW - 100 * H }, o), "days apart is not one story");
  });

  it("keeps the best telling and holds the rest after every other unseen post", () => {
    const best = item({ authorId: "a", body: "Claude released a new feature.", createdAt: NOW - 1 * H });
    const again = item({ authorId: "b", body: "Claude just launched another feature.", createdAt: NOW - 2 * H });
    const other = item({ authorId: "c", createdAt: NOW - 30 * H });
    const { kept, extras } = splitSameStory([{ item: best }, { item: again }, { item: other }]);
    assert.deepEqual(kept.map((k) => k.item.id), [best.id, other.id]);
    assert.deepEqual(extras.map((k) => k.item.id), [again.id]);
    const res = forYou({ candidates: [best, again, other].map((i) => cand(i)) });
    assert.equal(res.items.length, 3, "nothing removed");
    assert.equal(res.items[2].item.id, again.id);
  });
});

describe("Dwell hygiene", () => {
  it("expected read time grows with length and media, with a floor", () => {
    assert.equal(expectedReadMs(0, "text"), 3000);
    assert.ok(expectedReadMs(500, "text") > expectedReadMs(50, "text"));
    assert.ok(expectedReadMs(10, "video") > expectedReadMs(10, "text"));
  });
});

describe("Why not (admin debug trace)", () => {
  it("names the stage that dropped or held back a post", () => {
    const muted = item({ authorId: "m" });
    const items = Array.from({ length: FEED.PAGE_SIZE + 3 }, (_, i) => item({ authorId: `a${i}`, topicId: `t${i % 6}`, createdAt: NOW - (i + 1) * H }));
    const profile = buildInterestProfile("viewer", [{ action: "mute_author", at: NOW - H, authorId: "m" }], NOW);
    const trace = new Map<string, DropReason>();
    forYou({ candidates: [muted, ...items].map((i) => cand(i)), profile, trace });
    assert.equal(trace.get(muted.id), "ineligible:muted_author");
    assert.ok([...trace.values()].includes("page_cap"));
  });
});

describe("Reels stay reels_v2", () => {
  it("a profile built v2 only has no v3 inputs, and reels rank the same with or without v3 rows", () => {
    const base: InterestSignal[] = [{ action: "complete", at: NOW - H, postId: "v0", topicId: "ai", authorId: "k" }];
    const extra: InterestSignal[] = [
      { action: "engaged_me", at: NOW - H, authorId: "v2author" },
      { action: "followed_by", at: NOW - H, authorId: "v2author" },
      ...seenRows("v1author", [0, 1, 2]),
      { action: "served", at: NOW - H, postId: "zz" },
    ];
    const plain = buildInterestProfile("viewer", base, NOW, { v2Only: true });
    const withV3 = buildInterestProfile("viewer", [...base, ...extra], NOW, { v2Only: true });
    assert.equal(withV3.followers.size, 0);
    assert.equal(withV3.ignored.size, 0);
    const vids = ["v1author", "v2author", "k"].map((a, i) => item({ media: "video", authorId: a, topicId: i === 2 ? "ai" : `t${i}`, createdAt: NOW - (i + 3) * H }));
    const run = (profile: typeof plain) =>
      reelsFeed({ context: ctx({ surface: "reels", algorithm: "reels_v2" }), candidates: vids.map((v) => cand(v, "video")), profile, signals: new Map(), assignment: control, viewerKey: "viewer" }).items.map((r) => r.item.id);
    assert.deepEqual(run(withV3), run(plain));
  });
});
