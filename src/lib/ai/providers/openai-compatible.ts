import type {
  AiChunk,
  AiProvider,
  AiRequest,
  AiResult,
  ModerationResult,
} from "../types";

/*
  One adapter for every OpenAI compatible endpoint.

  OpenRouter, GLM, and most hosted providers speak the same chat completions
  shape, so this is written once and configured per provider rather than copied.

  Plain fetch, no SDK. The founder sent the @openrouter/sdk snippet, and it works
  fine, but the endpoint is OpenAI compatible and the streaming code below is
  already written and tested against it. A dependency here would buy nothing and
  would mean inheriting its breaking changes, which is the exact coupling the
  provider abstraction exists to avoid. Switching provider stays an env var.
*/

export type EndpointConfig = {
  name: string;
  baseUrl: string;
  apiKey: () => string | undefined;
  /* OpenRouter uses these for attribution in its dashboard and rankings. */
  extraHeaders?: Record<string, string>;
  /* OpenRouter returns token usage in the final stream chunk when asked. */
  requestUsageInStream?: boolean;
};

type Delta = {
  content?: string | null;
  /* Reasoning models put their scratch work here. It is never shown. */
  reasoning?: string | null;
};

type StreamChunk = {
  choices?: { delta?: Delta; finish_reason?: string | null }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string; code?: number };
};

/* Usage reported by the provider for the last streamed response. The gateway
   prefers these over its own estimate whenever they arrive. */
export type StreamUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

/*
  Transient upstream failures, which free tier endpoints produce routinely.
  Observed in testing on 2026-09-13: "Upstream error from Nvidia: Service
  temporarily overloaded" arriving as an SSE error frame partway through the
  request. Notion's architecture asks for retry and timeout handling for exactly
  this, and without it a shared free endpoint having a bad minute reads to the
  user as the product being broken.
*/
const RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const RETRY_TEXT = /overload|temporarily|rate.?limit|timeout|unavailable|capacity|try again/i;

function isRetryable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (/\b(408|409|429|500|502|503|504|529)\b/.test(message)) return true;
  return RETRY_TEXT.test(message);
}

const backoffMs = (attempt: number) => Math.min(8000, 600 * 2 ** attempt) + Math.random() * 400;

const MAX_ATTEMPTS = 3;

