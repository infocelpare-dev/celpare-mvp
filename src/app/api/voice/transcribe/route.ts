import "server-only";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { readVoiceConfig } from "@/lib/voice/config";
import { handleCapabilities, handleTranscribe, type HandlerDeps } from "@/lib/voice/handler";
import { voiceLimit } from "@/lib/voice/limit";
import { providerFrom } from "@/lib/voice/providers";
import type { SpeechProvider } from "@/lib/voice/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/* Recognize answers within VOICE_TIMEOUT_MS (20 s by default); this leaves room. */
export const maxDuration = 30;

/*
  Voice search transcription (guide 21). GET says whether server voice search
  is available to this visitor; POST turns one short recording into text.

  Signed in only for POST: every call is paid. The user id comes from the
  Supabase session (getUser), never from the request. The provider is built
  once per process from server environment variables; the credentials never
  reach a response, a log or the browser bundle (this file is server-only).
*/

let cached: Promise<SpeechProvider | null> | null = null;

function provider(): Promise<SpeechProvider | null> {
  cached ??= (async () => {
    const result = await providerFrom(readVoiceConfig(), async (path) => {
      /* Local development only: a key file path. Imported lazily so a runtime
         without a filesystem never loads it. */
      const { readFile } = await import("node:fs/promises");
      return readFile(path, "utf8");
    });
    if (!result.provider) {
      /* Which variable is missing, never a value. */
      console.warn("[voice] provider off:", result.reason);
      return null;
    }
    return result.provider;
  })();
  return cached;
}

async function userId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

function deps(): HandlerDeps {
  const config = readVoiceConfig();
  return {
    config,
    userId,
    limit: (id) => voiceLimit(id, config),
    provider,
    log: (event, detail) => console.info("[voice]", event, JSON.stringify(detail)),
  };
}

export async function GET() {
  return handleCapabilities(deps());
}

export async function POST(request: Request) {
  return handleTranscribe(request, deps());
}
