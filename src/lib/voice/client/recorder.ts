import { RECORDING_TYPES } from "../types";

/*
  One short recording through MediaRecorder (guide 21).

  The browser is injected, so tests run it with fakes. The rules:
  - The microphone is requested only by start(), which only a tap calls.
  - One recording at a time: start() while active throws "busy".
  - Every exit (stop, cancel, the time limit, the size limit, an error,
    dispose) stops every track, so the browser's microphone indicator goes out,
    and drops the chunks.
  - The format is the first of RECORDING_TYPES the browser can record, all of
    which Google's V2 auto decoding reads; none means "unsupported".
*/

export type MediaEnv = {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  MediaRecorder?: {
    new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder;
    isTypeSupported(type: string): boolean;
  };
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
};

export type Recording = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  tooLarge: boolean;
  /* True when the time limit ended it rather than the person. */
  hitTimeLimit: boolean;
};

export class RecorderError extends Error {
  readonly code: "unsupported" | "permission_denied" | "no_microphone" | "busy" | "failed";
  constructor(code: RecorderError["code"]) {
    super(code);
    this.name = "RecorderError";
    this.code = code;
  }
}

export function pickMimeType(isTypeSupported: ((t: string) => boolean) | undefined): string | null {
  if (!isTypeSupported) return null;
  for (const t of RECORDING_TYPES) {
    try {
      if (isTypeSupported(t)) return t;
    } catch {
      /* Some browsers throw on unknown types rather than answering false. */
    }
  }
  return null;
}

export function canRecord(env: Pick<MediaEnv, "getUserMedia" | "MediaRecorder">): boolean {
  return Boolean(env.getUserMedia && env.MediaRecorder && pickMimeType((t) => env.MediaRecorder!.isTypeSupported(t)));
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private bytes = 0;
  private startedAt = 0;
  private timer: unknown = null;
  private tooLarge = false;
  private hitTimeLimit = false;
  private finished: ((r: Recording | null) => void) | null = null;
  private done: Promise<Recording | null> | null = null;
  private cancelled = false;

  private readonly env: MediaEnv;
  private readonly limits: { maxMs: number; maxBytes: number };
  /* Told when the recording ends by itself (time or size limit). */
  private readonly onAutoStop: () => void;

  constructor(env: MediaEnv, limits: { maxMs: number; maxBytes: number }, onAutoStop: () => void = () => {}) {
    this.env = env;
    this.limits = limits;
    this.onAutoStop = onAutoStop;
  }

  get active(): boolean {
    return this.recorder !== null || this.stream !== null;
  }

  async start(): Promise<void> {
    if (this.active) throw new RecorderError("busy");
    const { getUserMedia, MediaRecorder: Recorder } = this.env;
    const mimeType = pickMimeType(Recorder ? (t) => Recorder.isTypeSupported(t) : undefined);
    if (!getUserMedia || !Recorder || !mimeType) throw new RecorderError("unsupported");

    let stream: MediaStream;
    try {
      stream = await getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") throw new RecorderError("permission_denied");
      if (name === "NotFoundError" || name === "OverconstrainedError") throw new RecorderError("no_microphone");
      throw new RecorderError("failed");
    }
    this.stream = stream;
    this.cancelled = false;
    this.chunks = [];
    this.bytes = 0;
    this.tooLarge = false;
    this.hitTimeLimit = false;

    let recorder: MediaRecorder;
    try {
      /* About 32 kbit/s of Opus is plenty for speech and keeps 15 s near 60 KB. */
      recorder = new Recorder(stream, { mimeType, audioBitsPerSecond: 32_000 });
    } catch {
      this.release();
      throw new RecorderError("unsupported");
    }
    this.recorder = recorder;

    this.done = new Promise((resolve) => {
      this.finished = resolve;
    });

    recorder.ondataavailable = (e: BlobEvent) => {
      if (!e.data || e.data.size === 0) return;
      this.chunks.push(e.data);
      this.bytes += e.data.size;
      if (this.bytes > this.limits.maxBytes && !this.tooLarge) {
        this.tooLarge = true;
        this.onAutoStop();
        this.requestStop();
      }
    };
    recorder.onstop = () => this.finish(mimeType);
    recorder.onerror = () => {
      this.cancelled = true;
      this.finish(mimeType);
    };

    this.startedAt = this.env.now();
    /* Chunks every 250 ms, so the size limit is noticed while recording. */
    recorder.start(250);
    this.timer = this.env.setTimeout(() => {
      this.hitTimeLimit = true;
      this.onAutoStop();
      this.requestStop();
    }, this.limits.maxMs);
  }

  /* Ends the recording and returns it, or null if it was cancelled. */
  stop(): Promise<Recording | null> {
    this.requestStop();
    return this.done ?? Promise.resolve(null);
  }

  /* Ends the recording and throws the audio away. */
  cancel(): void {
    this.cancelled = true;
    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
      } catch {
        /* Already stopping. */
      }
    }
    this.finish("");
  }

  /* For unmount: the same as cancel, safe to call any number of times. */
  dispose(): void {
    this.cancel();
  }

  private requestStop() {
    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
        return;
      } catch {
        /* Fall through to finish. */
      }
    }
    if (this.recorder) this.finish(this.recorder.mimeType);
  }

  private finish(mimeType: string) {
    if (this.timer !== null) this.env.clearTimeout(this.timer);
    this.timer = null;
    const resolve = this.finished;
    this.finished = null;
    const recording: Recording | null =
      this.cancelled || this.chunks.length === 0
        ? null
        : {
            blob: new Blob(this.chunks, { type: mimeType.split(";")[0] }),
            mimeType: mimeType.split(";")[0],
            durationMs: this.env.now() - this.startedAt,
            tooLarge: this.tooLarge,
            hitTimeLimit: this.hitTimeLimit,
          };
    this.release();
    resolve?.(recording);
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onstop = null;
      this.recorder.onerror = null;
    }
    this.recorder = null;
    this.chunks = [];
    this.bytes = 0;
  }
}
