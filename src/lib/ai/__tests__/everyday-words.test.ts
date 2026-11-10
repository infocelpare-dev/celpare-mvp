import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EVERYDAY_WORDS, toCatalogueWords } from "../everyday-words";

describe("everyday words in the catalogue's words", () => {
  it("rewrites the photo question the truth pass failed on", () => {
    assert.equal(
      toCatalogueWords("Is there an AI that can make my grandma's old photo move?"),
      "Is there an AI that can make my grandma's old image video motion?",
    );
  });

  it("matches whole words only, any case", () => {
    assert.equal(toCatalogueWords("Photos for a photographer"), "image for a photographer");
    assert.equal(toCatalogueWords("PDF"), "document");
    assert.equal(toCatalogueWords("removed"), "removed");
  });

  it("leaves a question with no everyday words exactly as it was", () => {
    const q = "Which AI answers with real sources so it doesn't make things up?";
    assert.equal(toCatalogueWords(q), q);
  });

  it("never rewrites a word into itself or into another entry", () => {
    for (const [from, to] of Object.entries(EVERYDAY_WORDS)) {
      assert.equal(from, from.toLowerCase(), `${from} must be lowercase`);
      for (const word of to.split(" ")) {
        assert.equal(EVERYDAY_WORDS[word], undefined, `${from} -> ${word} would rewrite again`);
      }
    }
  });

  it("keeps the words the live catalogue already uses out of the map", () => {
    for (const used of ["animate", "animation", "pdfs", "voiceover", "tune", "image", "video"]) {
      assert.equal(EVERYDAY_WORDS[used], undefined, used);
    }
  });
});
