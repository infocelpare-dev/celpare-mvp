import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { returnPath, withNext } = await import("../return-to");

describe("the page to return to after log in or sign up", () => {
  it("keeps a page on this site, with its query", () => {
    assert.equal(returnPath("/tools/trulata"), "/tools/trulata");
    assert.equal(returnPath("/compare?ids=a,b"), "/compare?ids=a,b");
    assert.equal(returnPath("/community/abc#c1"), "/community/abc#c1");
    assert.equal(returnPath("/developer/submit"), "/developer/submit");
  });

  it("refuses another host however it is written", () => {
    for (const raw of ["https://evil.com", "//evil.com", "/\\evil.com", "@evil.com", ".evil.com", "evil.com/x"]) {
      assert.equal(returnPath(raw), null, raw);
    }
  });

  it("refuses the sign in pages and the /app funnel, which would loop", () => {
    for (const raw of ["/login", "/signup?next=/x", "/get-started", "/verify?email=a", "/app", "/welcome", "/auth/callback", "/api/health", "/forgot-password"]) {
      assert.equal(returnPath(raw), null, raw);
    }
    assert.equal(returnPath("/apps"), "/apps");
  });

  it("refuses nothing useful", () => {
    assert.equal(returnPath(undefined), null);
    assert.equal(returnPath(""), null);
    assert.equal(returnPath(["/x"]), null);
    assert.equal(returnPath(`/${"a".repeat(1001)}`), null);
  });
});

describe("attaching next to a link", () => {
  it("adds it with ? or &", () => {
    assert.equal(withNext("/login", "/tools/klap"), "/login?next=%2Ftools%2Fklap");
    assert.equal(withNext("/verify?email=a%40b.c", "/messages"), "/verify?email=a%40b.c&next=%2Fmessages");
  });

  it("leaves the link alone when next is not usable", () => {
    assert.equal(withNext("/signup", undefined), "/signup");
    assert.equal(withNext("/signup", "//evil.com"), "/signup");
    assert.equal(withNext("/app", "/login"), "/app");
  });
});
