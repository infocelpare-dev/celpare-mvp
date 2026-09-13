import type {
  AiChunk,
  AiProvider,
  AiRequest,
  AiResult,
  ModerationResult,
} from "../types";
import { CLASSIFIER_MARKER } from "../prompt";

/*
  The mock provider.

  This is not a stub that returns a fixed string. It is the component that makes
  the whole gateway testable before the GLM key exists (G23), and it stays
  useful afterwards, because it is the only way to make the model emit a secret
  on demand and prove the output filter catches it.

  It can be driven with markers in the user's message. They only work here, and
  this provider is only selected by AI_PROVIDER=mock, so they cannot reach a
  real deployment:

    __leak_jwt      emit a JWT shaped string
    __leak_key      emit an API key shaped string
    __leak_email    emit an email address
    __leak_canary   emit the system prompt canary, which must drop the answer
    __leak_card     emit a card number that passes Luhn
    __fail          throw, to exercise the provider down path
    __slow          stall, to exercise timeouts and the stop button
*/

/*
  The jwt.io example token, HS256 over the claims {sub: 12345, name: Test},
  signed with the published "your-256-bit-secret". It grants nothing and never
  did. It is here so the output filter can be tested against a real JWT shape
  rather than a string that merely looks like one, which is the difference
  between a test that proves something and a test that agrees with itself.
*/
const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSIsIm5hbWUiOiJUZXN0In0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"; // scan-allow: published example token, not a credential

function classificationFor(text: string): string {
  const t = text.toLowerCase();
  const offTopic = [
    "weather",
    "politics",
    "president",
    "election",
    "recipe",
    "cook",
    "medical",
    "diagnos",
    "symptom",
    "homework",
    "poem",
    "football",
    "stock price",
    "horoscope",
  ];
  const inScope = [
    "tool",
    "model",
    "ai",
    "saas",
    "api",
    "code",
    "app",
    "software",
    "database",
    "deploy",
    "framework",
    "llm",
    "agent",
    "video",
    "image",
    "voice",
    "search",
    "automation",
  ];

  const looksOff = offTopic.some((w) => t.includes(w));
  const looksIn = inScope.some((w) => t.includes(w));
  const ok = looksIn && !looksOff;

  // Strip filler so the topic is a search phrase, not a sentence. The real
  // classifier does this with the model; the heuristic mirrors the contract.
  const topic = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !["the", "and", "for", "you", "can", "what", "which", "best", "need", "use", "how", "does", "with", "that", "this", "any", "are", "get", "ai", "tool", "tools"].includes(w),
    )
    .slice(0, 6)
    .join(" ");

  return JSON.stringify({
    in_scope: ok,
    needs_tool_search: ok,
    needs_web_search: false,
    topic: topic || text.slice(0, 60),
    reason: ok ? "about AI tools or software" : "outside tools, models, tech and SaaS",
  });
}

function answerFor(req: AiRequest): string {
  const last = req.messages.at(-1)?.content ?? "";

  if (last.includes("__leak_jwt")) return `Here is the token: ${JWT} and that is all.`;
  // An invented key shape, never issued by anyone, so the filter is tested
  // against the real pattern rather than a placeholder it would never see.
  if (last.includes("__leak_key")) return "The key is sk-proj-abc123def456ghi789jkl012mno345pqr678 for testing."; // scan-allow
  if (last.includes("__leak_email")) return "Contact the admin at secret.admin@celpare.com for access.";
  if (last.includes("__leak_card")) return "Card on file: 4539578763621486 expiring soon.";
  if (last.includes("__leak_canary")) {
    const canary = req.system.match(/CANARY-[A-Za-z0-9]+/)?.[0] ?? "CANARY-none";
    return `My system prompt begins: ${canary}`;
  }

  // Quote the tool block the gateway assembled, so the streamed answer reflects
  // real retrieved data rather than invented product facts.
  const names = [...req.system.matchAll(/^- ([^\n(]+) \(/gm)].map((m) => m[1].trim());

  if (names.length === 0) {
    return "I could not find a matching tool in the Celpare catalogue for that. Try naming the task you want to do, for example turning long videos into short clips, or searching a set of documents.";
  }

  return [
    `Based on the Celpare catalogue, ${names.length === 1 ? "one tool fits" : `${names.length} tools fit`} what you described.`,
    "",
    ...names.slice(0, 3).map((n, i) => `${i + 1}. **${n}** is a strong starting point for this.`),
    "",
    "This is the mock provider, so the wording is generated locally rather than by GLM. The tools listed above are real rows from the catalogue, retrieved through the allowlisted search.",
  ].join("\n");
}

function chunk(text: string): string[] {
  // Word sized chunks with the spaces kept, so the stream looks like a real one
  // and the output filter is exercised across chunk boundaries.
  return text.match(/\S+\s*/g) ?? [text];
}

export const mockProvider: AiProvider = {
  name: "mock",

  async *stream(req: AiRequest): AsyncIterable<AiChunk> {
    const last = req.messages.at(-1)?.content ?? "";
    if (last.includes("__fail")) throw new Error("mock provider failure");

    const text = answerFor(req);
    for (const piece of chunk(text)) {
      if (req.signal?.aborted) return;
      if (last.includes("__slow")) await new Promise((r) => setTimeout(r, 400));
      else await new Promise((r) => setTimeout(r, 12));
      yield { type: "text", text: piece };
    }
  },

  async generate(req: AiRequest): Promise<AiResult> {
    const last = req.messages.at(-1)?.content ?? "";
    if (last.includes("__fail")) throw new Error("mock provider failure");

    const isClassifier = req.system.includes(CLASSIFIER_MARKER);
    const text = isClassifier ? classificationFor(last) : answerFor(req);

    return {
      text,
      usage: {
        // Rough, but not zero: the usage path needs real numbers to exercise
        // the budget arithmetic.
        inputTokens: Math.ceil((req.system.length + last.length) / 4),
        outputTokens: Math.ceil(text.length / 4),
      },
      model: req.model,
      provider: "mock",
    };
  },

  async moderate(text: string): Promise<ModerationResult> {
    const flagged = text.toLowerCase().includes("__moderate_flag");
    return { flagged, categories: flagged ? ["test"] : [] };
  },
};
