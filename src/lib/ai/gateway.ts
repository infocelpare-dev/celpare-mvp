import {
  ANSWER_THINKING,
  FEATURES,
  MIN_CATALOGUE_MATCH,
  PLAN_LIMITS,
  RESEARCH_THINKING,
  RESEARCH_USES_FULL_CEILING,
} from "./config";
import { classify, extractTopic } from "./classify";
import { looksLikeAboutCelpare, searchDocs } from "./celpare-docs";
import { ensureConversation, saveTurn } from "./conversations";
import { identify, type Identity } from "./identity";
import { filterInput } from "./input-filter";
import { OutputFilter } from "./output-filter";
import { buildChatPrompt, buildResearchPrompt, buildSystemPrompt, newCanary } from "./prompt";
import { grantsFor } from "./modes";
import { runDeepResearch } from "./research";
import { smallTalkReply } from "./small-talk";
import { getProvider, models, providerName } from "./providers";
import { checkLimits, countMessage, countTokens } from "./ratelimit";
import { loadToolCards, searchTools, type ToolCard } from "./tool-search";
import { estimateTokens, recordUsage } from "./usage";
import { webSearch } from "./web-search";
import type {
  AiFeature,
  ChatMessage,
  GatewayResponse,
  ModeGrants,
  ModeRequest,
  ModesUsed,
  ToolCitation,
  WebResult,
} from "./types";

/*
  The AI Gateway.

  Notion's nine steps, in order, and the only thing any route is allowed to
  call. No feature talks to a provider directly, which is the rule that keeps
  the model an env var (D4, D34) and the spend measurable.

    1 identify        session, else a signed anonymous cookie
    2 plan            profiles.plan, or anon
    3 limits          Redis, fails closed
    4 input filter    Layer 1
    5 classify        in scope, and what to retrieve. Before any spend.
    6 retrieve        allowlisted tool search, optional web search
    7 model           streamed
    8 output filter   Layer 3, behind a sliding window
    9 persist         usage always, conversation only when signed in
*/

const encoder = new TextEncoder();

/* The wire format. One JSON object per line, which is enough structure to carry
   citations and errors alongside the text without pulling in a protocol. */
type Event =
  | {
      t: "meta";
      plan: string;
      /* What this plan may use, so the composer renders a lock rather than
         inferring permission from the plan name. */
      grants: ModeGrants;
      /* What actually ran for this message, which is not always what was asked
         for: a mode can be on and still not fire, because the question did not
         need it. */
      used: ModesUsed;
    }
  | { t: "step"; v: string }
  /* The recommendation cards. `citations` is what the model was given and what
     gets persisted; `cards` is the public record behind each one, which may
     show more, because the allowlist limits the model and not the reader. */
  | { t: "cards"; citations: ToolCitation[]; cards: ToolCard[] }
  | { t: "sources"; v: WebResult[] }
  | { t: "text"; v: string }
  | { t: "error"; v: string }
  | { t: "done"; conversationId: string | null };

/*
  Enqueue, unless the reader has gone.

  Somebody closing the tab mid answer cancels the stream, and every enqueue
  after that throws ERR_INVALID_STATE. Thrown from inside the catch block it
  becomes an unhandled error in the server log that looks like a bug in the
  pipeline rather than a person navigating away.
*/
function emit(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: Event,
): void {
  try {
    /* One JSON object per line, which is enough structure to carry citations,
       research steps and errors alongside the text without pulling in a
       protocol. */
    controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
  } catch {
    // The reader is gone. Nothing to do and nothing worth logging.
  }
}

export type AskInput = {
  feature: AiFeature;
  message: string;
  history: ChatMessage[];
  conversationId?: string | null;
  /* What the composer asked for. A request, never a permission: everything here
     is intersected with the plan below, so turning a toggle on in the browser
     grants nothing the account does not already have. */
  modes?: Partial<ModeRequest>;
};


