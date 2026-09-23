import { CLASSIFIER_SYSTEM } from "./prompt";
import { getProvider, models } from "./providers";
import type { ChatKind, Classification } from "./types";

/*
  Step 5 of the gateway pipeline, and the control that enforces the scope rule
  (D35): tools, models, tech and SaaS, nothing else.

  Two stages, because one was not survivable.

  Stage 1 is a local heuristic. It costs nothing and no network call, and it
  decides the clear cases: an obviously off topic question is refused before any
  spend, and an obviously in scope one goes straight through with a locally
  extracted search topic.

  Stage 2 calls a model, but only for the genuinely ambiguous middle.

  The reason for stage 1 is not only cost. On a free tier the small models are
  unreliable: nemotron-3.5-lightning returned pure gibberish to a JSON
  classification prompt, gemma-4 was rate limited upstream, and lfm-2.5 returned
  no content at all. Making every message depend on one of those means the
  product stops working when a shared free endpoint has a bad afternoon.

  And when stage 2 does run and comes back unusable, it retries once on the main
  model before giving up. The first version failed closed immediately, which
  meant a broken classifier model refused every question in the product,
  including "I need a tool to turn long videos into short clips". Failing closed
  is right for "I could not decide"; it is wrong as the response to "the cheap
  model is having a bad day".

  There is a third lane, added after the founder watched it answer "hi" with the
  scope refusal. A greeting, a thank you, "what can you do", or a two word
  follow up is not an off topic question. It is the conversation around the
  question, and a product that cannot say hello back reads as a form with a
  send button. "chat" answers briefly, retrieves nothing, and costs no search.
  The scope rule (D35) is untouched: weather, politics and recipes are still
  refused, and a chat turn may not be used to smuggle one in, because the
  conversational patterns below only match when the message carries no other
  subject.
*/

/* Strong off topic signals. A question containing one of these, and no in scope
   signal, is refused without a model call. */
const OFF_TOPIC = [
  "weather", "forecast", "temperature outside",
  "politic", "president", "election", "government", "war in",
  "recipe", "cook", "bake", "ingredient",
  "symptom", "diagnos", "medicine", "dosage", "prescription", "illness",
  "lyrics", "poem", "sonnet", "write me a story", "short story",
  "horoscope", "astrology", "zodiac",
  "football", "soccer", "basketball", "match result", "premier league",
  "stock price", "share price", "crypto price", "bitcoin price",
  "girlfriend", "boyfriend", "relationship advice",
  "homework", "essay about", "history of the roman",
];

/* In scope signals. Deliberately generous: the founder's rule covers tools,
   models, tech and SaaS, which is a wide subject, and a narrow list would
   refuse real questions. */
const IN_SCOPE = [
  "tool", "model", "llm", "ai ", " ai", "a.i", "saas", "software", "app ", "apps",
  "api", "sdk", "library", "framework", "platform", "service",
  "code", "coding", "program", "developer", "deploy", "hosting", "server",
  "database", "postgres", "sql", "vector", "embedding", "rag",
  "agent", "automation", "workflow", "integration", "webhook",
  "chatbot", "assistant", "prompt", "fine tun", "inference", "token",
  "image gener", "video gener", "voice", "speech", "transcri", "avatar",
  "design tool", "editor", "ide", "repo", "git", "cloud", "docker",
  "subscription", "pricing", "free tier", "open source", "self host",
  "celpare", "chatgpt", "claude", "gemini", "openai", "anthropic", "cursor",
  "copilot", "midjourney", "runway", "supabase", "vercel", "notion", "figma",
  "compare", "alternative", "instead of", "best for", "which one",
  /* Model evaluation. A question about what a benchmark measures, or how a
     model scored on one, is squarely about AI models, and without these it
     read as off topic: "What does Terminal-Bench measure?" was refused. */
  "benchmark", "-bench", "bench ", "leaderboard", "eval", "osworld", "gdpval",
  "last exam", "chartography", "frontiercode", "automationbench", "cursorbench",
  "gpt", "opus", "fable", "grok", "deepseek", "llama", "mistral", "qwen",
];

/*
  Conversational openers and closers. Matched against the whole message, not
  searched inside it, so "hi" is a greeting and "hi, what is the best weather
  app for politics" is not: the second one falls through to the scope checks
  like any other question.
*/
const GREETING =
  /^(hi|hii+|hey+|hello+|yo|sup|wassup|wazzup|whatsup|hiya|howdy|good\s?(morning|afternoon|evening|day)|greetings|namaste|salam|hola)\b[\s!.,?]*$/i;

const COURTESY =
  /^(thanks?|thank you|thx|ty|cheers|nice|cool|great|awesome|perfect|ok(ay)?|got it|understood|sounds good|bye|goodbye|see ya|no worries|sorry|my bad)\b[\s!.,?]*$/i;

