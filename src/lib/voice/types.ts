/*
  Voice search, shared types (guide 21). Safe to import on the client: nothing
  here reads the environment or touches a secret.
*/

/* What the person asked for. "auto" lets the provider detect the language. */
export const VOICE_LANGUAGES = ["auto", "en-US", "so-SO"] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  auto: "Detect language",
  "en-US": "English",
  "so-SO": "Somali (Soomaali)",
};

/*
  Containers browsers can record and Google's V2 auto decoding accepts
  (AutoDetectDecodingConfig: WEBM_OPUS, OGG_OPUS, MP4_AAC, M4A_AAC). Chrome,
  Edge and Firefox record WebM Opus; Safari records MP4 AAC.
*/
export const RECORDING_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
] as const;

/* What the server accepts, compared on the base type (parameters stripped). */
export const ACCEPTED_BASE_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/m4a"] as const;

export type TranscribeOptions = {
  mimeType: string;
  language: VoiceLanguage;
  signal?: AbortSignal;
};

export type Transcription = {
  transcript: string;
  /* BCP 47 code the provider recognised, or null when it does not say. */
  language: string | null;
  /* 0..1, or null when the provider gives none (Chirp often reports 0, which
     means "not computed", not "certainly wrong"). */
  confidence: number | null;
};

/* Every way a transcription can fail, as the client sees it. Never a provider
   message: those can carry project ids and internal detail. */
export const VOICE_ERRORS = [
  "auth_required",
  "not_configured",
  "invalid_content_type",
  "empty_audio",
  "too_large",
  "too_long",
  "invalid_language",
  "unsupported_language",
  "rate_limited",
  "unsupported_audio",
  "no_speech",
  "timeout",
  "provider_unavailable",
] as const;
export type VoiceErrorCode = (typeof VOICE_ERRORS)[number];

export class VoiceError extends Error {
  readonly code: VoiceErrorCode;
  readonly status: number;
  constructor(code: VoiceErrorCode, status: number) {
    super(code);
    this.name = "VoiceError";
    this.code = code;
    this.status = status;
  }
}

/* The one interface a provider implements. Swapping Google for another
   service is a new file that satisfies this, and a line in providers/index. */
export type SpeechProvider = {
  id: string;
  supports(language: VoiceLanguage): boolean;
  transcribeAudio(audio: Uint8Array, options: TranscribeOptions): Promise<Transcription>;
};

/* What GET /api/voice/transcribe tells the browser, so it can choose between
   server transcription, the browser fallback, or no microphone at all. */
export type VoiceCapabilities = {
  enabled: boolean;
  signedIn: boolean;
  provider: string | null;
  languages: VoiceLanguage[];
  maxSeconds: number;
  maxBytes: number;
};

export function baseType(contentType: string): string {
  return contentType.split(";")[0].trim().toLowerCase();
}
