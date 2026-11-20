import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SPONSOR_INCLUDES, SPONSOR_PLACES, SPONSOR_QUESTIONS } from "../offer";
import { MAX_SPONSORED_TOOLS } from "../config";

describe("sponsorship offer (D271)", () => {
  const text = JSON.stringify([SPONSOR_INCLUDES, SPONSOR_PLACES, SPONSOR_QUESTIONS]);

  it("names the real slot count, never a made up one", () => {
    assert.ok(text.includes(`Up to ${MAX_SPONSORED_TOOLS} sponsored tools`));
  });

  it("names no plan, so it reads true whether paid plans are on or paused", () => {
    assert.ok(!/\b(Premium|Elite|Pro plan|developer plan)\b/i.test(text), text);
  });

  it("has no em dash (hard rule 1)", () => {
    assert.ok(!text.includes(String.fromCharCode(0x2014)));
  });
});
