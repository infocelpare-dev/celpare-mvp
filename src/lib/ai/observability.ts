import * as Sentry from "@sentry/nextjs";

/*
  Ask Celpare, as seen by Sentry's AI Agents dashboard.

  WHAT THIS DELIBERATELY DOES NOT SEND: the question, the answer, or any part of
  either.

  Sentry's manual instrumentation supports gen_ai.input.messages and
  gen_ai.output.messages, and populating them would light up the Conversations
  view. It would also copy every private conversation a person has with Ask
  Celpare into a third party, permanently, for the benefit of a nicer dashboard.
  The rest of this codebase refuses that trade everywhere else: the admin
  dashboard has no surface that reads a conversation, and D42 deferred an entire
  feature rather than accept files without a retention answer. This follows the
  same line. Model, tokens, cost, latency and outcome are what answer an
  operational question, and none of them are anybody's private text.

  CELPARE_AI_CAPTURE_CONTENT=true turns content capture on for a debugging
  session. It is off unless explicitly set, it is server side only, and it
  should not be left on.

  The spans are constructed after the call completes, with explicit start and
  end timestamps, rather than wrapped around the streaming loop. Two reasons.
  The numbers that matter, the provider's real token counts, only exist in the
  final stream chunk, so a span opened at the start would have to be mutated at
  the end anyway. And nothing here can break an answer that is already on the
  person's screen: it runs after the stream is done.
*/

const SECOND = 1000;

function captureContent(): boolean {
  return process.env.CELPARE_AI_CAPTURE_CONTENT === "true";
}

export type AiCall = {
  /* Which surface asked. 'ask' is the assistant; others may follow. */
  feature: string;
  provider: string;
  model: string;
  plan: string;
  userId: string | null;

  startedAt: number;
  endedAt: number;

  inputTokens: number;
  outputTokens: number;

  /* The gateway's own vocabulary: ok, error, filtered, rate_limited,
     refused_scope. Anything other than ok marks the span as failed, so the
     dashboard's error rate means what it says. */
  status: string;

  /* Retrieval that happened around the call. Recorded as attributes rather than
     as child gen_ai.execute_tool spans, because these are our own retrieval
     steps chosen by the gateway, not tools the model asked to run. Calling them
     tool calls would misreport how the thing actually works. */
  toolSearch: boolean;
  webSearch: boolean;
  deepResearch: boolean;
  searchCalls: number;
  citations: number;

  conversationId: string | null;

  /* Only read when CELPARE_AI_CAPTURE_CONTENT is on. */
  question?: string;
  answer?: string;
};

export function recordAiCall(call: AiCall): void {
  /* No DSN means Sentry was never initialised. Every call below would be a
     no-op, but returning early keeps this honest and free. */
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  const totalTokens = call.inputTokens + call.outputTokens;
  const durationMs = Math.max(0, call.endedAt - call.startedAt);
  const failed = call.status !== "ok";

  const shared: Record<string, string | number | boolean> = {
    "gen_ai.provider.name": call.provider,
    "gen_ai.request.model": call.model,
    "gen_ai.response.model": call.model,
    "gen_ai.usage.input_tokens": call.inputTokens,
    "gen_ai.usage.output_tokens": call.outputTokens,
    "gen_ai.usage.total_tokens": totalTokens,
    "gen_ai.response.streaming": true,
    /* Celpare's own dimensions, so spend and latency can be cut by plan and by
       surface without joining against anything. */
    "celpare.plan": call.plan,
    "celpare.feature": call.feature,
    "celpare.status": call.status,
    "celpare.signed_in": call.userId !== null,
  };

  try {
    const agent = Sentry.startInactiveSpan({
      op: "gen_ai.invoke_agent",
      name: "invoke_agent Ask Celpare",
      startTime: call.startedAt / SECOND,
      attributes: {
        ...shared,
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.name": "Ask Celpare",
        "gen_ai.pipeline.name": call.feature,
        "celpare.retrieval.tool_search": call.toolSearch,
        "celpare.retrieval.web_search": call.webSearch,
        "celpare.retrieval.deep_research": call.deepResearch,
        "celpare.retrieval.search_calls": call.searchCalls,
        "celpare.citations": call.citations,
      },
    });

    if (failed) agent.setStatus({ code: 2, message: "internal_error" });

    /* The model call itself, nested under the agent so per model cost is
       attributed to the agent that spent it. */
    Sentry.withActiveSpan(agent, () => {
      const chat = Sentry.startInactiveSpan({
        op: "gen_ai.chat",
        name: `chat ${call.model}`,
        startTime: call.startedAt / SECOND,
        attributes: {
          ...shared,
          "gen_ai.operation.name": "chat",
          "gen_ai.agent.name": "Ask Celpare",
        },
      });

      if (captureContent()) {
        if (call.question) {
          chat.setAttribute(
            "gen_ai.input.messages",
            JSON.stringify([
              { role: "user", parts: [{ type: "text", content: call.question }] },
            ]),
          );
        }
        if (call.answer) {
          chat.setAttribute(
            "gen_ai.output.messages",
            JSON.stringify([
              { role: "assistant", parts: [{ type: "text", content: call.answer }] },
            ]),
          );
        }
      }

      if (failed) chat.setStatus({ code: 2, message: "internal_error" });
      chat.end(call.endedAt / SECOND);
    });

    agent.end(call.endedAt / SECOND);

    /*
      Application Metrics. The same facts as the span, in the form you can chart
      and alert on without sampling: spans are sampled at 10% in production,
      metrics are not, so "how many answers failed today" stays correct.
    */
    Sentry.metrics.count("ai.requests", 1, {
      attributes: { status: call.status, model: call.model, plan: call.plan },
    });
    Sentry.metrics.distribution("ai.tokens.total", totalTokens, {
      unit: "none",
      attributes: { model: call.model, plan: call.plan },
    });
    Sentry.metrics.distribution("ai.latency", durationMs, {
      unit: "millisecond",
      attributes: { model: call.model, status: call.status },
    });

    /*
      Structured logs. Deliberately the one place a failed answer is written
      down with enough context to chase it, and deliberately without the
      question that caused it.
    */
    if (failed) {
      Sentry.logger.error("Ask Celpare did not answer", {
        status: call.status,
        model: call.model,
        provider: call.provider,
        plan: call.plan,
        durationMs,
        conversationId: call.conversationId,
      });
    } else {
      Sentry.logger.info("Ask Celpare answered", {
        model: call.model,
        plan: call.plan,
        totalTokens,
        durationMs,
      });
    }
  } catch (err) {
    /* Monitoring must never be the thing that breaks the product. */
    console.error("[ai] recording observability failed", err);
  }
}
