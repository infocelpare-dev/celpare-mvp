import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { createGoogleProvider, endpointFor, readResponse, type GoogleSettings } from "../providers/google";
import { clearTokenCache, fromBase64, parseServiceAccount, signJwt, toBase64 } from "../providers/google-auth";
import { createMockProvider, providerFrom } from "../providers/index";
import { readVoiceConfig } from "../config";
import { VoiceError } from "../types";
import { audio, recognizeOk, scriptedFetch, testServiceAccount, tokenOk } from "./helpers";

/* Every provider call here is mocked: no test ever reaches Google or costs money. */

async function settings(over: Partial<GoogleSettings> = {}): Promise<GoogleSettings> {
  const { sa } = await testServiceAccount();
  return {
    projectId: "celpare-test",
    credentials: sa,
    location: "eu",
    model: "chirp_3",
    somaliLocation: "europe-west4",
    somaliModel: "chirp_2",
    disabled: [],
    timeoutMs: 2000,
    ...over,
  };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "resolved";
  } catch (err) {
    return err instanceof VoiceError ? err.code : `other:${String(err)}`;
  }
}

beforeEach(() => clearTokenCache());

describe("Google Speech-to-Text V2 adapter", () => {
  it("transcribes English through chirp_3 in eu, with auto language detection and inline base64 audio", async () => {
    const s = await settings();
    const f = scriptedFetch([tokenOk, () => recognizeOk("best AI coding tools for building my SaaS")]);
    const p = createGoogleProvider(s, { fetch: f.fetch, now: () => 1_800_000_000_000 });
    const out = await p.transcribeAudio(audio(), { mimeType: "audio/webm", language: "auto" });

    assert.equal(out.transcript, "best AI coding tools for building my SaaS");
    assert.equal(out.language, "en-us");
    assert.equal(out.confidence, 0.91);

    assert.equal(f.calls[0].url, "https://oauth2.googleapis.com/token");
    assert.equal(f.calls[1].url, "https://eu-speech.googleapis.com/v2/projects/celpare-test/locations/eu/recognizers/_:recognize");
    const body = JSON.parse(String(f.calls[1].init.body));
    assert.equal(body.config.model, "chirp_3");
    assert.deepEqual(body.config.languageCodes, ["auto"]);
    assert.deepEqual(body.config.autoDecodingConfig, {});
    assert.deepEqual(fromBase64(body.content), audio());
    assert.equal((f.calls[1].init.headers as Record<string, string>).Authorization, "Bearer ya29.test-token");
  });

  it("explicit English pins en-US instead of detecting", async () => {
    const f = scriptedFetch([tokenOk, () => recognizeOk("compare Claude GPT and Gemini models")]);
    const p = createGoogleProvider(await settings(), { fetch: f.fetch, now: Date.now });
    await p.transcribeAudio(audio(), { mimeType: "audio/mp4", language: "en-US" });
    assert.deepEqual(JSON.parse(String(f.calls[1].init.body)).config.languageCodes, ["en-US"]);
  });

  it("Somali routes to chirp_2 in europe-west4 with so-SO, and keeps the words untranslated", async () => {
    const f = scriptedFetch([tokenOk, () => recognizeOk("qalab AI ah oo bilaash ah", { languageCode: undefined })]);
    const p = createGoogleProvider(await settings(), { fetch: f.fetch, now: Date.now });
    const out = await p.transcribeAudio(audio(), { mimeType: "audio/webm", language: "so-SO" });
    assert.equal(f.calls[1].url, "https://europe-west4-speech.googleapis.com/v2/projects/celpare-test/locations/europe-west4/recognizers/_:recognize");
    const body = JSON.parse(String(f.calls[1].init.body));
    assert.equal(body.config.model, "chirp_2");
    assert.deepEqual(body.config.languageCodes, ["so-SO"]);
    assert.equal(out.transcript, "qalab AI ah oo bilaash ah");
    assert.equal(out.language, "so-SO", "falls back to the requested language when Google does not say");
  });

  it("a language switched off by configuration is refused before any call", async () => {
    const f = scriptedFetch([tokenOk]);
    const p = createGoogleProvider(await settings({ disabled: ["so-SO"] }), { fetch: f.fetch, now: Date.now });
    assert.equal(p.supports("so-SO"), false);
    assert.equal(await code(p.transcribeAudio(audio(), { mimeType: "audio/webm", language: "so-SO" })), "unsupported_language");
    assert.equal(f.calls.length, 0);
  });

  it("empty audio is refused before any call", async () => {
    const f = scriptedFetch([tokenOk]);
    const p = createGoogleProvider(await settings(), { fetch: f.fetch, now: Date.now });
    assert.equal(await code(p.transcribeAudio(new Uint8Array(0), { mimeType: "audio/webm", language: "auto" })), "empty_audio");
    assert.equal(f.calls.length, 0);
  });

  it("no recognised words is no_speech, not an empty success", async () => {
    const f = scriptedFetch([tokenOk, () => new Response(JSON.stringify({ results: [] }), { status: 200 })]);
    const p = createGoogleProvider(await settings(), { fetch: f.fetch, now: Date.now });
    assert.equal(await code(p.transcribeAudio(audio(), { mimeType: "audio/webm", language: "auto" })), "no_speech");
  });

  it("provider statuses map to safe codes", async () => {
    for (const [status, expected] of [
      [400, "unsupported_audio"],
      [403, "not_configured"],
      [429, "rate_limited"],
      [500, "provider_unavailable"],
      [503, "provider_unavailable"],
    ] as const) {
      clearTokenCache();
      const f = scriptedFetch([tokenOk, () => new Response(JSON.stringify({ error: { message: "projects/celpare-test secret detail" } }), { status })]);
      const p = createGoogleProvider(await settings(), { fetch: f.fetch, now: Date.now });
      assert.equal(await code(p.transcribeAudio(audio(), { mimeType: "audio/webm", language: "auto" })), expected, `status ${status}`);
    }
  });

  it("a provider that never answers times out instead of hanging", async () => {
    const hang = (call: { init: RequestInit }) =>
      new Promise<Response>((_, reject) => call.init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const f = scriptedFetch([tokenOk, hang]);
    const p = createGoogleProvider(await settings({ timeoutMs: 50 }), { fetch: f.fetch, now: Date.now });
    assert.equal(await code(p.transcribeAudio(audio(), { mimeType: "audio/webm", language: "auto" })), "timeout");
  });

  it("a network interruption is provider_unavailable", async () => {
    const f = scriptedFetch([tokenOk, () => Promise.reject(new TypeError("fetch failed"))]);
    const p = createGoogleProvider(await settings(), { fetch: f.fetch, now: Date.now });
    assert.equal(await code(p.transcribeAudio(audio(), { mimeType: "audio/webm", language: "auto" })), "provider_unavailable");
  });

  it("a refused token exchange is a configuration error, and nothing secret leaks into the error", async () => {
    const s = await settings();
    const f = scriptedFetch([() => new Response(JSON.stringify({ error: "invalid_grant", error_description: s.credentials.client_email }), { status: 400 })]);
    const p = createGoogleProvider(s, { fetch: f.fetch, now: Date.now });
    try {
      await p.transcribeAudio(audio(), { mimeType: "audio/webm", language: "auto" });
      assert.fail("should throw");
    } catch (err) {
      assert.ok(err instanceof VoiceError);
      assert.equal(err.code, "not_configured");
      assert.ok(!String(err.message).includes(s.credentials.client_email));
      assert.ok(!String(err.message).includes("PRIVATE"));
    }
  });

  it("the access token is reused until it nears expiry", async () => {
    const s = await settings();
    let now = 1_800_000_000_000;
    const f = scriptedFetch([tokenOk, () => recognizeOk("one"), () => recognizeOk("two"), tokenOk, () => recognizeOk("three")]);
    const p = createGoogleProvider(s, { fetch: f.fetch, now: () => now });
    await p.transcribeAudio(audio(), { mimeType: "audio/webm", language: "auto" });
    await p.transcribeAudio(audio(), { mimeType: "audio/webm", language: "auto" });
    assert.equal(f.calls.filter((c) => c.url.includes("oauth2")).length, 1);
    now += 3_600_000;
    await p.transcribeAudio(audio(), { mimeType: "audio/webm", language: "auto" });
    assert.equal(f.calls.filter((c) => c.url.includes("oauth2")).length, 2);
  });

  it("signs a JWT that verifies with the service account's public key", async () => {
    const { sa, publicKey } = await testServiceAccount();
    const jwt = await signJwt(sa, "https://www.googleapis.com/auth/cloud-platform", 1_800_000_000);
    const [h, c, sig] = jwt.split(".");
    const unb64url = (x: string) => fromBase64(x.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (x.length % 4)) % 4));
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, unb64url(sig), new TextEncoder().encode(`${h}.${c}`));
    assert.equal(ok, true);
    const claims = JSON.parse(new TextDecoder().decode(unb64url(c)));
    assert.equal(claims.iss, sa.client_email);
    assert.equal(claims.aud, "https://oauth2.googleapis.com/token");
    assert.equal(claims.exp - claims.iat, 3600);
  });

  it("reads several results, skips Chirp's zero confidence, and joins the words", () => {
    const out = readResponse({
      results: [{ alternatives: [{ transcript: "find free", confidence: 0 }] }, { alternatives: [{ transcript: " AI video generators " }], languageCode: "en-US" }],
    });
    assert.deepEqual(out, { transcript: "find free AI video generators", language: "en-US", confidence: null });
  });

  it("builds regional and global endpoints", () => {
    assert.equal(endpointFor("p", "global"), "https://speech.googleapis.com/v2/projects/p/locations/global/recognizers/_:recognize");
    assert.equal(endpointFor("p", "us"), "https://us-speech.googleapis.com/v2/projects/p/locations/us/recognizers/_:recognize");
  });
});