/* Questions about the assistant itself. These belong to Celpare, so they are
   answered from the documentation rather than refused or searched for. */
const META =
  /^(who (are|r) (you|u)|what (are|r) (you|u)|what (can|do) (you|u) do|what is (this|celpare)|how (do|does) (this|you|celpare) work|are you (an? )?(ai|bot|human|real)|how are you|how('s| is) it going|what('s| is) up|help|what should i ask|give me an example|what can i ask)\b[\s!.,?]*$/i;

/*
  Questions about the machinery rather than about the product: which model runs
  this, who the provider is, what the system prompt says.

  These are answered locally with a fixed line and never reach the model, which
  is the only way to be sure it does not answer them. A prompt rule saying "do
  not reveal the model" is one sentence competing with everything else in the
  context window, and it has to win every time; a message that never gets sent
  cannot lose.

  Matched anywhere in the message, not only as the whole message, because the
  usual shape is a real question with this one bolted on the end.
*/
const IDENTITY =
  /\b(what|which|who)\b[^?.!]{0,40}\b(model|llm|engine|provider|backend|powers?|built on|running on|based on|trained)\b[^?.!]{0,40}\b(you|celpare|this|behind|under the hood)\b|\b(are|r) (you|u) (chatgpt|gpt|claude|gemini|llama|mistral|deepseek|qwen|grok|copilot|an? (ai|llm|bot|model))\b|\bwhat (model|llm|ai) (are|r) (you|u)\b|\bwho (made|built|created|trained|owns) (you|celpare)\b|\bwhat('s| is) (your|the) (system prompt|prompt|instructions?|temperature|context window|training data)\b|\bwhich (company|lab|vendor|provider) (made|built|powers|runs)\b|\b(tell me|show me) (what|which) (model|llm|ai) \b/i;

/* A message that only makes sense as a continuation. Safe to treat as in scope
   when there is history, because scope was already decided on the turn it
   refers back to, and dangerous to treat that way when there is none. */
const FOLLOW_UP =
  /^(why|why\??|how|how\??|and\?|ok what else|what else|more|tell me more|go on|continue|explain( more| that| it)?|elaborate|expand|which one|the (first|second|third|last) one|that one|compare (them|those)|cheaper|free( one)?s?|any alternatives?|what about (it|that|them|the (other|rest)))\b[\s!.,?]*$/i;

type Stage1 = "in" | "out" | ChatKind | "unsure";

export type ClassifyContext = {
  /* Whether anything has been asked in this conversation already. */
  hasHistory: boolean;
  /* The last thing the person actually asked, used so a follow up searches for
     the subject rather than for the word "why". */
  previousTopic?: string;
};

function conversationalKind(question: string): ChatKind | null {
  const q = question.trim();
  if (IDENTITY.test(q)) return "identity";
  // A long message is a question with a greeting attached, not a greeting.
  if (q.length > 60) return null;
  if (GREETING.test(q)) return "greeting";
  if (COURTESY.test(q)) return "courtesy";
  if (META.test(q)) return "meta";
  return null;
}

const FILLER = new Set([
  "the", "and", "for", "you", "can", "what", "which", "best", "need", "use",
  "using", "how", "does", "with", "that", "this", "any", "are", "get", "ai",
  "tool", "tools", "some", "there", "have", "should", "would", "could", "want",
  "find", "good", "great", "like", "about", "from", "into", "make", "help",
  "please", "recommend", "suggestion", "suggest", "looking", "something",
]);

/* A search phrase, not a sentence. Passing the raw question to full text search
   drags in every common word and ranks badly. */
export function extractTopic(question: string): string {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9\s+.#-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !FILLER.has(w));

  return words.slice(0, 8).join(" ") || question.slice(0, 80);
}

function heuristic(question: string, ctx: ClassifyContext): Stage1 {
  const q = ` ${question.toLowerCase()} `;
  const off = OFF_TOPIC.some((w) => q.includes(w));
  const inScope = IN_SCOPE.some((w) => q.includes(w));

  // Conversational first, but never over an off topic signal: "hi, what is the
  // weather" is a weather question wearing a greeting.
  const chat = !off ? conversationalKind(question) : null;
  if (chat) return chat;

  if (off && !inScope) return "out";
  if (inScope && !off) return "in";

  /* A short continuation inside an existing conversation inherits the scope of
     the turn it continues. Without history the same words are a stranger's
     opening line, and that goes to the model like anything else ambiguous. */
  if (!off && ctx.hasHistory && FOLLOW_UP.test(question.trim())) return "in";

  return "unsure";
}

/* Does the answer plausibly need information newer than the model's training?
   Cheap to guess locally, and the founder's own note says not to call web
   search on every message. */
function looksTimeSensitive(question: string): boolean {
  return /\b(latest|newest|new(est)?|today|this (week|month|year)|20\d\d|just (released|launched)|recently|current(ly)?|right now|still)\b/i.test(
    question,
  );
}

/* What the model is asked for, which is close to a Classification but not the
   same shape: it reports "conversational" separately and the caller turns the
   pair into a kind. */
type ModelVerdict = Omit<Partial<Classification>, "kind"> & {
  conversational?: boolean;
};

function coerce(raw: string): ModelVerdict | null {
  // Models wrap JSON in prose or fences often enough that pulling the object
  // out is cheaper than fighting about it.
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (typeof parsed.in_scope !== "boolean") return null;

    return {
      inScope: parsed.in_scope,
      conversational: parsed.conversational === true,
      needsToolSearch: parsed.needs_tool_search === true,
      needsWebSearch: parsed.needs_web_search === true,
      topic:
        typeof parsed.topic === "string" && parsed.topic.trim()
          ? parsed.topic.trim().slice(0, 120)
          : undefined,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 80) : "",
    };
  } catch {
    return null;
  }
}

