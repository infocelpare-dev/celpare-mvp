import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INITIAL, isBusy, isLowConfidence, reduce, type VoiceEvent, type VoiceState } from "../client/machine";
import { canRecord, pickMimeType, RecorderError, VoiceRecorder, type MediaEnv } from "../client/recorder";
import { readResponse, uploadRecording } from "../client/upload";

const run = (events: VoiceEvent[], from: VoiceState = INITIAL) => events.reduce(reduce, from);
const ready = (transcript = "find free AI video generators") =>
  run([{ type: "START" }, { type: "PERMISSION_GRANTED" }, { type: "RECORDING_STARTED" }, { type: "STOP" }, { type: "RECORDED" }, { type: "UPLOADED" }, { type: "RESULT", transcript, language: "en-US", confidence: 0.9 }]);

describe("Voice state machine", () => {
  it("walks the whole happy path through every busy state", () => {
    const seen: string[] = [];
    let s = INITIAL;
    for (const e of [
      { type: "START" },
      { type: "PERMISSION_GRANTED" },
      { type: "RECORDING_STARTED" },
      { type: "STOP" },
      { type: "RECORDED" },
      { type: "UPLOADED" },
      { type: "RESULT", transcript: " compare Claude, GPT and Gemini ", language: "en-US", confidence: 0.8 },
    ] as VoiceEvent[]) {
      s = reduce(s, e);
      seen.push(s.status);
    }
    assert.deepEqual(seen, ["requesting_permission", "ready", "listening", "stopping", "uploading", "transcribing", "transcript_ready"]);
    assert.equal(s.transcript, "compare Claude, GPT and Gemini");
  });

  it("ignores repeated microphone taps while a session runs (no concurrent recordings)", () => {
    for (const status of ["requesting_permission", "ready", "listening", "stopping", "uploading", "transcribing"] as const) {
      const s = { ...INITIAL, status };
      assert.equal(reduce(s, { type: "START" }), s, status);
    }
  });

  it("lets the person edit the transcript, then submits it exactly once", () => {
    let s = reduce(ready(), { type: "EDIT", transcript: "free AI video generators for YouTube" });
    assert.equal(s.transcript, "free AI video generators for YouTube");
    s = reduce(s, { type: "SUBMIT" });
    assert.equal(s.status, "submitted");
    assert.equal(reduce(s, { type: "SUBMIT" }), s, "a second submit is ignored");
    assert.equal(reduce(s, { type: "EDIT", transcript: "changed" }).transcript, s.transcript, "no edits after submit");
  });

  it("never submits an empty or whitespace transcript", () => {
    const s = reduce(ready(), { type: "EDIT", transcript: "   " });
    assert.equal(reduce(s, { type: "SUBMIT" }).status, "transcript_ready");
  });

  it("an empty result is no speech, not an empty transcript", () => {
    const s = run([{ type: "START" }, { type: "RECORDING_STARTED" }, { type: "STOP" }, { type: "RECORDED" }, { type: "RESULT", transcript: "  ", language: null, confidence: null }]);
    assert.equal(s.status, "no_speech");
    assert.ok(s.message.length > 0);
  });

  it("maps every failure to its state, with a message and the right retry", () => {
    const cases = [
      ["permission_denied", "permission_denied", false],
      ["no_microphone", "permission_denied", false],
      ["unsupported", "unsupported", false],
      ["invalid_content_type", "unsupported", false],
      ["network", "network_error", true],
      ["timeout", "network_error", true],
      ["not_configured", "config_error", false],
      ["auth_required", "auth_required", false],
      ["too_large", "too_large", false],
      ["too_long", "too_large", false],
      ["rate_limited", "rate_limited", true],
      ["provider_unavailable", "failed", true],
      ["no_speech", "no_speech", false],
    ] as const;
    for (const [code, status, canResend] of cases) {
      const s = reduce({ ...INITIAL, status: "uploading" }, { type: "ERROR", code });
      assert.equal(s.status, status, code);
      assert.equal(s.canResend, canResend, code);
      assert.ok(s.message.length > 10, code);
      assert.equal(isBusy(s), false, `${code} leaves no spinner`);
    }
  });

  it("Retry resends the same recording when that can help, otherwise records again", () => {
    const net = reduce({ ...INITIAL, status: "uploading" }, { type: "ERROR", code: "network" });
    assert.equal(reduce(net, { type: "RETRY" }).status, "uploading");
    const noSpeech = reduce({ ...INITIAL, status: "transcribing" }, { type: "ERROR", code: "no_speech" });
    assert.equal(reduce(noSpeech, { type: "RETRY" }).status, "requesting_permission");
  });

  it("Cancel from any state returns to idle, and a late answer after Cancel is ignored", () => {
    for (const status of ["listening", "uploading", "transcribing", "transcript_ready", "network_error"] as const) {
      assert.equal(reduce({ ...INITIAL, status }, { type: "CANCEL" }).status, "idle");
    }
    assert.equal(reduce(INITIAL, { type: "ERROR", code: "network" }).status, "idle");
    assert.equal(reduce(INITIAL, { type: "RESULT", transcript: "late", language: null, confidence: null }).status, "idle");
  });

  it("flags low confidence so the person checks the words", () => {
    const s = run([{ type: "START" }, { type: "RECORDING_STARTED" }, { type: "STOP" }, { type: "RECORDED" }, { type: "RESULT", transcript: "qalab", language: "so-SO", confidence: 0.3 }]);
    assert.equal(isLowConfidence(s), true);
    assert.equal(isLowConfidence(ready()), false);
  });
});

