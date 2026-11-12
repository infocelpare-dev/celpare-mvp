import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { afterSignOutPath } = await import("../after-sign-out");

const O = "https://celpare.com";

describe("where Log out leaves you", () => {
  it("stays on a page a guest can read", () => {
    assert.equal(afterSignOutPath(`${O}/community/abc`, O), "/community/abc");
    assert.equal(afterSignOutPath(`${O}/u/nadia`, O), "/u/nadia");
    assert.equal(afterSignOutPath(`${O}/compare?ids=a,b`, O), "/compare?ids=a,b");
    assert.equal(afterSignOutPath(`${O}/tools/claude/`, O), "/tools/claude");
  });

  it("goes to Ask from a page that is the account", () => {
    for (const p of ["/profile", "/profile/edit", "/settings", "/settings/billing", "/messages/x", "/notifications", "/admin", "/plans", "/community/new"]) {
      assert.equal(afterSignOutPath(`${O}${p}`, O), "/ask", p);
    }
  });

  it("never lands on the landing page or a sign in form", () => {
    for (const p of ["/", "/login", "/signup", "/verify"]) {
      assert.equal(afterSignOutPath(`${O}${p}`, O), "/ask", p);
    }
  });

  it("does not treat a lookalike path as an account page", () => {
    assert.equal(afterSignOutPath(`${O}/profiles-of-ai`, O), "/profiles-of-ai");
  });

  it("refuses another origin or junk", () => {
    assert.equal(afterSignOutPath("https://evil.example/community", O), "/ask");
    assert.equal(afterSignOutPath("https://celpare.com.evil.example/x", O), "/ask");
    assert.equal(afterSignOutPath("not a url", O), "/ask");
    assert.equal(afterSignOutPath(null, O), "/ask");
  });
});
