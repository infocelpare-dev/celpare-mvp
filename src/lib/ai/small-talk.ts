/*
  Greetings and thank yous, answered locally.

  The model behind Celpare is a 550B reasoning model on a free endpoint, and on
  2026-09-13 it took 83 seconds to answer "hi". It also spends its token budget
  thinking before it writes, so a tight cap on a greeting returns an empty
  answer: the reasoning consumed the allowance and nothing was left for the two
  words that were wanted.

  A greeting has one good answer. Writing it here makes it instant, free, and
  impossible to get wrong, and it keeps the model for the questions where
  thinking is the point. This is the same argument stage 1 of the classifier
  makes: do not put a network call in front of something already known.

  Meta questions are deliberately not here. "How does Celpare work" deserves a
  real answer from the documentation, so it goes to the model like any other
  question.
*/

export type SmallTalk = "greeting" | "courtesy" | "identity";

const OPENERS = [
  "Hello. Tell me what you are trying to do and I will find the tools for it.",
  "Hi. Describe what you are trying to build or get done, and I will suggest what to use.",
];

/* A follow up greeting mid conversation should not repeat the whole pitch. */
const RETURNING = "Hello again. What are you working on?";

const EXAMPLES = [
  "For example: which tool turns long videos into short clips?",
  "For example: which vector database should I use for search?",
  "For example: what is the best AI editor for writing code?",
];

const THANKS = "You are welcome. Ask me anything else about AI tools, models, software or SaaS.";

const FAREWELL = "Take care. Come back whenever you need to find the right tool.";

/*
  What Ask Celpare says when asked what runs it.

  The founder's rule: the model behind Celpare is not disclosed. This answer is
  returned locally and the question never reaches a model, so there is nothing
  to talk into revealing it. It does not pretend to be a person, which would be
  its own problem, and it does not stonewall either: it says what it will not
  say, then offers what it can do.
*/
const IDENTITY_REPLY =
  "I am Ask Celpare, the assistant built into Celpare. Which model or provider runs underneath is not something Celpare shares, and it can change. What I can tell you is where my answers come from: the Celpare tool catalogue, Celpare's own documentation, and the web when a question needs something current. Ask me what you are trying to build or choose.";

const FAREWELL_WORDS = /\b(bye|goodbye|see ya|see you|later|good night)\b/i;
const THANKS_WORDS = /\b(thanks|thank you|thx|ty|cheers|appreciate)\b/i;

/*
  Deterministic rather than random: varied by the length of the message so the
  same input always produces the same reply. A random greeting is harder to test
  and no warmer to read.
*/
export function smallTalkReply(
  kind: SmallTalk,
  message: string,
  hasHistory: boolean,
): string {
  if (kind === "identity") return IDENTITY_REPLY;

  if (kind === "courtesy") {
    if (FAREWELL_WORDS.test(message)) return FAREWELL;
    if (THANKS_WORDS.test(message)) return THANKS;
    // "ok", "cool", "got it". An acknowledgement wants acknowledging, briefly.
    return "Got it. What else can I help you choose?";
  }

  if (hasHistory) return RETURNING;

  const pick = message.trim().length % OPENERS.length;
  const example = message.trim().length % EXAMPLES.length;
  return `${OPENERS[pick]} ${EXAMPLES[example]}`;
}
