import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DIVERSITY, LIMITS, WEIGHTS } from "../config";
import { rankReplies, rankRoots, takePage } from "../rank";
import { debugRows } from "../explain";
import { activeLearnedRanker, enoughEvidence, LTR_MINIMUM } from "../ltr";
import { buildThread } from "../../../community/thread";
import type { Comment } from "../../../community/queries";
import type { CommentRow } from "../types";
import { VIEWER, ctx, friendWeak, hoursAgo, row, strong } from "./fixtures";

const ids = (list: { row: CommentRow }[]) => list.map((s) => s.row.id);

describe("Config", () => {
  it("weights sum to one, so the positive score stays in 0..1", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
  });
});

describe("Relationships", () => {
  it("a friend outranks an otherwise identical stranger, and a follow sits between", () => {
    /* A body too short to be a copy of anything, so only the relationship differs. */
    const base = { body: "yes", trustedLikes: 2, likeCount: 2 };
    const stranger = row({ id: "s", ...base });
    const followed = row({ id: "f", ...base, viewerFollows: true });
    const friend = row({ id: "fr", ...base, viewerFollows: true, followsViewer: true });
    const ranked = rankRoots([stranger, followed, friend], ctx(), "top");
    assert.deepEqual(ids(ranked), ["fr", "f", "s"]);
    assert.equal(ranked[0].relation, "friend");
    assert.equal(ranked[1].relation, "following");
    assert.equal(ranked[2].relation, null);
  });

  it("the boost is not a guarantee: a relevant, helpful stranger beats a friend's low effort comment", () => {
    const ranked = rankRoots([friendWeak({ id: "friend" }), strong({ id: "good" })], ctx(), "top");
    assert.deepEqual(ids(ranked), ["good", "friend"]);
  });

  it("past interactions with a commenter lift them for this viewer only", () => {
    const a = row({ id: "a", viewerLikedAuthor: 6, viewerRepliedAuthor: 2 });
    const b = row({ id: "b" });
    assert.deepEqual(ids(rankRoots([b, a], ctx(), "top")), ["a", "b"]);
    assert.equal(rankRoots([a], ctx({ viewerId: null }), "top")[0].features.affinity, 0);
  });

  it("follower count is not an input at all", () => {
    const keys = Object.keys(rankRoots([row()], ctx(), "top")[0].features);
    assert.ok(!keys.some((k) => /follower/i.test(k)));
  });

  it("the post author's engagement lifts a comment", () => {
    const plain = row({ id: "plain" });
    const answered = row({ id: "answered", postAuthorReplied: true });
    assert.deepEqual(ids(rankRoots([plain, answered], ctx(), "top")), ["answered", "plain"]);
  });
});

