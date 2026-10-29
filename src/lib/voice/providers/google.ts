import { accessToken, CredentialsError, toBase64, type ServiceAccount } from "./google-auth";
import { VoiceError, type SpeechProvider, type TranscribeOptions, type Transcription, type VoiceLanguage } from "../types";

/*
  Google Cloud Speech-to-Text V2, synchronous Recognize (guide 21).

  WHY THESE MODELS AND PLACES (checked against Google's V2 docs, 2026-10-29):
  - chirp_3 in the "eu" multi-region: Google's newest model, GA in us and eu,
    supports Recognize and automatic language detection (language_codes
    ["auto"]). Europe, beside Supabase in eu-west-1. It does not list Somali.
  - chirp_2 in europe-west4: the V2 language table lists so-SO for chirp and
    chirp_2 in asia-southeast1 and europe-west4. Listed is not proven: Somali
    accuracy has not been measured (guide 21).
  - Inline audio: Recognize takes at most 10 MB or 1 minute; the endpoint's own
    limits are far lower.
  - AutoDetectDecodingConfig reads WEBM_OPUS, OGG_OPUS, MP4_AAC and M4A_AAC,
    which covers what Chrome, Edge, Firefox and Safari record.

  REST, not the gRPC client: one fetch, no native dependency, runs on Workers.
  Endpoint: https://{location}-speech.googleapis.com/v2/projects/{p}/locations/
  {location}/recognizers/_:recognize, where "_" is the implicit recognizer.
*/

export type GoogleSettings = {
  projectId: string;
  credentials: ServiceAccount;
  location: string;
  model: string;
  somaliLocation: string;
  somaliModel: string;
  disabled: VoiceLanguage[];
  timeoutMs: number;
};

type Deps = { fetch: typeof fetch; now: () => number };

type RecognizeResponse = {
  results?: {
    alternatives?: { transcript?: string; confidence?: number }[];
    languageCode?: string;
  }[];
};

export function routeFor(s: GoogleSettings, language: VoiceLanguage) {
  if (language === "so-SO") return { location: s.somaliLocation, model: s.somaliModel, languageCodes: ["so-SO"] };
  if (language === "en-US") return { location: s.location, model: s.model, languageCodes: ["en-US"] };
  return { location: s.location, model: s.model, languageCodes: ["auto"] };
}

export function endpointFor(projectId: string, location: string): string {
  const host = location === "global" ? "speech.googleapis.com" : `${location}-speech.googleapis.com`;
  return `https://${host}/v2/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/recognizers/_:recognize`;
}

/* Joined across results; Recognize can split one utterance into several. */
export function readResponse(data: RecognizeResponse): Transcription {
  const parts: string[] = [];
  const confidences: number[] = [];
  let language: string | null = null;
  for (const r of data.results ?? []) {
    const best = r.alternatives?.[0];
    const text = best?.transcript?.trim();
    if (text) parts.push(text);
    /* 0 means "not computed" for Chirp, not "certainly wrong". */
    if (typeof best?.confidence === "number" && best.confidence > 0) confidences.push(best.confidence);
    if (!language && r.languageCode) language = r.languageCode;
  }
  const transcript = parts.join(" ").replace(/\s+/g, " ").trim();
  return {
    transcript,
    language,
    confidence: confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null,
  };
}

/* Provider status to the client's vocabulary. Never the provider's message. */
export function mapStatus(status: number): VoiceError {
  if (status === 400) return new VoiceError("unsupported_audio", 422);
  if (status === 401 || status === 403 || status === 404) return new VoiceError("not_configured", 503);
  if (status === 413) return new VoiceError("too_large", 413);
  if (status === 429) return new VoiceError("rate_limited", 429);
  if (status === 408 || status === 504) return new VoiceError("timeout", 504);
  return new VoiceError("provider_unavailable", 502);
}

export function createGoogleProvider(settings: GoogleSettings, deps: Deps = { fetch, now: Date.now }): SpeechProvider {
  return {
    id: "google_speech_v2",
    supports: (language) => !settings.disabled.includes(language),

    async transcribeAudio(audio: Uint8Array, options: TranscribeOptions): Promise<Transcription> {
      if (!this.supports(options.language)) throw new VoiceError("unsupported_language", 422);
      if (audio.byteLength === 0) throw new VoiceError("empty_audio", 400);

      /* One deadline for the token and the recognition, joined with the
         caller's signal, so a closed browser tab stops the provider call too. */
      const timeout = AbortSignal.timeout(settings.timeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

      const route = routeFor(settings, options.language);
      try {
        const token = await accessToken(settings.credentials, { fetch: deps.fetch, now: deps.now, signal });
        const res = await deps.fetch(endpointFor(settings.projectId, route.location), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            config: {
              autoDecodingConfig: {},
              model: route.model,
              languageCodes: route.languageCodes,
              features: { enableAutomaticPunctuation: true },
            },
            content: toBase64(audio),
          }),
          signal,
        });
        if (!res.ok) throw mapStatus(res.status);
        const result = readResponse((await res.json()) as RecognizeResponse);
        if (!result.transcript) throw new VoiceError("no_speech", 422);
        return { ...result, language: result.language ?? (options.language === "auto" ? null : options.language) };
      } catch (err) {
        if (err instanceof VoiceError) throw err;
        if (err instanceof CredentialsError) throw new VoiceError("not_configured", 503);
        if (timeout.aborted) throw new VoiceError("timeout", 504);
        if (options.signal?.aborted) throw new VoiceError("timeout", 499);
        throw new VoiceError("provider_unavailable", 502);
      }
    },
  };
}
