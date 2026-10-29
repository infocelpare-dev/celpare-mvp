import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleCapabilities, handleTranscribe, readCapped, type HandlerDeps } from "../handler";
import { readVoiceConfig } from "../config";
import { createMockProvider } from "../providers/index";
import { VoiceError, type SpeechProvider } from "../types";
import { audio } from "./helpers";

/* The endpoint, end to end, with every dependency faked. */

function deps(over: Partial<HandlerDeps> = {}, logs: string[] = []): HandlerDeps {
  return {
    config: readVoiceConfig({ VOICE_MAX_BYTES: "100000", VOICE_MAX_SECONDS: "15" }),
    userId: async () => "user-1",
    limit: async () => ({ ok: true }),
    provider: async () => createMockProvider("find AI tools that work offline"),
    log: (event, detail) => logs.push(`${event} ${JSON.stringify(detail)}`),
    ...over,
  };
}

function post(body: BodyInit | null, headers: Record<string, string> = {}, query = "?lang=auto") {
  return new Request(`https://celpare.test/api/voice/transcribe${query}`, {
    method: "POST",
    body,
    headers: { "content-type": "audio/webm;codecs=opus", ...headers },
    // @ts-expect-error Node needs duplex for a streamed body.
    duplex: "half",
  });
}

async function call(req: Request, d: HandlerDeps) {
  const res = await handleTranscribe(req, d);
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, headers: res.headers };
}