describe("Credentials and configuration", () => {
  it("accepts raw JSON and base64 JSON, and refuses anything else without echoing it", async () => {
    const { sa } = await testServiceAccount();
    const json = JSON.stringify({ type: "service_account", ...sa });
    assert.equal(parseServiceAccount(json).client_email, sa.client_email);
    assert.equal(parseServiceAccount(toBase64(new TextEncoder().encode(json))).client_email, sa.client_email);
    assert.throws(() => parseServiceAccount('{"type":"authorized_user"}'), /not a service account/);
    assert.throws(() => parseServiceAccount('{"client_email":"x"}'), /missing/);
    try {
      parseServiceAccount("not-json-secret-value-123");
    } catch (err) {
      assert.ok(!String(err).includes("secret-value"));
    }
  });

  it("is off unless asked for, with safe defaults and clamped limits", () => {
    const c = readVoiceConfig({});
    assert.equal(c.provider, "none");
    assert.equal(c.maxSeconds, 15);
    assert.equal(c.google.location, "eu");
    assert.equal(c.google.model, "chirp_3");
    assert.equal(c.google.somaliModel, "chirp_2");
    const clamped = readVoiceConfig({ VOICE_MAX_SECONDS: "600", VOICE_MAX_BYTES: "1", GOOGLE_SPEECH_DISABLED_LANGUAGES: "so-SO, xx" });
    assert.equal(clamped.maxSeconds, 55, "below Google's 60 s synchronous limit");
    assert.equal(clamped.maxBytes, 50_000);
    assert.deepEqual(clamped.google.disabled, ["so-SO"]);
  });

  it("explains what is missing by variable name, never by value", async () => {
    assert.equal((await providerFrom(readVoiceConfig({}))).provider, null);
    const noProject = await providerFrom(readVoiceConfig({ VOICE_SEARCH_PROVIDER: "google" }));
    assert.ok(!noProject.provider && /GOOGLE_CLOUD_PROJECT_ID/.test(noProject.reason));
    const noCreds = await providerFrom(readVoiceConfig({ VOICE_SEARCH_PROVIDER: "google", GOOGLE_CLOUD_PROJECT_ID: "p" }));
    assert.ok(!noCreds.provider && /GOOGLE_SPEECH_CREDENTIALS_JSON/.test(noCreds.reason));
    const bad = await providerFrom(readVoiceConfig({ VOICE_SEARCH_PROVIDER: "google", GOOGLE_CLOUD_PROJECT_ID: "p", GOOGLE_SPEECH_CREDENTIALS_JSON: "{oops super-secret-value" }));
    assert.ok(!bad.provider && !bad.reason.includes("super-secret-value"));
    const { sa } = await testServiceAccount();
    const good = await providerFrom(readVoiceConfig({ VOICE_SEARCH_PROVIDER: "google", GOOGLE_CLOUD_PROJECT_ID: "p", GOOGLE_SPEECH_CREDENTIALS_JSON: JSON.stringify(sa) }));
    assert.equal(good.provider?.id, "google_speech_v2");
  });

  it("the mock provider needs no account and refuses empty audio", async () => {
    const m = createMockProvider("free AI video generators");
    assert.equal((await m.transcribeAudio(audio(), { mimeType: "audio/webm", language: "auto" })).transcript, "free AI video generators");
    assert.equal(await code(m.transcribeAudio(new Uint8Array(0), { mimeType: "audio/webm", language: "auto" })), "empty_audio");
  });
});
