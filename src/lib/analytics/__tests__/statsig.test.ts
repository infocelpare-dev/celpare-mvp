import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUser,
  cleanCountry,
  cleanMetadata,
  cleanPath,
  isBot,
  referrerHost,
  tierFor,
  utcDay,
  visitorId,
} from "../../statsig/core";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

describe("visitorId", () => {
  it("is stable within a day and changes the next day", () => {
    const a = visitorId("s", "2026-11-11", "1.2.3.4", CHROME);
    assert.equal(a, visitorId("s", "2026-11-11", "1.2.3.4", CHROME));
    assert.notEqual(a, visitorId("s", "2026-11-12", "1.2.3.4", CHROME));
    assert.notEqual(a, visitorId("s", "2026-11-11", "1.2.3.5", CHROME));
    assert.notEqual(a, visitorId("other", "2026-11-11", "1.2.3.4", CHROME));
  });

  it("never contains the address", () => {
    const id = visitorId("s", "2026-11-11", "203.0.113.9", CHROME);
    assert.match(id, /^v_[0-9a-f]{24}$/);
    assert.ok(!id.includes("203"));
  });

  it("uses the UTC day", () => {
    assert.equal(utcDay(new Date("2026-11-11T23:59:59Z")), "2026-11-11");
  });
});

describe("isBot", () => {
  it("lets a browser through", () => {
    assert.equal(isBot(CHROME), false);
  });
  it("stops crawlers, scripts and empty agents", () => {
    for (const ua of ["Googlebot/2.1", "curl/8.4", "HeadlessChrome/141", "facebookexternalhit/1.1", "", null, "x"]) {
      assert.equal(isBot(ua), true, String(ua));
    }
  });
});

describe("cleanPath", () => {
  it("drops query and hash and trailing slashes", () => {
    assert.equal(cleanPath("/reset-password?token=abc#x"), "/reset-password");
    assert.equal(cleanPath("/tools/"), "/tools");
    assert.equal(cleanPath("/"), "/");
  });
  it("replaces ids", () => {
    assert.equal(cleanPath("/messages/0b6f4c1e-1111-4a2b-9c3d-123456789abc"), "/messages/:id");
  });
  it("refuses other origins, api, admin and odd input", () => {
    for (const p of ["//evil.com", "https://x.com/", "/api/ai/chat", "/admin", "/admin/revenue", "/a b", 42, null, "/<script>"]) {
      assert.equal(cleanPath(p), null, String(p));
    }
  });
});

describe("referrerHost", () => {
  it("keeps another site's host only", () => {
    assert.equal(referrerHost("https://www.google.com/search?q=x", "celpare.com"), "google.com");
    assert.equal(referrerHost("https://celpare.com/explore", "celpare.com"), null);
    assert.equal(referrerHost("https://www.celpare.com/", "celpare.com"), null);
    assert.equal(referrerHost("javascript:alert(1)", "celpare.com"), null);
    assert.equal(referrerHost("", "celpare.com"), null);
  });
});

describe("user and metadata", () => {
  it("uses the account when signed in and the daily id otherwise", () => {
    const anon = buildUser({ userId: null, visitor: "v_1", tier: "production" });
    assert.equal(anon.userID, "v_1");
    assert.equal(anon.custom.signed_in, false);
    const known = buildUser({ userId: "u", visitor: "v_1", country: "SO", userAgent: CHROME, tier: "production" });
    assert.equal(known.userID, "u");
    assert.equal(known.customIDs.stableID, "v_1");
    assert.equal(known.country, "SO");
  });
  it("cleans countries, tiers and metadata", () => {
    assert.equal(cleanCountry("so"), "SO");
    assert.equal(cleanCountry("XX"), undefined);
    assert.equal(cleanCountry("Somalia"), undefined);
    assert.equal(tierFor("production"), "production");
    assert.equal(tierFor("preview"), "staging");
    assert.equal(tierFor(undefined), "development");
    assert.deepEqual(cleanMetadata({ a: 1, b: null, c: "", d: true }), { a: "1", d: "true" });
    assert.equal(cleanMetadata({ b: null }), undefined);
  });
});
