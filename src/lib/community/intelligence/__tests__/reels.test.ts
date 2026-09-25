import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceReelSession,
  newReelSession,
  nextReel,
  previousReel,
  reelsFeed,
  selectNextReel,
  sequenceReels,
} from "../reels";
import type { RankedItem } from "../types";
import { H, NOW, cand, control, ctx, item, signals } from "./fixtures";

const video = (over: Parameters<typeof item>[0] = {}) => item({ media: "video", ...over });
const ranked = (i: ReturnType<typeof item>, score: number): RankedItem => ({ item: i, score, reasons: [], sources: ["video"] });

const input = (over: Partial<Parameters<typeof reelsFeed>[0]> = {}) => ({
  context: ctx({ surface: "reels", algorithm: "reels_v1" }),
  candidates: [],
  profile: null,
  signals: new Map(),
  assignment: control,
  viewerKey: "viewer",
  ...over,
});

describe("Reels (reels_v2)", () => {
  it("ranks by watching: a completed, rewatched video beats one with more likes that people skip", () => {
    /* Past the distribution test stage, so audience sampling plays no part. */
    const watched = video({ authorId: "a1", createdAt: NOW - 50 * H });
    const liked = video({ authorId: "a2", createdAt: NOW - 50 * H });
    const sig = new Map([
      [
        watched.id,
        signals(
          { impression: [0, 6, 6, 0, 0, 0], video_start: [0, 6, 6, 0, 0, 0], complete: [0, 5, 4, 0, 0, 0], rewatch: [0, 2, 1, 0, 0, 0], watch: [0, 6, 6, 0, 0, 0] },
          { avg: { watch: 92 } },
        ),
      ],
      [
        liked.id,
        signals(
          { impression: [0, 6, 6, 0, 0, 0], video_start: [0, 6, 6, 0, 0, 0], like: [0, 3, 3, 0, 0, 0], skip: [0, 5, 5, 0, 0, 0], watch: [0, 6, 6, 0, 0, 0] },
          { avg: { watch: 12 } },
        ),
      ],
    ]);
    const res = reelsFeed(input({ candidates: [cand(liked, "video"), cand(watched, "video")], signals: sig }));
    assert.equal(res.algorithm, "reels_v2");
    assert.equal(res.items[0].item.id, watched.id);
  });

  it("only ever contains videos", () => {
    const res = reelsFeed(input({ candidates: [cand(item({ media: "text" })), cand(video())] }));
    assert.ok(res.items.every((r) => r.item.media === "video"));
  });

  it("opens on the requested video, even when it would not rank first", () => {
    const vids = Array.from({ length: 6 }, (_, i) => video({ authorId: `a${i}`, createdAt: NOW - i * H }));
    const oldest = vids[5];
    const res = reelsFeed(input({ candidates: vids.map((v) => cand(v, "video")) }), oldest.id);
    assert.equal(res.items[0].item.id, oldest.id);
    assert.equal(new Set(res.items.map((r) => r.item.id)).size, res.items.length, "no repeats");
  });

  it("puts a video the session already watched last, and never shows one twice", () => {
    const a = video({ authorId: "a1" });
    const b = video({ authorId: "a2" });
    const c = video({ authorId: "a3" });
    const res = reelsFeed(
      input({
        candidates: [a, b, c].map((v) => cand(v, "video")),
        sessionEvents: [{ item: a, at: NOW - 60_000, percentWatched: 100 }],
      }),
    );
    const ids = res.items.map((r) => r.item.id);
    assert.equal(ids[ids.length - 1], a.id, "the watched video is last, not missing");
    assert.equal(new Set(ids).size, ids.length, "no repeats");
  });

  it("selectNextReel avoids the creator just watched", () => {
    const x1 = video({ authorId: "x" });
    const x2 = video({ authorId: "x" });
    const y = video({ authorId: "y" });
    const pool = [ranked(x1, 1), ranked(x2, 0.95), ranked(y, 0.6)];
    const s1 = advanceReelSession(newReelSession("s"), pool[0]);
    assert.equal(selectNextReel(pool, s1)?.item.id, y.id);
  });

  it("breaks up long runs of one topic", () => {
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => ranked(video({ authorId: `a${i}`, topicId: "same" }), 1 - i * 0.01)),
      ranked(video({ authorId: "z", topicId: "other" }), 0.7),
    ];
    const seq = sequenceReels(pool, newReelSession("s"), 6);
    const topics = seq.map((r) => r.item.topicId);
    for (let i = 2; i < 4; i++) {
      assert.ok(!(topics[i] === "same" && topics[i - 1] === "same" && topics[i - 2] === "same" && topics.slice(i).includes("other")));
    }
    assert.ok(topics.slice(0, 3).includes("other"), "the other topic is pulled forward to break the run");
  });

  it("swipe aways in this session lower the next picks from that creator", () => {
    const skipped = video({ authorId: "boring", topicId: "t1" });
    /* Past the test stage, so audience sampling plays no part. */
    const sibling = video({ authorId: "boring", topicId: "t1", createdAt: NOW - 50 * H });
    const other = video({ authorId: "fresh", topicId: "t2", createdAt: NOW - 50 * H });
    const res = reelsFeed(
      input({
        candidates: [sibling, other].map((v) => cand(v, "video")),
        sessionEvents: [{ item: skipped, at: NOW - 30_000, percentWatched: 5, skipped: true }],
      }),
    );
    assert.equal(res.items[0].item.id, other.id);
  });

  it("next and previous walk the sequence", () => {
    const list = [ranked(video(), 1), ranked(video(), 0.9), ranked(video(), 0.8)];
    assert.equal(nextReel(list, 0)?.item.id, list[1].item.id);
    assert.equal(previousReel(list, 1)?.item.id, list[0].item.id);
    assert.equal(previousReel(list, 0), null);
    assert.equal(nextReel(list, 2), null);
  });
});