describe("POST /api/voice/transcribe", () => {
  it("returns the transcript, the language and no store header", async () => {
    const r = await call(post(audio()), deps());
    assert.equal(r.status, 200);
    assert.equal(r.body.transcript, "find AI tools that work offline");
    assert.equal(r.body.language, "en-US");
    assert.equal(r.headers.get("cache-control"), "no-store");
  });

  it("is refused when no provider is configured", async () => {
    const r = await call(post(audio()), deps({ provider: async () => null }));
    assert.equal(r.status, 503);
    assert.equal(r.body.error, "not_configured");
  });

  it("requires a signed in person, before reading any audio", async () => {
    let read = false;
    /* highWaterMark 0: the stream pulls only when somebody reads, so `read`
       says whether the handler touched the body. */
    const body = new ReadableStream(
      {
        pull(c) {
          read = true;
          c.enqueue(audio());
          c.close();
        },
      },
      { highWaterMark: 0 },
    );
    const r = await call(post(body), deps({ userId: async () => null }));
    assert.equal(r.status, 401);
    assert.equal(r.body.error, "auth_required");
    assert.equal(read, false);
  });

  it("is rate limited per person, with Retry-After", async () => {
    const r = await call(post(audio()), deps({ limit: async () => ({ ok: false, scope: "minute" }) }));
    assert.equal(r.status, 429);
    assert.equal(r.body.error, "rate_limited");
    assert.equal(r.headers.get("retry-after"), "60");
  });

  it("refuses a content type that is not recorded audio", async () => {
    for (const ct of ["application/json", "text/plain", "audio/wav", "multipart/form-data", ""]) {
      const r = await call(post(audio(), { "content-type": ct }), deps());
      assert.equal(r.status, 415, ct);
      assert.equal(r.body.error, "invalid_content_type");
    }
  });

  it("accepts every format browsers record (WebM, Ogg, MP4, M4A)", async () => {
    for (const ct of ["audio/webm", "audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/x-m4a"]) {
      assert.equal((await call(post(audio(), { "content-type": ct }), deps())).status, 200, ct);
    }
  });

  it("refuses an unknown language and an unsupported one", async () => {
    assert.equal((await call(post(audio(), {}, "?lang=fr-FR"), deps())).body.error, "invalid_language");
    const noSomali: SpeechProvider = { ...createMockProvider(), supports: (l) => l !== "so-SO" };
    const r = await call(post(audio(), {}, "?lang=so-SO"), deps({ provider: async () => noSomali }));
    assert.equal(r.status, 422);
    assert.equal(r.body.error, "unsupported_language");
  });

  it("refuses an oversized upload by its declared length", async () => {
    const r = await call(post(audio(), { "content-length": "500000" }), deps());
    assert.equal(r.status, 413);
    assert.equal(r.body.error, "too_large");
  });

  it("refuses an oversized upload that lies about or omits its length, without reading past the cap", async () => {
    let chunks = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(c) {
        chunks += 1;
        c.enqueue(new Uint8Array(30_000));
        if (chunks > 50) c.close();
      },
    });
    const r = await call(post(endless), deps());
    assert.equal(r.status, 413);
    assert.ok(chunks <= 6, `read ${chunks} chunks`);
  });

  it("refuses a recording longer than the limit", async () => {
    const r = await call(post(audio(), { "x-voice-duration-ms": "40000" }), deps());
    assert.equal(r.status, 413);
    assert.equal(r.body.error, "too_long");
  });

  it("refuses empty audio", async () => {
    assert.equal((await call(post(new Uint8Array(0)), deps())).body.error, "empty_audio");
    assert.equal((await call(post(new Uint8Array(50)), deps())).body.error, "empty_audio");
  });

  it("passes provider failures through as safe codes and never their messages", async () => {
    const cases: [Error, number, string][] = [
      [new VoiceError("timeout", 504), 504, "timeout"],
      [new VoiceError("no_speech", 422), 422, "no_speech"],
      [new VoiceError("rate_limited", 429), 429, "rate_limited"],
      [new Error("projects/celpare-prod key=AIzaSECRET private_key"), 502, "provider_unavailable"],
    ];
    for (const [err, status, expected] of cases) {
      const failing: SpeechProvider = { ...createMockProvider(), transcribeAudio: async () => Promise.reject(err) };
      const res = await handleTranscribe(post(audio()), deps({ provider: async () => failing }));
      const text = await res.text();
      assert.equal(res.status, status);
      assert.equal(JSON.parse(text).error, expected);
      assert.ok(!/AIza|private_key|celpare-prod/.test(text), "no provider detail in the response");
    }
  });

  it("never logs the transcript or the audio", async () => {
    const logs: string[] = [];
    await call(post(audio()), deps({}, logs));
    assert.ok(logs.length > 0);
    assert.ok(logs.every((l) => !l.includes("offline")), logs.join("\n"));
  });

  it("hands the request's abort signal to the provider, so a closed tab stops the call", async () => {
    let seen: AbortSignal | undefined;
    const spy: SpeechProvider = {
      ...createMockProvider(),
      transcribeAudio: async (_a, o) => {
        seen = o.signal;
        return { transcript: "x", language: null, confidence: null };
      },
    };
    await call(post(audio()), deps({ provider: async () => spy }));
    assert.ok(seen instanceof AbortSignal);
  });
});

describe("GET /api/voice/transcribe", () => {
  it("reports availability, sign in and limits, and nothing secret", async () => {
    const res = await handleCapabilities(deps());
    const body = await res.json();
    assert.deepEqual(body, {
      enabled: true,
      signedIn: true,
      provider: "mock",
      languages: ["auto", "en-US", "so-SO"],
      maxSeconds: 15,
      maxBytes: 100000,
    });
    const off = await (await handleCapabilities(deps({ provider: async () => null, userId: async () => null }))).json();
    assert.equal(off.enabled, false);
    assert.equal(off.signedIn, false);
    assert.deepEqual(off.languages, []);
  });
});

describe("readCapped", () => {
  it("reads a small body whole and stops a large one at the cap", async () => {
    const small = new Response(new Uint8Array(10)).body;
    assert.equal((await readCapped(small, 100))?.byteLength, 10);
    const big = new Response(new Uint8Array(1000)).body;
    assert.equal(await readCapped(big, 100), null);
    assert.equal((await readCapped(null, 100))?.byteLength, 0);
  });
});