describe("Moderation and spam", () => {
  it("severe comments sink below everything, friends included", () => {
    const hidden = strong({ id: "hidden", status: "hidden", viewerFollows: true, followsViewer: true });
    const qualified = strong({ id: "qualified", qualifiedReportCount: 1 });
    const suspended = strong({ id: "suspended", author: { username: "x", fullName: null, avatarUrl: null, status: "suspended" } });
    const weak = row({ id: "weak", body: "ok" });
    const ranked = rankRoots([hidden, qualified, suspended, weak], ctx(), "top");
    assert.equal(ranked[0].row.id, "weak");
    for (const s of ranked.slice(1)) assert.ok(s.penalties.severe, `${s.row.id} should be severe`);
    assert.ok(ranked.slice(1).every((s) => s.score < ranked[0].score));
  });

  it("spam is penalised the same for a friend as for a stranger", () => {
    const spam = "Buy now https://a.example https://b.example https://c.example";
    const friend = rankRoots([row({ id: "f", body: spam, viewerFollows: true, followsViewer: true })], ctx(), "top")[0];
    const stranger = rankRoots([row({ id: "s", body: spam })], ctx(), "top")[0];
    assert.ok(friend.penalties.total > 0.3);
    assert.equal(friend.penalties.total, stranger.penalties.total);
  });

  it("a comment the viewer hid, or marked Not interested, is never returned", () => {
    const ranked = rankRoots([row({ id: "keep" }), row({ id: "gone", viewerHid: true })], ctx(), "top");
    assert.deepEqual(ids(ranked), ["keep"]);
  });

  it("Not interested in an author pushes their other comments down for this viewer", () => {
    const a = row({ id: "a", authorId: "x", viewerNotInterestedAuthor: 1 });
    const b = row({ id: "b" });
    assert.deepEqual(ids(rankRoots([a, b], ctx(), "top")), ["b", "a"]);
  });

  it("suspicious engagement does not dominate: likes from fresh accounts and early bursts lose their weight", () => {
    const bought = row({
      id: "bought",
      body: "Claude Code TypeScript monorepo",
      newAccountLikes: 40,
      trustedLikes: 1,
      earlyLikes: 38,
      likeCount: 41,
      likes24h: 41,
    });
    const earned = row({ id: "earned", body: "Claude Code TypeScript monorepo", trustedLikes: 6, likeCount: 6, likes24h: 2 });
    const ranked = rankRoots([bought, earned], ctx(), "top");
    assert.deepEqual(ids(ranked), ["earned", "bought"]);
    assert.ok(ranked[1].penalties.applied.new_account_likes);
    assert.ok(ranked[1].penalties.applied.early_burst);
  });

  it("a copied comment is penalised, the original is not", () => {
    const text = "Honestly the best assistant for TypeScript monorepos I have used this year.";
    const original = row({ id: "orig", body: text, createdAt: hoursAgo(5) });
    const copy = row({ id: "copy", body: `${text}!!`, createdAt: hoursAgo(1) });
    const ranked = rankRoots([original, copy], ctx(), "top");
    const byId = new Map(ranked.map((s) => [s.row.id, s]));
    assert.equal(byId.get("orig")?.penalties.applied.copied_text, undefined);
    assert.ok(byId.get("copy")?.penalties.applied.copied_text);
  });
});

describe("Modes", () => {
  it("Newest is strictly reverse chronological, whatever the scores", () => {
    const rows = [
      strong({ id: "old", createdAt: hoursAgo(30) }),
      row({ id: "new", createdAt: hoursAgo(1) }),
      row({ id: "mid", createdAt: hoursAgo(10), status: "hidden" }),
    ];
    assert.deepEqual(ids(rankRoots(rows, ctx(), "newest")), ["new", "mid", "old"]);
  });

  it("Following returns only accounts the viewer follows, never their own or a stranger's", () => {
    const rows = [
      row({ id: "friend", viewerFollows: true, followsViewer: true }),
      row({ id: "follow", viewerFollows: true }),
      row({ id: "fan", followsViewer: true }),
      row({ id: "stranger" }),
      row({ id: "mine", authorId: VIEWER, viewerFollows: true }),
    ];
    const ranked = rankRoots(rows, ctx(), "following");
    assert.deepEqual(new Set(ids(ranked)), new Set(["friend", "follow"]));
    assert.equal(ranked.find((s) => s.row.id === "friend")?.relation, "friend");
    assert.deepEqual(ids(rankRoots(rows, ctx({ viewerId: null }), "following")), []);
  });

  it("Top is personalised when signals exist: two viewers get different orders", () => {
    const a = row({ id: "a", authorId: "alice" });
    const b = row({ id: "b", authorId: "bob" });
    const forViewer1 = rankRoots([a, { ...b, viewerFollows: true, followsViewer: true }], ctx(), "top");
    const forViewer2 = rankRoots([{ ...a, viewerLikedAuthor: 8 }, b], ctx({ viewerId: "other" }), "top");
    assert.equal(forViewer1[0].row.id, "b");
    assert.equal(forViewer2[0].row.id, "a");
  });

  it("the viewer's own fresh comment shows first in Top so it never seems to vanish", () => {
    const mine = row({ id: "mine", authorId: VIEWER, createdAt: hoursAgo(0.05), body: "ok" });
    const ranked = rankRoots([strong({ id: "s1" }), strong({ id: "s2" }), mine], ctx(), "top");
    assert.equal(ranked[0].row.id, "mine");
    assert.equal(ranked[0].reason, "own");
  });
});

