import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { botQueryRedirect, isBot } = await import("../bots");

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const at = (path: string) => new URL(`https://celpare.com${path}`);

describe("botQueryRedirect", () => {
  it("sends a crawler on a compare or search combination to the plain page", () => {
    assert.equal(botQueryRedirect(at("/compare?items=tool:a,tool:b"), GOOGLEBOT)?.toString(), "https://celpare.com/compare");
    assert.equal(botQueryRedirect(at("/search?q=video"), GOOGLEBOT)?.toString(), "https://celpare.com/search");
    assert.equal(botQueryRedirect(at("/compare?items=x"), "")?.toString(), "https://celpare.com/compare");
  });

  it("leaves people alone", () => {
    assert.equal(botQueryRedirect(at("/compare?items=tool:a,tool:b"), CHROME), null);
    assert.equal(botQueryRedirect(at("/search?q=video"), CHROME), null);
  });

  it("leaves plain pages, Next's own marker and other paths alone", () => {
    assert.equal(botQueryRedirect(at("/compare"), GOOGLEBOT), null);
    assert.equal(botQueryRedirect(at("/compare?_rsc=abc"), GOOGLEBOT), null);
    assert.equal(botQueryRedirect(at("/explore?tab=tools"), GOOGLEBOT), null);
    assert.equal(botQueryRedirect(at("/tools/notion?ref=x"), GOOGLEBOT), null);
  });
});

describe("isBot from lib/edge", () => {
  it("is the same rule the analytics use", () => {
    assert.equal(isBot(CHROME), false);
    assert.equal(isBot(GOOGLEBOT), true);
    assert.equal(isBot(null), true);
  });
});
