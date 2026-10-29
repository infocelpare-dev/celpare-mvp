import type { VoiceErrorCode } from "../types";

/*
  The voice search state machine (guide 21). Pure: the hook dispatches events
  and renders the state, and tests drive every transition without a browser.

  The guarantees live here rather than in components, so they hold whatever
  the UI does: one session at a time (start is ignored while one runs), no
  stuck spinner (every busy state has an exit on error and on cancel), no empty
  submission, and no second submission of the same transcript.
*/

export type VoiceStatus =
  | "idle"
  | "requesting_permission"
  | "ready"
  | "listening"
  | "stopping"
  | "uploading"
  | "transcribing"
  | "transcript_ready"
  | "submitted"
  | "no_speech"
  | "permission_denied"
  | "unsupported"
  | "network_error"
  | "config_error"
  | "auth_required"
  | "too_large"
  | "rate_limited"
  | "failed";

export type VoiceState = {
  status: VoiceStatus;
  transcript: string;
  language: string | null;
  confidence: number | null;
  /* A friendly sentence for the error states; empty otherwise. */
  message: string;
  /* True when Retry can resend the same recording without recording again. */
  canResend: boolean;
};

export type VoiceEvent =
  | { type: "START" }
  | { type: "PERMISSION_GRANTED" }
  | { type: "RECORDING_STARTED" }
  | { type: "STOP" }
  | { type: "RECORDED" }
  | { type: "UPLOADED" }
  | { type: "RESULT"; transcript: string; language: string | null; confidence: number | null }
  | { type: "BROWSER_INTERIM"; transcript: string }
  | { type: "ERROR"; code: ClientErrorCode; message?: string }
  | { type: "EDIT"; transcript: string }
  | { type: "SUBMIT" }
  | { type: "RETRY" }
  | { type: "CANCEL" };

/* Server codes plus what only the browser can know. */
export type ClientErrorCode = VoiceErrorCode | "permission_denied" | "unsupported" | "network" | "no_microphone";

export const INITIAL: VoiceState = {
  status: "idle",
  transcript: "",
  language: null,
  confidence: null,
  message: "",
  canResend: false,
};

const BUSY: VoiceStatus[] = ["requesting_permission", "ready", "listening", "stopping", "uploading", "transcribing"];

export function isBusy(s: VoiceState): boolean {
  return BUSY.includes(s.status);
}

export function isRecording(s: VoiceState): boolean {
  return s.status === "ready" || s.status === "listening";
}

/* Below this a transcript is shown with a "check the words" note. */
export const LOW_CONFIDENCE = 0.5;

export function isLowConfidence(s: VoiceState): boolean {
  return s.status === "transcript_ready" && s.confidence !== null && s.confidence < LOW_CONFIDENCE;
}

const ERROR_TEXT: Record<ClientErrorCode, string> = {
  permission_denied: "Microphone access is off. Allow it for this site in your browser settings, then try again.",
  no_microphone: "No microphone was found on this device.",
  unsupported: "This browser cannot record audio for voice search. Type your search instead.",
  network: "Could not reach Celpare. Check your connection and try again.",
  auth_required: "Sign in to search by voice.",
  not_configured: "Voice search is not available right now. Type your search instead.",
  invalid_content_type: "This browser records in a format voice search cannot read.",
  empty_audio: "Nothing was recorded. Try again.",
  too_large: "That was too long. Keep it to one short sentence.",
  too_long: "That was too long. Keep it to one short sentence.",
  invalid_language: "Choose a language from the list.",
  unsupported_language: "That language is not available for voice search yet.",
  rate_limited: "Too many voice searches. Wait a minute, then try again.",
  unsupported_audio: "We could not read that recording. Try again, or type your search.",
  no_speech: "We did not hear any words. Try again, a little closer to the microphone.",
  timeout: "Voice search took too long. Try again.",
  provider_unavailable: "Voice search is having trouble. Try again, or type your search.",
};

/* Which state each failure lands in, and whether the recording is worth resending. */
function errorState(code: ClientErrorCode): { status: VoiceStatus; canResend: boolean } {
  switch (code) {
    case "permission_denied":
    case "no_microphone":
      return { status: "permission_denied", canResend: false };
    case "unsupported":
    case "invalid_content_type":
    case "unsupported_audio":
      return { status: "unsupported", canResend: false };
    case "network":
    case "timeout":
      return { status: "network_error", canResend: true };
    case "not_configured":
      return { status: "config_error", canResend: false };
    case "auth_required":
      return { status: "auth_required", canResend: false };
    case "too_large":
    case "too_long":
      return { status: "too_large", canResend: false };
    case "rate_limited":
      return { status: "rate_limited", canResend: true };
    case "no_speech":
    case "empty_audio":
      return { status: "no_speech", canResend: false };
    case "provider_unavailable":
      return { status: "failed", canResend: true };
    default:
      return { status: "failed", canResend: false };
  }
}

export function messageFor(code: ClientErrorCode): string {
  return ERROR_TEXT[code];
}

export function reduce(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case "START":
      /* One session at a time: a second tap while busy does nothing. */
      if (isBusy(state)) return state;
      return { ...INITIAL, status: "requesting_permission" };

    case "PERMISSION_GRANTED":
      return state.status === "requesting_permission" ? { ...state, status: "ready" } : state;

    case "RECORDING_STARTED":
      return state.status === "ready" || state.status === "requesting_permission" ? { ...state, status: "listening" } : state;

    case "STOP":
      return isRecording(state) ? { ...state, status: "stopping" } : state;

    case "RECORDED":
      return state.status === "stopping" || state.status === "listening" ? { ...state, status: "uploading" } : state;

    case "UPLOADED":
      return state.status === "uploading" ? { ...state, status: "transcribing" } : state;

    case "BROWSER_INTERIM":
      return state.status === "listening" ? { ...state, transcript: event.transcript } : state;

    case "RESULT": {
      if (!["uploading", "transcribing", "listening", "stopping"].includes(state.status)) return state;
      const transcript = event.transcript.trim();
      if (!transcript) return { ...state, status: "no_speech", transcript: "", message: ERROR_TEXT.no_speech, canResend: false };
      return {
        status: "transcript_ready",
        transcript,
        language: event.language,
        confidence: event.confidence,
        message: "",
        canResend: false,
      };
    }

    case "ERROR": {
      /* An error after cancel or after a result is stale and ignored. */
      if (state.status === "idle" || state.status === "transcript_ready" || state.status === "submitted") return state;
      const next = errorState(event.code);
      return { ...state, status: next.status, canResend: next.canResend, message: event.message || ERROR_TEXT[event.code] };
    }

    case "EDIT":
      return state.status === "transcript_ready" ? { ...state, transcript: event.transcript } : state;

    case "SUBMIT":
      /* Never an empty search, never the same one twice. */
      if (state.status !== "transcript_ready" || !state.transcript.trim()) return state;
      return { ...state, status: "submitted", transcript: state.transcript.trim() };

    case "RETRY":
      if (isBusy(state) || state.status === "idle" || state.status === "submitted") return state;
      if (state.canResend) return { ...state, status: "uploading", message: "" };
      return { ...INITIAL, status: "requesting_permission" };

    case "CANCEL":
      return INITIAL;
  }
}
