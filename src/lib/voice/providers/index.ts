import { createGoogleProvider } from "./google";
import { parseServiceAccount, type ServiceAccount } from "./google-auth";
import type { VoiceConfig } from "../config";
import { VoiceError, type SpeechProvider } from "../types";

/*
  Which speech provider runs, from configuration (guide 21). Replacing Google is
  a new provider file that implements SpeechProvider and a case here; the UI,
  the endpoint and Search do not change.

  "mock" answers with a fixed sentence and never leaves the process, like
  AI_PROVIDER=mock (D34): the whole voice flow can be exercised locally and in
  tests with no account and no bill.
*/

export function createMockProvider(transcript = "best AI coding tools"): SpeechProvider {
  return {
    id: "mock",
    supports: () => true,
    async transcribeAudio(audio, options) {
      if (audio.byteLength === 0) throw new VoiceError("empty_audio", 400);
      return { transcript, language: options.language === "auto" ? "en-US" : options.language, confidence: null };
    },
  };
}

export type ProviderResult = { provider: SpeechProvider } | { provider: null; reason: string };

export async function providerFrom(
  config: VoiceConfig,
  readFile?: (path: string) => Promise<string>,
): Promise<ProviderResult> {
  if (config.provider === "mock") return { provider: createMockProvider() };
  if (config.provider !== "google") return { provider: null, reason: "VOICE_SEARCH_PROVIDER is not set" };

  const g = config.google;
  if (!g.projectId) return { provider: null, reason: "GOOGLE_CLOUD_PROJECT_ID is not set" };

  let credentials: ServiceAccount;
  try {
    if (g.credentialsJson) credentials = parseServiceAccount(g.credentialsJson);
    else if (g.credentialsFile && readFile) credentials = parseServiceAccount(await readFile(g.credentialsFile));
    else return { provider: null, reason: "no Google credentials (GOOGLE_SPEECH_CREDENTIALS_JSON)" };
  } catch (err) {
    /* The reason names what is wrong with the variable, never its value. */
    return { provider: null, reason: err instanceof Error ? err.message : "credentials unreadable" };
  }

  return {
    provider: createGoogleProvider({
      projectId: g.projectId,
      credentials,
      location: g.location,
      model: g.model,
      somaliLocation: g.somaliLocation,
      somaliModel: g.somaliModel,
      disabled: g.disabled,
      timeoutMs: config.timeoutMs,
    }),
  };
}
