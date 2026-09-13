/*
  Shared types for the AI Gateway.

  Kept free of provider specifics on purpose. Nothing in here may reference GLM,
  OpenRouter or any SDK, because the whole point of the abstraction (D4, D34) is
  that swapping the model is an env var and not a rewrite.
*/

/* Every AI surface in Celpare. Notion's `What AI does in celpare` lists eight;
   only the advisor ships in v1. Tool permissions are granted per feature
   (D41), never globally, so this is a first class parameter and not an
   afterthought. */
export type AiFeature =
  | "ask" // AI Tool Advisor / Ask Celpare
  | "compare" // Tool Comparison
  | "recommend" // Personalized Recommendations
  | "setup" // Setup Guide
  | "learn" // Learning Mode
  | "workflow" // AI Workflow Builder
  | "video_search"
  | "image_search";

export type Plan = "anon" | "free" | "pro" | "premium";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/* A tool as the model is allowed to see it. These seven fields are the entire
   allowlist, and they mirror the return type of public.search_tools exactly.
   If this type ever grows a field the SQL function does not return, the
   boundary has been widened in the wrong place. */
export type ToolCitation = {
  slug: string;
  name: string;
  description: string;
  pricing: string | null;
  tags: string[];
  rating: number | null;
  features: string[];
};

export type WebResult = {
  title: string;
  url: string;
  snippet: string;
};

export type AiRequest = {
  feature: AiFeature;
  messages: ChatMessage[];
  /* Reserved for image and video input, which is deferred (D42). Validated as
     empty in v1 so the request shape does not change when uploads arrive. */
  attachments?: never[];
  maxOutputTokens: number;
  model: string;
  system: string;
  temperature?: number;
  /*
    Whether the model should think before it answers.

    Neutral on purpose, like the rest of this file: every current provider has
    some form of this and each adapter maps it to its own field. It exists
    because a reasoning model spends its output budget thinking, so a short
    answer with a small cap can come back empty. Measured on 2026-09-13:
    Nemotron 3 Ultra returned nothing for "hi" at a 220 token cap, and answered
    normally with thinking off.
  */
  thinking?: "off" | "default";
  signal?: AbortSignal;
};

export type AiChunk = { type: "text"; text: string };

export type Usage = {
  inputTokens: number;
  outputTokens: number;
};

export type AiResult = {
  text: string;
  usage: Usage;
  model: string;
  provider: string;
};

export type ModerationResult = {
  flagged: boolean;
  categories: string[];
};

export interface AiProvider {
  readonly name: string;
  stream(req: AiRequest): AsyncIterable<AiChunk>;
  generate(req: AiRequest): Promise<AiResult>;
  moderate(text: string): Promise<ModerationResult>;
}

/*
  What a message is, before any expensive call happens.

  "chat" is the lane that was missing: a greeting, a thank you, or a question
  about Celpare itself is not off topic, it is the conversation around the
  question. Refusing "hi" with the scope notice made the product feel like a
  form rather than an assistant.
*/
export type MessageKind = "question" | "chat" | "off_topic";

/* Which kind of chat turn it is. A greeting or a thank you is answered locally
   and instantly; a question about Celpare itself goes to the model with the
   documentation, because it deserves a real answer. */
export type ChatKind = "greeting" | "courtesy" | "meta" | "identity";

/* What the classifier decides before any expensive call happens. */
export type Classification = {
  kind: MessageKind;
  /* Only set when kind is "chat". */
  chatKind?: ChatKind;
  inScope: boolean;
  needsToolSearch: boolean;
  needsWebSearch: boolean;
  /* A cleaned search phrase, not the raw question. Passing the raw sentence to
     full text search drags in every common word and ranks badly. */
  topic: string;
  reason: string;
};

/* Why a request stopped, when it stopped early. Mirrors the status column on
   public.ai_usage_records. */
export type RefusalKind =
  | "refused_scope"
  | "rate_limited"
  | "filtered"
  | "error";

export type GatewayRefusal = {
  ok: false;
  kind: RefusalKind;
  message: string;
  /* Present on rate_limited, so the UI can say when it resets. */
  resetsAt?: string;
};

export type GatewayStream = {
  ok: true;
  stream: ReadableStream<Uint8Array>;
};

export type GatewayResponse = GatewayRefusal | GatewayStream;

/*
  The three retrieval modes a person can turn on for a message, and the plan
  gate over each. The client sends what it wants; the gateway decides what it
  gets. A toggle in a browser is a request, never a permission (D41).
*/
export type AskMode = "toolSearch" | "webSearch" | "deepResearch";

export type ModeRequest = Record<AskMode, boolean>;

/* What a plan may use, resolved server side and echoed back so the composer can
   render a lock rather than guess from the plan name. */
export type ModeGrant = {
  allowed: boolean;
  /* The lowest plan that unlocks it, for the copy on the lock. */
  requires: Plan | null;
};

export type ModeGrants = Record<AskMode, ModeGrant>;

/* What actually ran, so the UI can say so instead of implying it. */
export type ModesUsed = Record<AskMode, boolean>;
