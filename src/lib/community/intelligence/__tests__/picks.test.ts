import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PICKS, choosePinnedPick, pinFirst, type PinContext } from "../../picks";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const DAY = 24 * 60 * 60_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const ctx = (over: Partial<PinContext> = {}): PinContext => ({
  now: NOW,
  viewerId: "viewer",
  notInterested: new Set(),
  mutedAuthors: new Set(),
  ...over,
});

describe("Picked by Celpare (D270)", () => {
  it("pins the newest pick", () => {
    const got = choosePinnedPick(
      [
        { postId: "old", authorId: "a", pickedAt: ago(3) },
        { postId: "new", authorId: "b", pickedAt: ago(1) },
      ],
      ctx(),
    );
    assert.equal(got, "new");
  });

  it("does not pin a pick older than PIN_DAYS", () => {
    const got = choosePinnedPick([{ postId: "p", authorId: "a", pickedAt: ago(PICKS.PIN_DAYS + 0.1) }], ctx());
    assert.equal(got, null);
  });

  it("skips the viewer's own post and falls back to the next pick", () => {
    const got = choosePinnedPick(
      [
        { postId: "mine", authorId: "viewer", pickedAt: ago(0.5) },
        { postId: "theirs", authorId: "a", pickedAt: ago(2) },
      ],
      ctx(),
    );
    assert.equal(got, "theirs");
  });

  it("never overrides not interested or a muted author", () => {
    const picks = [
      { postId: "p1", authorId: "a", pickedAt: ago(1) },
      { postId: "p2", authorId: "muted", pickedAt: ago(2) },
    ];
    assert.equal(choosePinnedPick(picks, ctx({ notInterested: new Set(["p1"]), mutedAuthors: new Set(["muted"]) })), null);
  });

  it("pins for a signed out visitor", () => {
    assert.equal(choosePinnedPick([{ postId: "p", authorId: "a", pickedAt: ago(1) }], ctx({ viewerId: null })), "p");
  });

  it("puts the pinned post first exactly once", () => {
    const posts = [{ id: "x" }, { id: "p" }, { id: "y" }];
    assert.deepEqual(pinFirst(posts, { id: "p" }).map((p) => p.id), ["p", "x", "y"]);
    assert.deepEqual(pinFirst(posts, null).map((p) => p.id), ["x", "p", "y"]);
  });
});
