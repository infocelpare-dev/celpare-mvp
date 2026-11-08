import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { edgeVerdict, sameSecret, clientIpFrom, TRUSTED_HEADER } = await import("../origin");

const VALUE = "edge-value-used-only-in-tests";

describe("edgeVerdict", () => {
  it("accepts the matching header when a secret is set", () => {
    assert.equal(edgeVerdict(VALUE, { EDGE_SECRET: VALUE, VERCEL_ENV: "production" }), "ok");
  });

  it("rejects a missing, empty or wrong header when a secret is set", () => {
    const env = { EDGE_SECRET: VALUE, VERCEL_ENV: "production" };
    assert.equal(edgeVerdict(null, env), "reject");
    assert.equal(edgeVerdict(undefined, env), "reject");
    assert.equal(edgeVerdict("", env), "reject");
    assert.equal(edgeVerdict("wrong", env), "reject");
    assert.equal(edgeVerdict(VALUE + "x", env), "reject");
  });

  it("enforces the secret outside production too, once it is set", () => {
    assert.equal(edgeVerdict("wrong", { EDGE_SECRET: VALUE, VERCEL_ENV: "preview" }), "reject");
  });

  it("fails closed on Vercel production with no secret configured", () => {
    assert.equal(edgeVerdict(VALUE, { VERCEL_ENV: "production" }), "reject");
    assert.equal(edgeVerdict(null, { EDGE_SECRET: "   ", VERCEL_ENV: "production" }), "reject");
  });

  it("is off locally and on the Cloudflare Worker, where no secret exists", () => {
    assert.equal(edgeVerdict(null, {}), "off");
    assert.equal(edgeVerdict(null, { VERCEL_ENV: "preview" }), "off");
  });
});

describe("sameSecret", () => {
  it("compares values of different lengths without throwing", () => {
    assert.equal(sameSecret("a", "a much longer secret"), false);
    assert.equal(sameSecret("same", "same"), true);
  });
});

describe("clientIpFrom", () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it("trusts cf-connecting-ip only when the proxy marked the request", () => {
    assert.equal(clientIpFrom(h({ "cf-connecting-ip": "1.1.1.1", [TRUSTED_HEADER]: "1", "x-real-ip": "2.2.2.2" })), "1.1.1.1");
    assert.equal(clientIpFrom(h({ "cf-connecting-ip": "1.1.1.1", "x-real-ip": "2.2.2.2" })), "2.2.2.2");
    assert.equal(clientIpFrom(h({ "cf-connecting-ip": "1.1.1.1", [TRUSTED_HEADER]: "yes", "x-real-ip": "2.2.2.2" })), "2.2.2.2");
  });

  it("falls back to the leftmost X-Forwarded-For, then null", () => {
    assert.equal(clientIpFrom(h({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" })), "3.3.3.3");
    assert.equal(clientIpFrom(h({})), null);
  });
});
