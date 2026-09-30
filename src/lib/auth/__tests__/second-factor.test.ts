import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-secret";

const sf = await import("../second-factor");

function token(claims: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(claims)}.sig`;
}

describe("pending login cookie", () => {
  it("round trips the address, lower cased", async () => {
    const v = await sf.signPendingLogin("Info@Celpare.com");
    assert.equal(await sf.readPendingLogin(v), "info@celpare.com");
  });

  it("expires after 15 minutes", async () => {
    const t = Date.now();
    const v = await sf.signPendingLogin("a@b.co", t);
    assert.equal(await sf.readPendingLogin(v, t + 14 * 60_000), "a@b.co");
    assert.equal(await sf.readPendingLogin(v, t + 16 * 60_000), null);
  });

  it("rejects a swapped address or a forged signature", async () => {
    const v = await sf.signPendingLogin("a@b.co");
    const [, exp, sig] = v.split(".");
    const other = Buffer.from("victim@b.co").toString("base64url");
    assert.equal(await sf.readPendingLogin(`${other}.${exp}.${sig}`), null);
    assert.equal(await sf.readPendingLogin(v.slice(0, -2) + "xx"), null);
    assert.equal(await sf.readPendingLogin(undefined), null);
    assert.equal(await sf.readPendingLogin("garbage"), null);
  });
});

describe("second factor cookie", () => {
  it("is bound to one user and one session", async () => {
    const v = await sf.signSecondFactor("user-1", "sess-1");
    assert.equal(await sf.hasSecondFactor(v, "user-1", "sess-1"), true);
    assert.equal(await sf.hasSecondFactor(v, "user-1", "sess-2"), false);
    assert.equal(await sf.hasSecondFactor(v, "user-2", "sess-1"), false);
    assert.equal(await sf.hasSecondFactor(undefined, "user-1", "sess-1"), false);
  });

  it("cannot be made from a pending login cookie", async () => {
    const pending = await sf.signPendingLogin("a@b.co");
    const [, exp, sig] = pending.split(".");
    assert.equal(await sf.hasSecondFactor(`${exp}.${sig}`, "user-1", "sess-1"), false);
  });
});

describe("session claims", () => {
  it("reads the user, session and methods", () => {
    const c = sf.sessionClaims(
      token({ sub: "u", session_id: "s", amr: [{ method: "otp", timestamp: 1 }] }),
    );
    assert.deepEqual(c, { userId: "u", sessionId: "s", methods: ["otp"] });
    assert.equal(sf.sessionClaims(undefined), null);
    assert.equal(sf.sessionClaims("not.a-token"), null);
  });

  it("exempts Google and SSO, and nothing else", () => {
    assert.equal(sf.needsSecondFactor(["oauth"]), false);
    assert.equal(sf.needsSecondFactor(["sso/saml"]), false);
    assert.equal(sf.needsSecondFactor(["password"]), true);
    assert.equal(sf.needsSecondFactor(["otp"]), true);
    assert.equal(sf.needsSecondFactor([]), true);
  });

  it("masks the address for the code screen", () => {
    assert.equal(sf.maskEmail("info@celpare.com"), "in***o@celpare.com");
    assert.equal(sf.maskEmail("ameagmahad@gmail.com"), "am***d@gmail.com");
    assert.equal(sf.maskEmail("abc@x.io"), "a***@x.io");
  });
});
