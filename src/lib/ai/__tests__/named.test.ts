import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isNamed, namedIn } from "../named";

describe("cards only for what the answer names (ASK.NOISE)", () => {
  it("matches a name ignoring case and markdown", () => {
    assert.equal(isNamed("**TruLata** costs $399 a month.", "TruLata"), true);
    assert.equal(isNamed("See [TruLata](/tools/trulata) for plans.", "TruLata"), true);
    assert.equal(isNamed("trulata's Growth plan", "TruLata"), true);
  });

  it("needs a whole word", () => {
    assert.equal(isNamed("Version v01 shipped", "v0"), false);
    assert.equal(isNamed("This makes it easy", "Make"), false);
    assert.equal(isNamed("Try v0, then Make.", "v0"), true);
    assert.equal(isNamed("Try v0, then Make.", "Make"), true);
  });

  it("a single tool question keeps only that tool", () => {
    const pool = [
      { name: "TruLata", slug: "trulata" },
      { name: "Amazon Rufus", slug: "amazon-rufus" },
      { name: "Upstash", slug: "upstash" },
    ];
    const answer = "TruLata: Starter $399/mo, Launch $649/mo, Growth $1,199/mo (Growth is 7 days free).";
    assert.deepEqual(
      namedIn(answer, pool, (t) => [t.name]).map((t) => t.slug),
      ["trulata"],
    );
  });

  it("an empty answer names nothing", () => {
    assert.deepEqual(namedIn("", [{ name: "TruLata" }], (t) => [t.name]), []);
  });

  it("handles names with symbols", () => {
    assert.equal(isNamed("Use Claude (Opus 5.5) for this", "Opus 5.5"), true);
    assert.equal(isNamed("C++ tools", "C++"), true);
  });
});
