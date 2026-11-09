import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* The @mention text helpers (lib/community/mentions.ts). Kept beside the
   community tests so the existing test run covers them. */
const m = await import("../../mentions");

describe("splitMentions", () => {
  it("finds mentions and keeps the text around them", () => {
    assert.deepEqual(m.splitMentions("hi @Ana_1, look"), [
      { kind: "text", text: "hi " },
      { kind: "mention", username: "ana_1", text: "@Ana_1" },
      { kind: "text", text: ", look" },
    ]);
  });

  it("does not treat an email address as a mention", () => {
    assert.deepEqual(m.splitMentions("mail ana@celpare.com"), [{ kind: "text", text: "mail ana@celpare.com" }]);
  });

  it("needs two characters and stops at thirty", () => {
    assert.equal(m.splitMentions("@a").filter((p) => p.kind === "mention").length, 0);
    assert.equal(m.splitMentions(`@${"a".repeat(31)}`).filter((p) => p.kind === "mention").length, 0);
    assert.equal(m.splitMentions(`@${"a".repeat(30)}`).filter((p) => p.kind === "mention").length, 1);
  });

  it("finds a mention at the start and after a line break", () => {
    const parts = m.splitMentions("@sam\n@tomo");
    assert.deepEqual(parts.filter((p) => p.kind === "mention").map((p) => (p as { username: string }).username), ["sam", "tomo"]);
  });
});

describe("mentionAtCaret", () => {
  it("sees a mention being typed", () => {
    assert.deepEqual(m.mentionAtCaret("hello @an", 9), { start: 6, query: "an" });
    assert.deepEqual(m.mentionAtCaret("@", 1), { start: 0, query: "" });
  });

  it("ignores an @ inside a word or an address", () => {
    assert.equal(m.mentionAtCaret("ana@cel", 7), null);
    assert.equal(m.mentionAtCaret("hello @an ", 10), null);
  });
});

describe("insertMention", () => {
  it("replaces what was typed and adds a space", () => {
    assert.deepEqual(m.insertMention("hi @an", 3, 6, "ana"), { text: "hi @ana ", caret: 8 });
  });

  it("replaces the rest of the word after the caret too", () => {
    assert.deepEqual(m.insertMention("hi @an there", 3, 5, "ana"), { text: "hi @ana there", caret: 8 });
  });
});