/* ------------------------------------------------------------ recorder */

type FakeTrack = { stopped: boolean; stop(): void };

function fakeEnv(opts: { supported?: string[]; deny?: string; chunkSize?: number } = {}) {
  const tracks: FakeTrack[] = [];
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  let getUserMediaCalls = 0;
  let clock = 0;
  const supported = opts.supported ?? ["audio/webm;codecs=opus"];

  class FakeRecorder {
    static isTypeSupported(t: string) {
      return supported.includes(t);
    }
    state: "inactive" | "recording" = "inactive";
    mimeType: string;
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(_s: unknown, o: { mimeType: string }) {
      this.mimeType = o.mimeType;
      recorders.push(this);
    }
    start() {
      this.state = "recording";
    }
    emit(size: number) {
      this.ondataavailable?.({ data: new Blob([new Uint8Array(size)]) });
    }
    stop() {
      if (this.state === "inactive") throw new Error("inactive");
      this.state = "inactive";
      this.emit(opts.chunkSize ?? 500);
      this.onstop?.();
    }
  }
  const recorders: FakeRecorder[] = [];

  const env: MediaEnv = {
    getUserMedia: async () => {
      getUserMediaCalls += 1;
      if (opts.deny) {
        const e = new Error("denied");
        e.name = opts.deny;
        throw e;
      }
      const t: FakeTrack = {
        stopped: false,
        stop() {
          this.stopped = true;
        },
      };
      tracks.push(t);
      return { getTracks: () => [t] } as unknown as MediaStream;
    },
    MediaRecorder: FakeRecorder as unknown as MediaEnv["MediaRecorder"],
    now: () => clock,
    setTimeout: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimeout: (t) => {
      (t as { cleared: boolean }).cleared = true;
    },
  };
  return {
    env,
    tracks,
    timers,
    recorders,
    calls: () => getUserMediaCalls,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("Recorder", () => {
  it("picks the first format the browser records that Google can decode, Safari's MP4 included", () => {
    assert.equal(pickMimeType((t) => t === "audio/webm;codecs=opus"), "audio/webm;codecs=opus");
    assert.equal(pickMimeType((t) => t === "audio/mp4"), "audio/mp4");
    assert.equal(pickMimeType((t) => t === "audio/wav"), null);
    assert.equal(pickMimeType(undefined), null);
    assert.equal(
      pickMimeType(() => {
        throw new Error("x");
      }),
      null,
    );
  });

  it("reports an unsupported browser before asking for the microphone", async () => {
    const f = fakeEnv({ supported: [] });
    assert.equal(canRecord(f.env), false);
    await assert.rejects(new VoiceRecorder(f.env, { maxMs: 15000, maxBytes: 1e6 }).start(), (e: RecorderError) => e.code === "unsupported");
    assert.equal(f.calls(), 0);
    await assert.rejects(new VoiceRecorder({ ...f.env, MediaRecorder: undefined }, { maxMs: 1, maxBytes: 1 }).start(), (e: RecorderError) => e.code === "unsupported");
  });

  it("maps a denied permission and a missing microphone", async () => {
    await assert.rejects(new VoiceRecorder(fakeEnv({ deny: "NotAllowedError" }).env, { maxMs: 1, maxBytes: 1 }).start(), (e: RecorderError) => e.code === "permission_denied");
    await assert.rejects(new VoiceRecorder(fakeEnv({ deny: "NotFoundError" }).env, { maxMs: 1, maxBytes: 1 }).start(), (e: RecorderError) => e.code === "no_microphone");
  });

  it("records, stops, returns the audio with its type and duration, and releases the microphone", async () => {
    const f = fakeEnv();
    const r = new VoiceRecorder(f.env, { maxMs: 15000, maxBytes: 1e6 });
    await r.start();
    assert.equal(r.active, true);
    f.advance(2400);
    const rec = await r.stop();
    assert.ok(rec);
    assert.equal(rec.mimeType, "audio/webm");
    assert.equal(rec.blob.type, "audio/webm");
    assert.equal(rec.durationMs, 2400);
    assert.equal(rec.tooLarge, false);
    assert.ok(f.tracks.every((t) => t.stopped), "every track stopped");
    assert.equal(r.active, false);
    assert.ok(f.timers[0].cleared, "the time limit timer is cleared");
  });

  it("refuses a second recording while one runs", async () => {
    const f = fakeEnv();
    const r = new VoiceRecorder(f.env, { maxMs: 15000, maxBytes: 1e6 });
    await r.start();
    await assert.rejects(r.start(), (e: RecorderError) => e.code === "busy");
    assert.equal(f.calls(), 1, "the microphone is asked for once");
    r.cancel();
  });

  it("Cancel throws the audio away and releases the microphone", async () => {
    const f = fakeEnv();
    const r = new VoiceRecorder(f.env, { maxMs: 15000, maxBytes: 1e6 });
    await r.start();
    const pending = r.stop.bind(r);
    r.cancel();
    assert.equal(await pending(), null);
    assert.ok(f.tracks.every((t) => t.stopped));
    assert.equal(r.active, false);
    r.dispose();
    r.dispose();
  });

  it("stops by itself at the time limit and says so", async () => {
    const f = fakeEnv();
    let autoStops = 0;
    const r = new VoiceRecorder(f.env, { maxMs: 15000, maxBytes: 1e6 }, () => autoStops++);
    await r.start();
    assert.equal(f.timers[0].ms, 15000);
    f.advance(15000);
    f.timers[0].fn();
    assert.equal(autoStops, 1);
    assert.ok(f.tracks.every((t) => t.stopped));
  });

  it("stops at the size limit and marks the recording too large", async () => {
    const f = fakeEnv({ chunkSize: 10 });
    const r = new VoiceRecorder(f.env, { maxMs: 15000, maxBytes: 1000 });
    await r.start();
    const done = r.stop.bind(r);
    f.recorders[0].emit(2000);
    const rec = await done();
    assert.equal(rec?.tooLarge, true);
    assert.ok(f.tracks.every((t) => t.stopped));
  });
});

/* -------------------------------------------------------------- upload */

const made: FakeXhr[] = [];

class FakeXhr {
  status = 0;
  responseText = "";
  timeout = 0;
  headers: Record<string, string> = {};
  url = "";
  sent: unknown = null;
  aborted = false;
  upload = { onload: null as null | (() => void) };
  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  ontimeout: null | (() => void) = null;
  onabort: null | (() => void) = null;
  respond: (x: FakeXhr) => void = () => {};
  open(_m: string, url: string) {
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(b: unknown) {
    this.sent = b;
    made.push(this);
    this.respond(this);
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

function fakeXhr(respond: (x: FakeXhr) => void) {
  made.length = 0;
  return {
    make: () => {
      const x = new FakeXhr();
      x.respond = respond;
      return x as never;
    },
    made,
  };
}

describe("Upload", () => {
  const blob = new Blob([new Uint8Array(3000)], { type: "audio/webm" });
  const opts = (onUploaded = () => {}) => ({ language: "so-SO" as const, durationMs: 3210.4, timeoutMs: 30000, onUploaded });

  it("sends the audio with its type, duration and language, and reports upload then result", async () => {
    let uploaded = false;
    const x = fakeXhr((r) => {
      r.upload.onload?.();
      r.status = 200;
      r.responseText = JSON.stringify({ transcript: "qalab AI", language: "so-SO", confidence: null });
      r.onload?.();
    });
    const u = uploadRecording(blob, opts(() => (uploaded = true)), x.make);
    const r = await u.promise;
    assert.equal(uploaded, true);
    assert.deepEqual(r, { ok: true, result: { transcript: "qalab AI", language: "so-SO", confidence: null } });
    assert.equal(x.made[0].url, "/api/voice/transcribe?lang=so-SO");
    assert.equal(x.made[0].headers["Content-Type"], "audio/webm");
    assert.equal(x.made[0].headers["X-Voice-Duration-Ms"], "3210");
    assert.equal(x.made[0].timeout, 30000);
    assert.equal(x.made[0].sent, blob);
  });

  it("maps server errors, a dropped connection, a timeout and a proxy page", async () => {
    assert.deepEqual(readResponse(429, JSON.stringify({ error: "rate_limited", message: "Wait." })), { ok: false, code: "rate_limited", message: "Wait." });
    assert.equal((readResponse(429, "") as { code: string }).code, "rate_limited");
    assert.equal((readResponse(502, "<html>Bad gateway</html>") as { code: string }).code, "provider_unavailable");
    assert.equal((readResponse(401, "") as { code: string }).code, "auth_required");
    assert.equal((readResponse(200, JSON.stringify({ error: "weird" })) as { code: string }).code, "provider_unavailable");

    const offline = fakeXhr((r) => r.onerror?.());
    assert.deepEqual(await uploadRecording(blob, opts(), offline.make).promise, { ok: false, code: "network" });
    const slow = fakeXhr((r) => r.ontimeout?.());
    assert.deepEqual(await uploadRecording(blob, opts(), slow.make).promise, { ok: false, code: "timeout" });
  });

  it("Cancel aborts the request and the promise settles once", async () => {
    const x = fakeXhr(() => {});
    const u = uploadRecording(blob, opts(), x.make);
    u.abort();
    u.abort();
    assert.deepEqual(await u.promise, { ok: false, code: "network" });
    assert.equal(x.made[0].aborted, true);
  });
});