describe("Cold start", () => {
  it("with no history and no relationships, relevance, freshness and quality still order usefully", () => {
    const onTopic = row({ id: "on", body: "For a TypeScript monorepo Claude Code kept package types consistent." });
    const offTopic = row({ id: "off", body: "Nice weather today everyone." });
    const tiny = row({ id: "tiny", body: "ok" });
    const ranked = rankRoots([tiny, offTopic, onTopic], ctx({ viewerId: null }), "top");
    assert.equal(ranked[0].row.id, "on");
    assert.equal(ranked[2].row.id, "tiny");
    assert.ok(ranked.every((s) => s.features.relationship === 0 && s.features.affinity === 0));
  });

  it("the learned ranker stays off until evidence clears the bar", () => {
    assert.equal(activeLearnedRanker(), null);
    assert.equal(enoughEvidence({ impressions: 20, positiveLabels: 2, distinctViewers: 3, days: 2 }), false);
    assert.equal(enoughEvidence(LTR_MINIMUM), true);
  });
});

const DISTINCT = [
  "Cursor indexes faster on cold start.",
  "We moved our design system to a pnpm workspace last spring.",
  "Pricing matters more than speed for a team of four.",
  "Has anyone measured token usage on a 300 package repo?",
  "Copilot chat still misses cross package renames.",
  "The terminal agent workflow changed how our reviews work.",
  "Our CI runs typecheck per package, which hides some breakage.",
  "Windsurf was decent but the context window felt small.",
  "Remember to pin the model version in shared configs.",
  "I mostly care about refactors across forty services.",
  "Local models are not there yet for this size of codebase.",
  "Try both on a branch for a week and compare diffs.",
];

describe("Diversity", () => {
  it("one author holds at most two places in the top section, and nobody is dropped", () => {
    const flood = Array.from({ length: 6 }, (_, i) => strong({ id: `flood${i}`, authorId: "loud", body: `Point ${i}: Claude Code and TypeScript monorepo detail number ${i * 7}.` }));
    const others = Array.from({ length: 10 }, (_, i) => row({ id: `o${i}`, body: DISTINCT[i], createdAt: hoursAgo(2 + i) }));
    const ranked = rankRoots([...flood, ...others], ctx(), "top");
    const top = ranked.slice(0, DIVERSITY.window);
    assert.ok(top.filter((s) => s.row.authorId === "loud").length <= DIVERSITY.perAuthor);
    assert.equal(ranked.length, 16);
  });

  it("near duplicates do not fill the top section", () => {
    const text = "Claude Code is great for TypeScript monorepos, highly recommend it to everyone.";
    const copies = Array.from({ length: 5 }, (_, i) => strong({ id: `dup${i}`, authorId: `a${i}`, body: `${text}${"!".repeat(i)}` }));
    const others = Array.from({ length: 10 }, (_, i) => row({ id: `x${i}`, body: DISTINCT[i] }));
    const top = rankRoots([...copies, ...others], ctx(), "top").slice(0, DIVERSITY.window);
    assert.equal(top.filter((s) => s.row.id.startsWith("dup")).length, 1);
  });

  it("a huge branch cannot bury a good comment: its reply credit is bounded by the replies weight", () => {
    const huge = row({ id: "huge", body: "Nice weather today everyone.", meaningfulReplies: 300, distinctRepliers: 120 });
    const good = strong({ id: "good", meaningfulReplies: 0, distinctRepliers: 0, replyCount: 0 });
    const ranked = rankRoots([huge, good], ctx(), "top");
    assert.deepEqual(ids(ranked), ["good", "huge"]);
    assert.ok(ranked[1].contributions.replies <= WEIGHTS.replies);
  });
});