export async function ask(input: AskInput): Promise<GatewayResponse & { identity?: Identity }> {
  const started = Date.now();
  const feature = FEATURES[input.feature];

  if (!feature?.shipped) {
    return { ok: false, kind: "error", message: "That feature is not available yet." };
  }

  // 1 and 2
  const identity = await identify();
  const limits = PLAN_LIMITS[identity.plan];
  const provider = getProvider();
  const { main } = models();

  const baseUsage = {
    userId: identity.userId,
    anonHash: identity.anonHash,
    plan: identity.plan,
    feature: input.feature,
    provider: providerName(),
    model: main,
    inputTokens: 0,
    outputTokens: 0,
  };

  // 4, before 3, because rejecting junk should not consume anyone's allowance.
  const cleaned = filterInput(input.message);
  if (!cleaned.ok) {
    await recordUsage({ ...baseUsage, latencyMs: Date.now() - started, status: "filtered" });
    return { ok: false, kind: "filtered", message: cleaned.message, identity };
  }

  // 3
  const verdict = await checkLimits(identity.subject, identity.plan);
  if (!verdict.allowed) {
    await recordUsage({ ...baseUsage, latencyMs: Date.now() - started, status: "rate_limited" });
    return {
      ok: false,
      kind: "rate_limited",
      message: verdict.message,
      resetsAt: verdict.resetsAt,
      identity,
    };
  }

  /*
    What this plan may use. Computed before the classifier so it can be sent
    back on a refusal too: the composer needs to know which toggles to lock
    whatever the answer turns out to be.
  */
  const grants = grantsFor(identity.plan, input.feature);

  /*
    The composer's toggles, intersected with the grants. Defaults matter here:
    tool search and web search default to on, because that is what the product
    did before the toggles existed, and deep research defaults to off, because
    it costs several searches and nobody should pay for it by accident.
  */
  const wants: ModeRequest = {
    toolSearch: input.modes?.toolSearch !== false,
    webSearch: input.modes?.webSearch !== false && identity.settings.webSearch !== false,
    deepResearch: input.modes?.deepResearch === true,
  };

  // 5. The scope gate, before anything expensive.
  const previous = [...input.history].reverse().find((m) => m.role === "user");
  const classification = await classify(cleaned.text, {
    hasHistory: input.history.length > 0,
    previousTopic: previous ? extractTopic(previous.content) : undefined,
  });

  if (!classification.inScope) {
    /* A refusal still costs a message. Pointing the product at off topic
       subjects repeatedly is the behaviour the allowance is there to slow
       down, and not counting it would make refusals free to spam. */
    await countMessage(identity.subject);
    await recordUsage({ ...baseUsage, latencyMs: Date.now() - started, status: "refused_scope" });
    return {
      ok: false,
      kind: "refused_scope",
      message:
        "I only answer questions about AI tools, models, tech and SaaS. Ask me something like which tool turns long videos into short clips, or which vector database to use for search.",
      identity,
    };
  }

  /*
    A greeting or a thank you is in scope now, and it retrieves nothing: no
    catalogue query, no web search, no deep research, however the toggles are
    set. Searching the catalogue for "hi" spends a query to return noise.
  */
  const conversational = classification.kind === "chat";
  const smallTalk =
    classification.chatKind === "greeting" ||
    classification.chatKind === "courtesy" ||
    /* Answered here so the question never reaches a model that could be talked
       into answering it differently. */
    classification.chatKind === "identity";

  /*
    Greetings and thank yous are answered here, with no model call at all.

    The reasoning model takes tens of seconds and spends its token budget
    thinking, which on a two word greeting produced an 83 second wait and
    sometimes an empty answer. It also costs nothing to get right: see
    small-talk.ts. No message is counted either, because nothing was spent.
  */
  if (smallTalk) {
    const reply = smallTalkReply(
      classification.chatKind as "greeting" | "courtesy" | "identity",
      cleaned.text,
      input.history.length > 0,
    );

    await recordUsage({ ...baseUsage, latencyMs: Date.now() - started, status: "ok" });

    const local = new ReadableStream<Uint8Array>({
      async start(controller) {
        emit(controller, {
            t: "meta",
            plan: identity.plan,
            grants,
            used: { toolSearch: false, webSearch: false, deepResearch: false },
          });
        emit(controller, { t: "text", v: reply });
        /* Appended to a conversation that already exists, never the reason to
           create one: a saved chat titled "hi" is noise in the sidebar. */
        let conversationId: string | null = null;
        if (
          identity.userId &&
          limits.savesHistory &&
          identity.settings.saveHistory !== false &&
          input.conversationId
        ) {
          try {
            await saveTurn({
              conversationId: input.conversationId,
              question: cleaned.text,
              answer: reply,
              citations: [],
              model: "local",
              provider: "local",
              inputTokens: 0,
              outputTokens: 0,
            });
            conversationId = input.conversationId;
          } catch (err) {
            console.error("[ai] persisting the small talk turn failed", err);
          }
        }
        emit(controller, { t: "done", conversationId });
        controller.close();
      },
    });

    return { ok: true, stream: local, identity };
  }

  // Counted on acceptance, so abandoning a stream does not refund a message and
  // hand out an unlimited allowance to anyone who closes the tab.
  await countMessage(identity.subject);

  // 6. Tool permissions are per feature, per plan and now per toggle (D41),
  // never global. Each of the three has to agree.
  const doToolSearch =
    !conversational && grants.toolSearch.allowed && wants.toolSearch && classification.needsToolSearch;

  const doDeepResearch = !conversational && grants.deepResearch.allowed && wants.deepResearch;

  /* Plain web search does not also run when deep research is on: research does
     its own searching, on several planned queries, and running both would pay
     for the same pages twice. */
  const mayWebSearch =
    !conversational && !doDeepResearch && grants.webSearch.allowed && wants.webSearch;

  const doWebSearch = mayWebSearch && classification.needsWebSearch;

  /*
    The fallback, on founder instruction: when the catalogue returns nothing,
    go to the web rather than to memory.

    The classifier only asks for a web search when the question sounds time
    sensitive, which is right for cost. But an empty catalogue result is the
    other case where the web is worth paying for: the alternative is an answer
    from training data alone, which is exactly where a model is most likely to
    describe a product that has changed or never existed. One search is cheaper
    than a confident wrong recommendation.
  */
  const mayFallBackToWeb = mayWebSearch && !doWebSearch && doToolSearch;

  /* The third source. Always searched, because it costs nothing: it is a
     keyword scan over a dozen sections in memory, not a network call. Pulled
     wider when the question is plainly about Celpare itself. */
  const docs = searchDocs(cleaned.text, looksLikeAboutCelpare(cleaned.text) ? 4 : 2);

  /*
    Settings, applied within the plan's ceiling rather than over it. A person
    can ask for shorter answers than their plan allows; they cannot ask for
    longer ones, or the setting would be a way to spend past the budget.
  */
  const lengthFactor =
    identity.settings.answerLength === "short"
      ? 0.5
      : identity.settings.answerLength === "detailed"
        ? 1
        : 0.75;

  /*
    Three budgets for three shapes of answer.

    A conversational reply is two sentences, so it is capped hard and the length
    setting does not apply: nobody wants a detailed hello.

    A deep research answer gets the plan ceiling, because it was asked for
    specifically and a synthesis over twelve sources cut off halfway is worth
    nothing. The ceiling itself is never exceeded.
  */
  const maxOutput = conversational
    ? Math.min(400, limits.maxOutputPerReply)
    : doDeepResearch && RESEARCH_USES_FULL_CEILING
      ? limits.maxOutputPerReply
      : Math.max(200, Math.round(limits.maxOutputPerReply * lengthFactor));

  const canary = newCanary();

  // History is trimmed by plan. Summarising older turns is marked "later" in
  // Notion and is deferred: truncation is predictable and costs nothing.
  const history = input.history.slice(-limits.historyTurns * 2);
  const messages: ChatMessage[] = [...history, { role: "user", content: cleaned.text }];

  const filter = new OutputFilter(canary);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      let status: "ok" | "filtered" | "error" = "ok";
      /* What the model was actually given, kept for the saved transcript. */
      let citations: ToolCitation[] = [];
      /* External search calls made for this answer, counted for the billing
         record: one for a plain web search, one per planned angle for deep
         research, none for an answer that came from the catalogue alone. */
      let searchCalls = 0;
      /* Whether the web was actually used, which is not the same as whether it
         was planned: the empty catalogue fallback below turns it on after the
         plan was made. */
      let webUsed = doWebSearch;
      /* Kept for the token estimate at the end, which needs the prompt that was
         actually sent. Only used when the provider reports no usage of its
         own. */
      let promptForEstimate = "";

      emit(controller, {
          t: "meta",
          plan: identity.plan,
          grants,
          used: {
            toolSearch: doToolSearch,
            webSearch: doWebSearch,
            deepResearch: doDeepResearch,
          },
        });

      try {
        /*
          Retrieval runs here, inside the stream, rather than before it. A
          catalogue query, a web search, or four of them plus a planner call,
          all take time, and doing that before the response starts means a
          blank screen with nothing to read. Inside the stream, each step is
          announced as it happens, so the wait is legible.
        */
        /*
          One word for the whole retrieval phase, on founder instruction: how
          many tools matched and how many pages were read is our business, not
          the reader's. They asked a question; the interesting thing is the
          answer and the sources under it, not the size of the pile it came
          from.
        */
        if (doToolSearch || doWebSearch || doDeepResearch) {
          emit(controller, { t: "step", v: "Searching" });
        }
        if (doWebSearch) searchCalls += 1;

        const [tools, searched] = await Promise.all([
          doToolSearch
            ? searchTools(classification.topic)
            : Promise.resolve([] as ToolCitation[]),
          doWebSearch
            ? webSearch(classification.topic)
            : Promise.resolve([] as WebResult[]),
        ]);

        let web = searched;

        const thin = doToolSearch && tools.length < MIN_CATALOGUE_MATCH;

        /*
          The catalogue did not answer it. Reach for the web before reaching for
          memory: a model answering a product question from training data alone
          is where it is most likely to describe something that has changed or
          never existed.
        */
        if (thin && mayFallBackToWeb) {
          /* The whole question, not the extracted topic. The topic phrase
             exists for Postgres full text search, which wants keywords; a
             search engine does better with the sentence a person wrote. */
          web = await webSearch(cleaned.text);
          webUsed = true;
          searchCalls += 1;
        }

        citations = tools;

        let research: WebResult[] = web;
        let researchQuestions: string[] = [];

        if (doDeepResearch) {
          const result = await runDeepResearch({
            question: cleaned.text,
            topic: classification.topic,
            /* The research module reports each stage. They are useful in the
               server log and too much detail on screen, so they are not
               forwarded: the reader already knows it is searching. */
            onStep: () => {},
          });
          research = result.web;
          researchQuestions = result.queries;
          searchCalls += result.queries.length;
        }

        /*
          The cards are a second read of the public record, not the projection
          the model was given. It only happens when there is something to show,
          and losing it never fails the answer.
        */
        if (tools.length > 0) {
          const cards = await loadToolCards(tools.map((t) => t.slug));
          emit(controller, { t: "cards", citations: tools, cards });
        }

        if (research.length > 0) {
          emit(controller, { t: "sources", v: research });
        }

        /*
          The prompt is built here, after retrieval, and which builder runs is
          the whole difference between the three lanes. All three carry the same
          canary, the same scope rule and the same safety block.
        */
        const system = conversational
          ? buildChatPrompt({ canary, docs, bio: identity.bio, plan: identity.plan })
          : doDeepResearch
            ? buildResearchPrompt({
                canary,
                tools: citations,
                docs,
                web: research,
                bio: identity.bio,
                plan: identity.plan,
                questions: researchQuestions,
              })
            : buildSystemPrompt({
                canary,
                tools: citations,
                docs,
                web: research,
                bio: identity.bio,
                plan: identity.plan,
              });

        promptForEstimate = system;

        /* Retrieval is over and the model has the question. */
        emit(controller, { t: "step", v: "Thinking" });

        // 7 and 8, together: every chunk goes through the filter before it is
        // ever enqueued, so nothing unfiltered reaches the browser.
        for await (const chunk of provider.stream({
          feature: input.feature,
          system,
          messages,
          model: main,
          maxOutputTokens: maxOutput,
          /*
            A question about Celpare itself is answered from the documentation
            in three sentences, so there is nothing to reason about. An ordinary
            answer is retrieval rather than deliberation, and the rows are
            already in the prompt. Deep research is the exception: comparing a
            dozen sources is what the person asked for.
          */
          thinking: conversational
            ? "off"
            : doDeepResearch
              ? RESEARCH_THINKING
              : ANSWER_THINKING,
        })) {
          const safe = filter.push(chunk.text);
          if (safe) {
            answer += safe;
            emit(controller, { t: "text", v: safe });
          }
        }

        const tail = filter.flush();
        if (tail) {
          answer += tail;
          emit(controller, { t: "text", v: tail });
        }

        /*
          A stream that ends with nothing in it. The free endpoint does this:
          it accepts the request, thinks until the output budget is gone, and
          closes without writing a word. Without this the browser shows the
          thinking dots and then simply stops, which reads as a frozen product
          rather than a failed request.
        */
        if (!filter.canaryTripped && answer.trim().length === 0) {
          status = "error";
          emit(controller, {
              t: "error",
              v: "The model returned an empty answer. That usually means it is overloaded. Try again in a moment.",
            });
        }

        if (filter.canaryTripped) {
          status = "filtered";
          answer = "";
          emit(controller, {
              t: "error",
              v: "That answer was withheld because it tried to repeat internal instructions. Please rephrase the question.",
            });
        }
      } catch (err) {
        console.error("[ai] stream failed", err);
        status = "error";
        emit(controller, { t: "error", v: "Ask Celpare could not finish that answer. Try again in a moment." });
      }

      // 9. Prefer the provider's own numbers. OpenRouter reports real usage in
      // the final stream chunk, including reasoning tokens, which a character
      // count cannot see: Nemotron spends tokens thinking before it writes, and
      // those are billed. Estimating would undercount every reasoning answer.
      const reported = provider.lastStreamUsage?.() ?? null;
      const inputTokens =
        reported?.inputTokens ||
        estimateTokens(promptForEstimate + messages.map((m) => m.content).join(" "));
      const outputTokens = reported?.outputTokens || estimateTokens(answer);

      /*
        Persist, but only for a signed in person who has not turned history off.
        Anonymous chats are never written (D36), and a failed answer is not
        worth saving: a conversation of half an error message is noise in the
        sidebar rather than history.
      */
      let conversationId: string | null = null;
      const maySave =
        identity.userId !== null &&
        limits.savesHistory &&
        identity.settings.saveHistory !== false &&
        status === "ok" &&
        answer.trim().length > 0;

      if (maySave) {
        try {
          conversationId = await ensureConversation(
            identity.userId!,
            cleaned.text,
            input.conversationId,
          );
          if (conversationId) {
            await saveTurn({
              conversationId,
              question: cleaned.text,
              answer,
              citations,
              model: main,
              provider: providerName(),
              inputTokens,
              outputTokens,
            });
          }
        } catch (err) {
          // Losing the transcript must not lose the answer: it is already on
          // screen and the person has spent a message on it.
          console.error("[ai] persisting the conversation failed", err);
        }
      }

      await countTokens(identity.subject, inputTokens, outputTokens);
      await recordUsage({
        ...baseUsage,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - started,
        status,
        toolSearch: doToolSearch,
        webSearch: webUsed,
        deepResearch: doDeepResearch,
        searchCalls,
      });

      emit(controller, { t: "done", conversationId });
      controller.close();
    },
  });

  return { ok: true, stream, identity };
}
