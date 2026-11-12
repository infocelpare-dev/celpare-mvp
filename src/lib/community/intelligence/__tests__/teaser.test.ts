import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FeedPost } from "../../queries";
import { toTeasers } from "../../teaser";

function post(id: string, body: string, extra: Partial<FeedPost> = {}): FeedPost {
  return {
    id,
    author_id: "a",
    body,
    link_url: null,
    topic_id: null,
    created_at: "2026-11-12T08:00:00Z",
    like_count: 0,
    comment_count: 0,
    save_count: 0,
    repost_count: 0,
    view_count: 0,
    status: "visible",
    kind: "discussion" as FeedPost["kind"],
    tool_id: null,
    model_id: null,
    posted_as: "person",
    author: { id: "a", username: "nadia", full_name: "Nadia K", avatar_url: null },
    topic: null,
    tool: null,
    model: null,
    media: [],
    ...extra,
  };
}

const byAuthor = (p: FeedPost) => p.author?.full_name ?? "Someone";

describe("toTeasers (Ask home community strip, D267)", () => {
  it("keeps order, takes three, and links each post", () => {
    const t = toTeasers([post("1", "one"), post("2", "two"), post("3", "three"), post("4", "four")], byAuthor);
    assert.deepEqual(t.map((x) => x.id), ["1", "2", "3"]);
    assert.equal(t[0].href, "/community/1");
    assert.equal(t[0].name, "Nadia K");
  });

  it("skips posts with no text and collapses whitespace", () => {
    const t = toTeasers([post("1", "   "), post("2", "a\n\n  b")], byAuthor);
    assert.deepEqual(t.map((x) => [x.id, x.excerpt]), [["2", "a b"]]);
  });

  it("cuts long text with an ellipsis", () => {
    const [t] = toTeasers([post("1", "x".repeat(400))], byAuthor);
    assert.equal(t.excerpt.length, 160);
    assert.ok(t.excerpt.endsWith("…"));
  });

  it("takes the byline from nameOf", () => {
    const [t] = toTeasers([post("1", "launch")], () => "Klap");
    assert.equal(t.name, "Klap");
  });
});