describe("Threads", () => {
  const toComment = (r: CommentRow): Comment => ({
    id: r.id,
    post_id: "p",
    parent_id: r.parentId,
    author_id: r.authorId,
    body: r.body,
    created_at: r.createdAt,
    like_count: r.likeCount,
    status: r.status,
    author: null,
  });

  it("replies stay under their parent, ranked within it, with the post author's reply first", () => {
    const rootA = row({ id: "A" });
    const rootB = row({ id: "B" });
    const r1 = strong({ id: "r1", parentId: "A" });
    const r2 = row({ id: "r2", parentId: "A", isPostAuthor: true, body: "Thanks, that matches what I saw." });
    const r3 = row({ id: "r3", parentId: "B" });
    const deep = row({ id: "deep", parentId: "r1" });
    const roots = rankRoots([rootA, rootB], ctx(), "top");
    const replies = rankReplies([r1, r2, r3, deep], ctx(), "top", new Map([["A", rootA.body], ["B", rootB.body], ["r1", r1.body]]));
    const tree = buildThread([...roots, ...replies].map((s) => toComment(s.row)));
    const a = tree.find((n) => n.id === "A");
    const b = tree.find((n) => n.id === "B");
    assert.deepEqual(a?.children.map((c) => c.id), ["r2", "r1"]);
    assert.deepEqual(a?.children[1].children.map((c) => c.id), ["deep"]);
    assert.deepEqual(b?.children.map((c) => c.id), ["r3"]);
    assert.equal(tree.length, 2);
  });

  it("Newest keeps replies in reading order", () => {
    const early = row({ id: "early", parentId: "A", createdAt: hoursAgo(5) });
    const late = strong({ id: "late", parentId: "A", createdAt: hoursAgo(1) });
    assert.deepEqual(ids(rankReplies([late, early], ctx(), "newest", new Map())), ["early", "late"]);
  });
});

describe("Pagination", () => {
  /* The pool function, emulated: everything not excluded. */
  function pageThrough(all: CommentRow[], mode: "top" | "following" | "newest", pageSize: number) {
    const shown: string[] = [];
    let cursor: { createdAt: string; id: string } | null = null;
    for (let guard = 0; guard < 50; guard += 1) {
      const pool =
        mode === "newest"
          ? all.filter((r) => !cursor || r.createdAt < cursor.createdAt || (r.createdAt === cursor.createdAt && r.id < cursor.id))
          : all.filter((r) => !shown.includes(r.id));
      const page = takePage(rankRoots(pool, ctx(), mode), mode, shown.length, pageSize);
      shown.push(...ids(page.roots));
      cursor = page.next;
      if (!page.hasMore) break;
    }
    return shown;
  }

  const many = Array.from({ length: 47 }, (_, i) =>
    row({
      id: `p${String(i).padStart(2, "0")}`,
      authorId: `u${i % 7}`,
      createdAt: hoursAgo(i % 5 === 0 ? 3 : i * 0.7),
      trustedLikes: (i * 13) % 9,
      body: `Comment ${i} about TypeScript ${i % 3 === 0 ? "monorepos" : "editors"} and speed ${i}`,
    }),
  );

  for (const mode of ["top", "newest"] as const) {
    it(`${mode}: every comment exactly once across pages, nothing missing`, () => {
      const shown = pageThrough(many, mode, 10);
      assert.equal(shown.length, many.length);
      assert.equal(new Set(shown).size, many.length);
    });
  }

  it("the default page size is the configured one", () => {
    assert.equal(takePage(rankRoots(many, ctx(), "top"), "top", 0).roots.length, LIMITS.pageSize);
  });
});

describe("Determinism, caching and the debug view", () => {
  it("the same inputs and snapshot give the same order every time, whatever the input order", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ id: `d${i}`, trustedLikes: i % 4, createdAt: hoursAgo(i % 6) }));
    const first = ids(rankRoots(rows, ctx(), "top"));
    const shuffled = [...rows].reverse();
    assert.deepEqual(ids(rankRoots(shuffled, ctx(), "top")), first);
    assert.deepEqual(ids(rankRoots(rows, ctx(), "top")), first);
  });

  it("nothing is cached: a follow, a removal or a hide shows in the very next ranking", () => {
    const a = row({ id: "a" });
    const b = strong({ id: "b" });
    assert.equal(rankRoots([a, b], ctx(), "top")[0].row.id, "b");
    assert.equal(rankRoots([{ ...b, status: "removed" }, a], ctx(), "top")[0].row.id, "a");
    assert.deepEqual(ids(rankRoots([a, { ...b, viewerHid: true }], ctx(), "top")), ["a"]);
    assert.deepEqual(ids(rankRoots([{ ...a, viewerFollows: true }, b], ctx(), "following")), ["a"]);
  });

  it("the debug rows carry contributions and penalties, rounded", () => {
    const [d] = debugRows(rankRoots([strong({ id: "x", reportCount: 3 })], ctx(), "top"));
    assert.equal(d.id, "x");
    assert.ok(d.contributions.length > 0);
    assert.ok(d.penalties.some((p) => p.name === "many_reports"));
  });
});
