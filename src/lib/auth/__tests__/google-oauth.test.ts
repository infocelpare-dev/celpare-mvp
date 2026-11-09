import assert from "node:assert/strict";
import { describe, it } from "node:test";

const g = await import("../google-oauth");

const HEX = "a".repeat(64);
const HEX2 = "b".repeat(64);

describe("google config", () => {
  it("needs both the client id and the secret", () => {
    assert.equal(g.googleConfig({}), null);
    assert.equal(g.googleConfig({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: "id" }), null);
    assert.equal(g.googleConfig({ GOOGLE_CLIENT_SECRET: "s" }), null);
    assert.equal(g.googleConfig({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: " ", GOOGLE_CLIENT_SECRET: "s" }), null);
    assert.deepEqual(g.googleConfig({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: " id ", GOOGLE_CLIENT_SECRET: "s" }), {
      clientId: "id",
      clientSecret: "s",
    });
  });
});

describe("state cookie", () => {
  it("round trips", () => {
    const s = { state: HEX, nonce: HEX2, next: "/community?tab=top" };
    assert.deepEqual(g.decodeState(g.encodeState(s)), s);
  });

  it("refuses anything malformed", () => {
    assert.equal(g.decodeState(undefined), null);
    assert.equal(g.decodeState("not json"), null);
    assert.equal(g.decodeState(encodeURIComponent(JSON.stringify({ state: "short", nonce: HEX2, next: "/" }))), null);
    assert.equal(g.decodeState(encodeURIComponent(JSON.stringify({ state: HEX, nonce: HEX2 }))), null);
    assert.equal(g.decodeState(encodeURIComponent(JSON.stringify({ state: HEX.toUpperCase(), nonce: HEX2, next: "/" }))), null);
  });

  it("compares states exactly", () => {
    assert.equal(g.sameState(HEX, HEX), true);
    assert.equal(g.sameState(HEX, HEX2), false);
    assert.equal(g.sameState(HEX, HEX.slice(1)), false);
    assert.equal(g.sameState(null, HEX), false);
    assert.equal(g.sameState("", ""), false);
  });
});

describe("authorize url", () => {
  it("goes to Google with our own callback and the hashed nonce", async () => {
    const hashed = await g.sha256Hex("raw");
    const u = new URL(g.authorizeUrl({ clientId: "cid", origin: "https://celpare.com", state: HEX, hashedNonce: hashed }));
    assert.equal(u.origin + u.pathname, g.GOOGLE_AUTHORIZE_URL);
    assert.equal(u.searchParams.get("redirect_uri"), "https://celpare.com/auth/google/callback");
    assert.equal(u.searchParams.get("response_type"), "code");
    assert.equal(u.searchParams.get("state"), HEX);
    assert.equal(u.searchParams.get("nonce"), hashed);
    assert.notEqual(u.searchParams.get("nonce"), "raw");
    assert.equal(u.searchParams.get("scope"), "openid email profile");
  });

  it("hashes the nonce the way Supabase checks it (SHA-256, hex)", async () => {
    assert.equal(
      await g.sha256Hex("abc"),
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("code exchange", () => {
  const config = { clientId: "cid", clientSecret: "sec" };

  it("posts the code with the secret and returns the id token", async () => {
    let sent: URLSearchParams | null = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams;
      return new Response(JSON.stringify({ id_token: "tok" }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await g.exchangeCode({ code: "c", origin: "https://celpare.com", config, fetchImpl });
    assert.deepEqual(r, { idToken: "tok" });
    assert.equal(sent!.get("client_secret"), "sec");
    assert.equal(sent!.get("redirect_uri"), "https://celpare.com/auth/google/callback");
    assert.equal(sent!.get("grant_type"), "authorization_code");
  });

  it("reports a refusal without throwing", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as unknown as typeof fetch;
    const r = await g.exchangeCode({ code: "c", origin: "https://celpare.com", config, fetchImpl });
    assert.ok("error" in r && r.error.includes("invalid_grant"));
  });

  it("reports a network failure without throwing", async () => {
    const fetchImpl = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const r = await g.exchangeCode({ code: "c", origin: "https://celpare.com", config, fetchImpl });
    assert.deepEqual(r, { error: "offline" });
  });
});