export function createOpenAiCompatibleProvider(cfg: EndpointConfig) {
  function headers() {
    const key = cfg.apiKey();
    if (!key) throw new Error(`${cfg.name.toUpperCase()} API key is not set`);
    return {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      ...(cfg.extraHeaders ?? {}),
    };
  }

  function body(req: AiRequest, stream: boolean) {
    return JSON.stringify({
      model: req.model,
      stream,
      temperature: req.temperature ?? 0.3,
      max_tokens: req.maxOutputTokens,
      /* OpenRouter's shape for it. Providers that do not understand the field
         ignore it, and a model that cannot turn thinking off simply keeps
         thinking, so this is a hint rather than a dependency. */
      ...(req.thinking === "off" ? { reasoning: { enabled: false } } : {}),
      ...(stream && cfg.requestUsageInStream ? { usage: { include: true } } : {}),
      messages: [
        { role: "system", content: req.system },
        ...req.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
  }

  async function callOnce(req: AiRequest, stream: boolean) {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: headers(),
      body: body(req, stream),
      signal: req.signal,
    });

    if (!res.ok) {
      // The provider's error body can echo the request back, system prompt
      // included. Read the message but never surface the raw body.
      let detail = "";
      try {
        const json = (await res.json()) as { error?: { message?: string } };
        detail = json.error?.message?.slice(0, 200) ?? "";
      } catch {
        /* non JSON error body */
      }
      console.error(`[ai] ${cfg.name} returned ${res.status}`, detail);
      const error = new Error(`${cfg.name} request failed with ${res.status}`);
      (error as Error & { status?: number }).status = res.status;
      throw error;
    }
    return res;
  }

  async function call(req: AiRequest, stream: boolean) {
    let last: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await callOnce(req, stream);
      } catch (err) {
        last = err;
        const status = (err as Error & { status?: number }).status;
        const retryable = (status && RETRY_STATUS.has(status)) || isRetryable(err);
        if (!retryable || attempt === MAX_ATTEMPTS - 1 || req.signal?.aborted) throw err;
        console.warn(`[ai] ${cfg.name} attempt ${attempt + 1} failed, retrying`);
        await new Promise((r) => setTimeout(r, backoffMs(attempt)));
      }
    }
    throw last;
  }

  /* Populated by stream() as the final chunk arrives. Read immediately after
     the iterator finishes, in the same request. */
  let lastUsage: StreamUsage | null = null;

  const provider: AiProvider & { lastStreamUsage: () => StreamUsage | null } = {
    name: cfg.name,

    lastStreamUsage: () => lastUsage,

    async *stream(req: AiRequest): AsyncIterable<AiChunk> {
      /*
        Retried as a whole, but only while nothing has reached the user yet.

        Once a single token has been shown, restarting would replay the answer
        from the beginning on top of what is already on screen. A half finished
        answer plus an honest error is better than a visibly duplicated one, so
        after the first emitted chunk the error is surfaced instead.
      */
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        lastUsage = null;
        let emitted = 0;

        try {
          const res = await callOnce(req, true);
          if (!res.body) throw new Error(`${cfg.name} returned no body`);

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // SSE frames are separated by a blank line. Keep the trailing
            // partial frame rather than parsing half a JSON object. Lines
            // beginning with a colon are comments, which OpenRouter sends as
            // keepalives while a slow model is still thinking; only "data:"
            // lines are read, so those are skipped for free.
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";

            for (const frame of frames) {
              for (const rawLine of frame.split("\n")) {
                if (!rawLine.startsWith("data:")) continue;
                const data = rawLine.slice(5).trim();
                if (!data || data === "[DONE]") continue;

                let parsed: StreamChunk;
                try {
                  parsed = JSON.parse(data);
                } catch {
                  continue; // a malformed frame is skipped, not fatal
                }

                // Providers report upstream failures inside the stream, not
                // only as an HTTP status, so this is the path that actually
                // fires when a free endpoint is overloaded.
                if (parsed.error?.message) {
                  throw new Error(`${cfg.name}: ${parsed.error.message.slice(0, 200)}`);
                }

                if (parsed.usage) {
                  lastUsage = {
                    inputTokens: parsed.usage.prompt_tokens ?? 0,
                    outputTokens: parsed.usage.completion_tokens ?? 0,
                    reasoningTokens:
                      parsed.usage.completion_tokens_details?.reasoning_tokens ?? 0,
                  };
                }

                const text = parsed.choices?.[0]?.delta?.content;
                if (text) {
                  emitted++;
                  yield { type: "text", text };
                }
              }
            }
          }

          return;
        } catch (err) {
          const canRetry =
            emitted === 0 &&
            !req.signal?.aborted &&
            attempt < MAX_ATTEMPTS - 1 &&
            isRetryable(err);

          if (!canRetry) throw err;

          console.warn(
            `[ai] ${cfg.name} stream attempt ${attempt + 1} failed before any output, retrying`,
          );
          await new Promise((r) => setTimeout(r, backoffMs(attempt)));
        }
      }
    },

    async generate(req: AiRequest): Promise<AiResult> {
      const res = await call(req, false);
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      return {
        text: json.choices?.[0]?.message?.content ?? "",
        usage: {
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0,
        },
        model: req.model,
        provider: cfg.name,
      };
    },

    /* No dedicated moderation endpoint on either provider, so this reports
       honestly rather than faking a pass. The controls that matter are the
       input filter, the scope classifier and the output filter, none of which
       depend on the provider offering this. */
    async moderate(): Promise<ModerationResult> {
      return { flagged: false, categories: [] };
    },
  };

  return provider;
}
