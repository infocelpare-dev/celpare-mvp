import type { Doc } from "../types";
import { OPERATOR } from "../operator";

/*
  AI and your data, version 1.0 (phase LEGAL, 2026-10-07). How Ask Celpare
  handles a question, from docs/context/11-ask-celpare.md and src/lib/ai.

  The provider statement was checked on 2026-10-07: the configured endpoint is
  an OpenRouter free endpoint whose provider says use is logged for security
  and to improve its products, not linked to identity. The model is not named
  (D64). If the endpoint changes to one that does not log, change section 4.
*/

export const aiData: Doc = {
  slug: "ai-data",
  title: "AI and your data",
  description: "How Ask Celpare answers questions, what it sends to an AI model provider and to web search, and what it keeps.",
  version: "1.0",
  effective: "2026-10-07",
  summary: [
    "Your question, with recent messages from the same chat and the catalogue facts Celpare found, is sent to an AI model provider to write the answer. Your name and email are not sent.",
    "The current provider may log questions for security and to improve its products, without your identity. Do not put passwords, secrets or other people's personal data into a question.",
    "Signed out questions are never saved. Signed in, a chat is saved to your account only while chat history is on, and you can delete it.",
    "Celpare does not use your questions to train its own models. It has none.",
  ],
  sections: [
    {
      id: "how-it-works",
      heading: "1. How Ask Celpare answers",
      blocks: [
        {
          steps: [
            "Your question is checked on our server. Greetings and thanks are answered without any AI model. Code is not run and questions made of code are declined. Questions outside AI tools, models, technology and software are declined.",
            "If it is unclear whether a question is in scope, a short check is made with the AI model provider.",
            "Celpare always searches its own catalogue (tools, models, SaaS and tech) and documentation for what fits the question.",
            "If the question needs current information and your plan includes web search, the search terms are sent to a web search provider.",
            "Your question, recent messages from the same chat, and what was found are sent to the AI model provider, which writes the answer. The answer is checked by our server as it streams to you.",
          ],
        },
        "Answers can be wrong or out of date. Check important facts on the tool's own website. See section 5 of the [Terms](/legal/terms#information).",
      ],
    },
    {
      id: "what-is-sent",
      heading: "2. What leaves Celpare",
      blocks: [
        {
          table: {
            head: ["Sent to", "What", "Not sent"],
            rows: [
              ["AI model provider, through OpenRouter", "Your question, recent messages in the same chat, catalogue and documentation excerpts, search results", "Your name, email, account id, profile or location"],
              ["Web search provider (Serper)", "Search terms derived from your question, only when web search runs", "Anything about you"],
              ["Error monitoring (Sentry)", "Timing, token counts and whether the asker was signed in", "The question or the answer"],
            ],
          },
        },
        "Which model answers is not published, so it can change without notice. The [Subprocessors](/legal/subprocessors) page lists the providers.",
      ],
    },
    {
      id: "what-is-kept",
      heading: "3. What Celpare keeps",
      blocks: [
        {
          list: [
            "Signed out: nothing about the conversation is saved. A random cookie and a hashed network address count your questions against the daily limit.",
            "Signed in with chat history on: the conversation, its answers and sources are saved to your account, visible only to you, until you delete the chat or your account.",
            "Signed in with chat history off: the conversation is not saved.",
            "For every question: a usage record with the plan, which features ran, and the size of the answer, so plan limits can be applied. It does not contain the question.",
          ],
        },
        "Celpare staff have no screen that shows your conversations.",
      ],
    },
    {
      id: "training",
      heading: "4. Training and the model provider",
      blocks: [
        "Celpare does not train AI models and does not use your questions to train any.",
        "The model provider that currently answers Ask Celpare states that its service is logged for security purposes and to improve its products and services, and that this logged data is not linked to your identity or any persistent identifier. Because of that, treat a question as something a third party may read: do not include passwords, keys, health information or other people's personal data.",
        "If Celpare moves to a provider that does not log or use questions, this page will say so.",
      ],
    },
    {
      id: "control",
      heading: "5. Your controls",
      blocks: [
        {
          list: [
            "Switch chat history and web search on or off in [Settings](/settings).",
            "Delete a single chat from the chat list, or all your data with your account.",
            "Download your saved chats with **Download my data** in [Settings](/settings#your-data).",
          ],
        },
        `Questions: [${OPERATOR.privacy}](mailto:${OPERATOR.privacy}).`,
      ],
    },
  ],
  changes: [{ version: "1.0", date: "2026-10-07", note: "First version." }],
};
