import type { VoiceLanguage } from "./types";

/*
  Voice search configuration, read from the server environment only (guide 21).
  A pure function of the env it is given, so tests pass their own; only server
  code calls it with process.env.
  Nothing here is NEXT_PUBLIC_ and nothing here is ever sent to a browser
  except the limits and the language list, through GET /api/voice/transcribe.

  OFF BY DEFAULT. Without VOICE_SEARCH_PROVIDER=google (and its credentials)
  the server provider is disabled, the endpoint answers not_configured, and the
  browser falls back to its own speech recognition where it has one.
*/

export type VoiceConfig = {
  provider: "google" | "mock" | "none";
  maxSeconds: number;
  maxBytes: number;
  perMinute: number;
  perDay: number;
  timeoutMs: number;
  google: {
    projectId: string | null;
    /* Raw JSON or base64 of a service account key. Secret. */
    credentialsJson: string | null;
    /* A key file path, for local Node development only. */
    credentialsFile: string | null;
    location: string;
    model: string;
    somaliLocation: string;
    somaliModel: string;
    /* Languages to switch off even if the model lists them. */
    disabled: VoiceLanguage[];
  };
};

const int = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function readVoiceConfig(env: Record<string, string | undefined> = process.env): VoiceConfig {
  const p = (env.VOICE_SEARCH_PROVIDER ?? "none").trim().toLowerCase();
  const provider = p === "google" || p === "mock" ? p : "none";
  return {
    provider,
    /* Google's synchronous Recognize takes at most 60 s or 10 MB of inline
       audio. A search is a sentence, so the defaults are far below that. */
    maxSeconds: int(env.VOICE_MAX_SECONDS, 15, 3, 55),
    maxBytes: int(env.VOICE_MAX_BYTES, 1_000_000, 50_000, 8_000_000),
    perMinute: int(env.VOICE_LIMIT_PER_MINUTE, 6, 1, 60),
    perDay: int(env.VOICE_LIMIT_PER_DAY, 60, 1, 5_000),
    timeoutMs: int(env.VOICE_TIMEOUT_MS, 20_000, 2_000, 55_000),
    google: {
      projectId: env.GOOGLE_CLOUD_PROJECT_ID?.trim() || null,
      credentialsJson: env.GOOGLE_SPEECH_CREDENTIALS_JSON?.trim() || null,
      credentialsFile: env.GOOGLE_APPLICATION_CREDENTIALS?.trim() || null,
      location: env.GOOGLE_SPEECH_LOCATION?.trim() || "eu",
      model: env.GOOGLE_SPEECH_MODEL?.trim() || "chirp_3",
      somaliLocation: env.GOOGLE_SPEECH_SOMALI_LOCATION?.trim() || "europe-west4",
      somaliModel: env.GOOGLE_SPEECH_SOMALI_MODEL?.trim() || "chirp_2",
      disabled: (env.GOOGLE_SPEECH_DISABLED_LANGUAGES ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is VoiceLanguage => s === "auto" || s === "en-US" || s === "so-SO"),
    },
  };
}