async function askModel(question: string, model: string): Promise<ModelVerdict | null> {
  const provider = getProvider();
  const result = await provider.generate({
    feature: "ask",
    system: CLASSIFIER_SYSTEM,
    // Only the current question. Conversation history is a lever for talking a
    // classifier into a yes over several turns, and scope is a property of the
    // question, not of the session.
    messages: [{ role: "user", content: question }],
    model,
    // Generous, because Nemotron is a reasoning model: it spends tokens
    // thinking before it writes the JSON, and a tight cap truncates the answer
    // rather than the reasoning.
    maxOutputTokens: 400,
    temperature: 0,
  });

  return coerce(result.text);
}

export async function classify(
  question: string,
  ctx: ClassifyContext = { hasHistory: false },
): Promise<Classification> {
  const own = extractTopic(question);
  /* A follow up carries almost no searchable words of its own. "why" searched
     literally returns nothing useful, so it searches for what the conversation
     is already about instead. */
  const isFollowUp = ctx.hasHistory && FOLLOW_UP.test(question.trim());
  const topic = isFollowUp && ctx.previousTopic ? ctx.previousTopic : own;
  const timeSensitive = looksTimeSensitive(question);
  const stage1 = heuristic(question, ctx);

  if (stage1 === "out") {
    return {
      kind: "off_topic",
      inScope: false,
      needsToolSearch: false,
      needsWebSearch: false,
      topic,
      reason: "off topic on a local check",
    };
  }

  if (
    stage1 === "greeting" ||
    stage1 === "courtesy" ||
    stage1 === "meta" ||
    stage1 === "identity"
  ) {
    return {
      kind: "chat",
      chatKind: stage1,
      inScope: true,
      // Nothing to retrieve. Searching the catalogue for "hi" returns noise and
      // spends a query on a turn that needs one friendly sentence.
      needsToolSearch: false,
      needsWebSearch: false,
      topic: "",
      reason: "conversational",
    };
  }

  if (stage1 === "in") {
    return {
      kind: "question",
      inScope: true,
      needsToolSearch: true,
      needsWebSearch: timeSensitive,
      topic,
      reason: "in scope on a local check",
    };
  }

  // Ambiguous. Now it is worth a model call.
  const { fast, main } = models();

  for (const model of fast === main ? [main] : [fast, main]) {
    try {
      const parsed = await askModel(question, model);
      if (parsed) {
        return {
          kind: parsed.conversational
            ? "chat"
            : parsed.inScope
              ? "question"
              : "off_topic",
          /* The model only reports "conversational", not which sort. Treated as
             meta, which is the branch that answers with the documentation: a
             greeting it failed to spot locally is better over answered than
             brushed off. */
          chatKind: parsed.conversational ? "meta" : undefined,
          inScope: parsed.inScope! || parsed.conversational === true,
          needsToolSearch: parsed.conversational
            ? false
            : (parsed.needsToolSearch ?? parsed.inScope!),
          needsWebSearch: parsed.conversational
            ? false
            : (parsed.needsWebSearch ?? timeSensitive),
          topic: parsed.conversational ? "" : (parsed.topic ?? topic),
          reason: parsed.reason ?? "",
        };
      }
      console.warn(`[ai] classifier ${model} returned unusable output, trying the next model`);
    } catch (err) {
      console.error(`[ai] classifier ${model} failed`, err);
    }
  }

  /*
    Every classifier attempt failed. Now fail closed: we genuinely do not know
    whether this is in scope, and the safe answer to "I do not know" is no.
    Failing open would turn a classifier outage into an open ended chatbot
    anyone can point at any subject, on our token budget.
  */
  return {
    kind: "off_topic",
    inScope: false,
    needsToolSearch: false,
    needsWebSearch: false,
    topic,
    reason: "classifier unavailable",
  };
}
