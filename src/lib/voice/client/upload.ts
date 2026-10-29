import type { ClientErrorCode } from "./machine";
import { VOICE_ERRORS, type Transcription, type VoiceErrorCode, type VoiceLanguage } from "../types";

/*
  Sends one recording to /api/voice/transcribe (guide 21).

  XHR rather than fetch for one reason: upload.onload says when the bytes have
  left the device, which is the honest line between "Uploading" and
  "Transcribing". fetch cannot tell the two apart. Abort and a timeout are
  built in, so no spinner can outlive the request.
*/

export const ENDPOINT = "/api/voice/transcribe";

export type UploadResult = { ok: true; result: Transcription } | { ok: false; code: ClientErrorCode; message?: string };

type XhrLike = Pick<
  XMLHttpRequest,
  "open" | "send" | "abort" | "setRequestHeader" | "status" | "responseText" | "timeout" | "onload" | "onerror" | "ontimeout" | "onabort"
> & { upload: { onload: ((this: unknown, ev: ProgressEvent) => unknown) | null } };

export type Upload = { promise: Promise<UploadResult>; abort: () => void };

export function uploadRecording(
  blob: Blob,
  options: { language: VoiceLanguage; durationMs: number; timeoutMs: number; onUploaded: () => void },
  makeXhr: () => XhrLike = () => new XMLHttpRequest() as unknown as XhrLike,
): Upload {
  const xhr = makeXhr();
  let settled = false;
  let resolveFn: (r: UploadResult) => void = () => {};
  const promise = new Promise<UploadResult>((resolve) => {
    resolveFn = resolve;
  });
  const settle = (r: UploadResult) => {
    if (settled) return;
    settled = true;
    resolveFn(r);
  };

  xhr.open("POST", `${ENDPOINT}?lang=${encodeURIComponent(options.language)}`);
  xhr.setRequestHeader("Content-Type", blob.type || "audio/webm");
  xhr.setRequestHeader("X-Voice-Duration-Ms", String(Math.round(options.durationMs)));
  xhr.timeout = options.timeoutMs;
  xhr.upload.onload = () => options.onUploaded();
  xhr.onload = () => settle(readResponse(xhr.status, xhr.responseText));
  xhr.onerror = () => settle({ ok: false, code: "network" });
  xhr.ontimeout = () => settle({ ok: false, code: "timeout" });
  xhr.onabort = () => settle({ ok: false, code: "network" });
  xhr.send(blob);

  return {
    promise,
    abort: () => {
      settle({ ok: false, code: "network" });
      try {
        xhr.abort();
      } catch {
        /* Already finished. */
      }
    },
  };
}

export function readResponse(status: number, text: string): UploadResult {
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* A proxy's HTML error page, or nothing at all. */
  }
  if (status === 200 && body && typeof (body as Transcription).transcript === "string") {
    const b = body as Transcription;
    return {
      ok: true,
      result: {
        transcript: b.transcript,
        language: typeof b.language === "string" ? b.language : null,
        confidence: typeof b.confidence === "number" ? b.confidence : null,
      },
    };
  }
  const code = (body as { error?: string } | null)?.error;
  if (code && (VOICE_ERRORS as readonly string[]).includes(code)) {
    return { ok: false, code: code as VoiceErrorCode, message: (body as { message?: string }).message };
  }
  if (status === 429) return { ok: false, code: "rate_limited" };
  if (status === 401) return { ok: false, code: "auth_required" };
  if (status === 413) return { ok: false, code: "too_large" };
  if (status === 0) return { ok: false, code: "network" };
  return { ok: false, code: "provider_unavailable" };
}
