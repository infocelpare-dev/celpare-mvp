import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BULLET, NUMBERED, collectList } from "../rich-list";

const lines = (s: string) => s.split("\n");

describe("collectList", () => {
  it("keeps a numbered list together across blank lines (the screenshot)", () => {
    const text = lines("1. Cursor, an IDE\n\n2. Cline, an agent\n\n3. v0, UI from a prompt\n\nPick by how you work.");
    const { items, end } = collectList(text, 0, NUMBERED);
    assert.deepEqual(items, ["Cursor, an IDE", "Cline, an agent", "v0, UI from a prompt"]);
    assert.equal(text[end], "", "stops before the closing paragraph");
  });

  it("collects 1. 1. 1. as one list, which the renderer numbers 1, 2, 3", () => {
    const { items } = collectList(lines("1. A\n1. B\n1. C"), 0, NUMBERED);
    assert.equal(items.length, 3);
  });

  it("ends at a paragraph line", () => {
    const { items, end } = collectList(lines("1. A\n2. B\nAfter"), 0, NUMBERED);
    assert.deepEqual(items, ["A", "B"]);
    assert.equal(end, 2);
  });

  it("does not swallow a bullet list after a numbered one", () => {
    const { items } = collectList(lines("1. A\n\n- b"), 0, NUMBERED);
    assert.deepEqual(items, ["A"]);
  });

  it("keeps bullets together across blank lines too", () => {
    const { items } = collectList(lines("- a\n\n- b\n\n\n- c"), 0, BULLET);
    assert.deepEqual(items, ["a", "b", "c"]);
  });

  it("captures the first number written", () => {
    assert.equal(" 4) Four".match(NUMBERED)?.[1], "4");
  });

  it("handles a trailing blank line mid stream", () => {
    const { items, end } = collectList(lines("1. A\n\n"), 0, NUMBERED);
    assert.deepEqual(items, ["A"]);
    assert.equal(end, 1);
  });
});
