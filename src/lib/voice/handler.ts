import type { VoiceConfig } from "./config";
import {
  ACCEPTED_BASE_TYPES,
  baseType,
  VOICE_LANGUAGES,
  VoiceError,
  type SpeechProvider,
  type VoiceCapabilities,
  type VoiceErrorCode,
  type VoiceLanguage,
} from "./types";

/*
  POST /api/voice/transcribe and GET (capabilities), as functions of their
  dependencies (guide 21), so every branch is tested without a network, a
  session or a bill. The route file only wires real dependencies in.

  ORDER OF CHECKS, cheapest and most decisive first: configured, signed in,
  rate limit, content type, language, declared length, declared duration, then
  the body is read with a hard cap (a missing or false Content-Length cannot
  get past it), then the provider.

  NOTHING IS KEPT. The audio lives in memory for one request and is dropped;
  the transcript goes back to the browser and nowhere else. Logs carry an error
  code and a size, never audio, never transcript text.
*/

export type LimitVerdict = { ok: true } | { ok: false; scope: "minute" | "day" | "ip" };

export type HandlerDeps = {
  config: VoiceConfig;
  userId: () => Promise<string | null>;
  limit: (userId: string) => Promise<LimitVerdict>;
  provider: () => Promise<SpeechProvider | null>;
  log?: (event: string, detail: Record<string, string | number>) => void;
};

const MESSAGES: Record<VoiceErrorCode, string> = {
  auth_required: "Sign in to search by voice.",
  not_configured: "Voice search is not available right now.",
  invalid_content_type: "That recording format is not supported.",
  empty_audio: "Nothing was recorded. Try again.",
  too_large: "That recording is too large. Keep it to one short sentence.",
  too_long: "That recording is too long. Keep it to one short sentence.",
  invalid_language: "Choose a language from the list.",
  unsupported_language: "That language is not available for voice search yet.",
  rate_limited: "Too many voice searches. Wait a minute and try again.",
  unsupported_audio: "We could not read that recording. Try again, or type your search.",
  no_speech: "We did not hear any words. Try again, a little closer to the microphone.",
  timeout: "Voice search took too long. Try again.",
  provider_unavailable: "Voice search is having trouble. Try again, or type your search.",
};

export function errorBody(code: VoiceErrorCode) {
  return { error: code, message: MESSAGES[code] };
}

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

function fail(code: VoiceErrorCode, status: number) {
  return json(errorBody(code), status, code === "rate_limited" ? { "Retry-After": "60" } : {});
}

export function parseLanguage(value: string | null): VoiceLanguage | null {
  const v = value ?? "auto";
  return (VOICE_LANGUAGES as readonly string[]).includes(v) ? (v as VoiceLanguage) : null;
}

/* Reads at most `max` bytes. Returns null when the body is larger. */
export async function readCapped(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function handleCapabilities(deps: HandlerDeps): Promise<Response> {
  const [userId, provider] = await Promise.all([deps.userId(), deps.provider()]);
  const caps: VoiceCapabilities = {
    enabled: provider !== null,
    signedIn: userId !== null,
    provider: provider?.id ?? null,
    languages: provider ? VOICE_LANGUAGES.filter((l) => provider.supports(l)) : [],
    maxSeconds: deps.config.maxSeconds,
    maxBytes: deps.config.maxBytes,
  };
  return json(caps, 200);
}

export async function handleTranscribe(request: Request, deps: HandlerDeps): Promise<Response> {
  const log = deps.log ?? (() => {});
  const provider = await deps.provider();
  if (!provider) return fail("not_configured", 503);

  const userId = await deps.userId();
  if (!userId) return fail("auth_required", 401);

  const verdict = await deps.limit(userId);
  if (!verdict.ok) {
    log("rate_limited", { scope: verdict.scope });
    return fail("rate_limited", 429);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!(ACCEPTED_BASE_TYPES as readonly string[]).includes(baseType(contentType))) {
    return fail("invalid_content_type", 415);
  }

  const url = new URL(request.url);
  const language = parseLanguage(url.searchParams.get("lang"));
  if (!language) return fail("invalid_language", 400);
  if (!provider.supports(language)) return fail("unsupported_language", 422);

  const declared = Number(request.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > deps.config.maxBytes) return fail("too_large", 413);

  /* The browser measures the recording; a container's duration is not
     reliably readable from a WebM stream server side. The byte cap below is
     the hard limit either way. */
  const durationMs = Number(request.headers.get("x-voice-duration-ms") ?? "NaN");
  if (Number.isFinite(durationMs) && durationMs > deps.config.maxSeconds * 1000 + 1500) return fail("too_long", 413);

  const audio = await readCapped(request.body, deps.config.maxBytes);
  if (audio === null) return fail("too_large", 413);
  if (audio.byteLength < 200) return fail("empty_audio", 400);

  try {
    const result = await provider.transcribeAudio(audio, {
      mimeType: baseType(contentType),
      language,
      signal: request.signal,
    });
    log("transcribed", { bytes: audio.byteLength, language: result.language ?? "unknown" });
    return json(result, 200);
  } catch (err) {
    const e = err instanceof VoiceError ? err : new VoiceError("provider_unavailable", 502);
    log("failed", { code: e.code, bytes: audio.byteLength });
    return fail(e.code, e.status);
  }
}
