"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { SparkIcon } from "@/components/ui/spark-icon";
import { RichText } from "./rich-text";
import { ToolCards, type ToolCitation } from "./tool-cards";
import { Composer, type Grants, type ModeKey, type Modes } from "./composer";
import { useNewChatToken } from "./new-chat";

type WebSource = { title: string; url: string; snippet: string };

type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ToolCitation[];
  /* Deep research announces what it is doing as it does it. Kept on the turn
     rather than in one shared place, so scrolling back up shows what that
     answer was built from rather than what the latest one is doing. */
  steps?: string[];
  sources?: WebSource[];
  /* Set when the turn ended badly, so it renders as a notice rather than as an
     answer the model actually gave. */
  notice?: "refused" | "limit" | "error";
  /* The question this answer came from, kept so Retry can send it again
     without the person scrolling up to copy their own words. */
  question?: string;
};

const STARTERS = [
  "Find the best AI coding tools.",
  "What is the best AI video generator?",
  "Compare Claude and ChatGPT.",
  "Find an AI tool for research.",
  "What AI tools should I try?",
];

function uid() {
  return Math.random().toString(36).slice(2);
}

export function AskChat({
  signedIn,
  seed,
  initialTurns = [],
  initialConversationId = null,
  grants: initialGrants,
  defaultModes,
}: {
  signedIn: boolean;
  seed?: string;
  initialTurns?: Turn[];
  initialConversationId?: string | null;
  /* Resolved on the server from the plan. The browser never works out what it
     is allowed to use, it renders what it was told. */
  grants: Grants;
  defaultModes: Modes;
}) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [modes, setModes] = useState<Modes>(defaultModes);
  /* Refreshed from every answer, so an upgrade in another tab unlocks the
     toggles on the next message rather than on a reload. */
  const [grants, setGrants] = useState<Grants>(initialGrants);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const seeded = useRef(false);
  /*
    The lock that stops one question becoming two chats. `busy` is state, so a
    second call in the same tick (a held Enter repeating, a double tap on a
    suggestion) reads the old `false` and sends again, and each send created its
    own conversation: chat history showed every such question twice. A ref flips
    synchronously, so the second call sees it.
  */
  const inFlight = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  /*
    New chat, pressed in the history panel. A fresh chat lives at /ask and a
    saved one at /ask/[id], so the button cannot rely on the route changing:
    from /ask it links to the page you are already on. Clearing the state here
    is what actually empties the screen, and dropping the conversation id is
    what stops the next question appending to the chat just left behind.
  */
  const newChatToken = useNewChatToken();
  const clearedAt = useRef(newChatToken);
  useEffect(() => {
    if (newChatToken === clearedAt.current) return;
    clearedAt.current = newChatToken;
    abortRef.current?.abort();
    setTurns([]);
    setConversationId(null);
    setValue("");
    setBusy(false);
  }, [newChatToken]);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || busy || inFlight.current) return;
      inFlight.current = true;

      const userTurn: Turn = { id: uid(), role: "user", content: question };
      const replyId = uid();

      // The history sent to the server is the conversation before this question,
      // and it excludes notices: a refusal is not something the model said.
      const history = turns
        .filter((t) => !t.notice)
        .map((t) => ({ role: t.role, content: t.content }));

      setTurns((prev) => [
        ...prev,
        userTurn,
        { id: replyId, role: "assistant", content: "", question },
      ]);
      setValue("");
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const fail = (content: string, notice: Turn["notice"]) =>
        setTurns((prev) =>
          prev.map((t) => (t.id === replyId ? { ...t, content, notice } : t)),
        );

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: question, history, conversationId, modes }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string; kind?: string }
            | null;
          fail(
            data?.error ?? "Something went wrong. Try again in a moment.",
            res.status === 429 ? "limit" : data?.kind === "refused_scope" ? "refused" : "error",
          );
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffered = "";

        // Newline delimited JSON. Keep the trailing partial line in the buffer
        // rather than parsing half an object.
        while (true) {
          const { done, value: bytes } = await reader.read();
          if (done) break;
          buffered += decoder.decode(bytes, { stream: true });

          const lines = buffered.split("\n");
          buffered = lines.pop() ?? "";

          for (const raw of lines) {
            if (!raw.trim()) continue;
            let event: Record<string, unknown>;
            try {
              event = JSON.parse(raw);
            } catch {
              continue;
            }

            if (event.t === "meta" && event.grants) {
              setGrants(event.grants as Grants);
            }

            if (event.t === "cards") {
              /* The card record is the public one and carries more than the
                 model was given. Falling back to the citations keeps the cards
                 rendering if that second read failed. */
              const cards = event.cards as ToolCitation[];
              const citations = (cards?.length ? cards : event.citations) as ToolCitation[];
              setTurns((prev) =>
                prev.map((t) => (t.id === replyId ? { ...t, citations } : t)),
              );
            }

            if (event.t === "step") {
              const label = String(event.v ?? "");
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === replyId ? { ...t, steps: [...(t.steps ?? []), label] } : t,
                ),
              );
            }

            if (event.t === "sources") {
              const sources = event.v as WebSource[];
              setTurns((prev) =>
                prev.map((t) => (t.id === replyId ? { ...t, sources } : t)),
              );
            }

            if (event.t === "text") {
              const piece = String(event.v ?? "");
              setTurns((prev) =>
                prev.map((t) =>
                  t.id === replyId ? { ...t, content: t.content + piece } : t,
                ),
              );
            }

            if (event.t === "error") {
              fail(String(event.v ?? "Something went wrong."), "error");
            }

            if (event.t === "done" && typeof event.conversationId === "string") {
              // The server created or reused the conversation, so subsequent
              // turns in this tab append to it rather than starting a new one.
              setConversationId(event.conversationId);

              /*
                The first answer is where a new chat earns a URL of its own.
                Until now it lived at /ask with its id held in state alone, so
                a reload lost your place, the chat could not be linked, and the
                history list had no way to mark the one on screen as open.

                `replaceState` rather than a route change, because the chat is
                already rendered: navigating to /ask/[id] would fetch the
                conversation back from the database and throw away what is
                here, including an answer still arriving. Next patches
                `replaceState` and dispatches a restore that keeps the rendered
                tree and moves only the URL, which is exactly the trade wanted.
                It replaces rather than pushes: a Back that changed the URL
                without changing the chat would be a button that does nothing.
              */
              if (!conversationId) {
                /*
                  No `router.refresh()` here to put the chat straight into the
                  panel's list, though it was tried: the restore that
                  `replaceState` dispatches supersedes a refresh queued in the
                  same tick, so the list never changed, and moving the refresh
                  after the URL lands is the one ordering that is unsafe, since
                  a refresh resolves the current URL against the tree already
                  rendered. The list catches up on New chat or a reload.
                */
                window.history.replaceState(
                  null,
                  "",
                  `/ask/${encodeURIComponent(event.conversationId)}`,
                );
              }
            }
          }
        }
      } catch (err) {
        // An abort is the person pressing stop, not a failure. Keep whatever
        // arrived rather than replacing it with an error.
        if ((err as Error)?.name !== "AbortError") {
          fail("Ask Celpare could not reach the model. Try again in a moment.", "error");
        }
      } finally {
        inFlight.current = false;
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, turns, conversationId, modes],
  );

  useEffect(() => {
    if (seed && !seeded.current) {
      seeded.current = true;
      void send(seed);
    }
  }, [seed, send]);

  const stop = () => abortRef.current?.abort();

  /*
    Retry removes the answer being retried and the question above it, then
    sends that question again. Leaving the failed pair in place would grow the
    transcript with attempts, and sending the history including a failure would
    hand the model its own error message as context.
  */
  const retry = useCallback(
    (turnId: string, question: string) => {
      if (busy) return;
      setTurns((prev) => {
        const index = prev.findIndex((t) => t.id === turnId);
        if (index < 0) return prev;
        const from = index > 0 && prev[index - 1].role === "user" ? index - 1 : index;
        return prev.slice(0, from);
      });
      // After the state update, so send() sees the trimmed history.
      setTimeout(() => void send(question), 0);
    },
    [busy, send],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-4 py-8 sm:px-6">
          {turns.length === 0 ? (
            <EmptyState onPick={send} signedIn={signedIn} />
          ) : (
            <ol className="space-y-6">
              {turns.map((turn) => (
                <li key={turn.id}>
                  {turn.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl border border-border bg-surface px-4 py-3 text-[15px]">
                        {turn.content}
                      </div>
                    </div>
                  ) : (
                    <Answer turn={turn} busy={busy} onRetry={retry} />
                  )}
                </li>
              ))}
            </ol>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-border bg-background">
        <div className="mx-auto w-full max-w-[720px] px-4 py-4 sm:px-6">
          <Composer
            value={value}
            onChange={setValue}
            onSend={() => send(value)}
            onStop={stop}
            busy={busy}
            modes={modes}
            grants={grants}
            signedIn={signedIn}
            onToggle={(key: ModeKey, next: boolean) =>
              setModes((prev) => ({ ...prev, [key]: next }))
            }
          />
          {!signedIn ? (
            <p className="mt-3 text-center text-[13px] text-muted">
              This conversation is not saved.{" "}
              <Link href="/get-started" className="underline underline-offset-2 hover:text-foreground">
                Create an account
              </Link>{" "}
              to keep your chats.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Answer({
  turn,
  busy,
  onRetry,
}: {
  turn: Turn;
  busy: boolean;
  onRetry: (turnId: string, question: string) => void;
}) {
  if (turn.notice) {
    const tone = turn.notice === "limit" ? "border-accent" : "border-border";

    /* A refusal is not a failure to retry: the same question refused twice is
       refused twice. A rate limit is not retryable either, until it resets.
       Everything else is worth one button. */
    const retryable = turn.notice === "error" && Boolean(turn.question);

    return (
      <div className={`rounded-2xl border ${tone} bg-surface px-4 py-3`}>
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-[15px] leading-relaxed text-muted">{turn.content}</p>
        </div>

        {retryable ? (
          <button
            type="button"
            onClick={() => onRetry(turn.id, turn.question!)}
            disabled={busy}
            className="mt-3 ml-7 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-200 hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  const empty = turn.content.length === 0;
  const steps = turn.steps ?? [];

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-muted">
        <SparkIcon className="size-3.5 text-accent" />
        Celpare
      </div>

      {/*
        Retrieval takes seconds before a word is written, and deep research
        takes far longer. Saying what it is doing is the difference between
        waiting and wondering whether it broke.

        The trail is shown while the answer is still being built and then gets
        out of the way: a finished answer should read as an answer, not as a log
        of how it was made. What the research found stays, as sources.
      */}
      {empty && steps.length > 0 ? (
        <ol className="mb-1 space-y-1.5" aria-label="Progress">
          {steps.map((step, i) => {
            const current = i === steps.length - 1;
            return (
              <li
                key={`${step}-${i}`}
                className={`flex items-center gap-2 text-[13px] ${current ? "text-foreground" : "text-muted"}`}
              >
                {current ? (
                  <span className="inline-flex gap-1" aria-hidden>
                    <Dot delay="0ms" />
                    <Dot delay="150ms" />
                    <Dot delay="300ms" />
                  </span>
                ) : (
                  <Check className="size-3.5 shrink-0 text-accent" aria-hidden />
                )}
                <span aria-live={current ? "polite" : undefined}>{step}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {empty && busy && steps.length === 0 ? (
        <p className="text-[15px] text-muted" aria-live="polite">
          Thinking
          <span className="ml-1 inline-flex gap-1 align-middle">
            <Dot delay="0ms" />
            <Dot delay="150ms" />
            <Dot delay="300ms" />
          </span>
        </p>
      ) : empty ? null : (
        <div className="text-[15px]">
          <RichText text={turn.content} />
        </div>
      )}

      {turn.citations && turn.citations.length > 0 ? (
        <ToolCards tools={turn.citations} />
      ) : null}

      {turn.sources && turn.sources.length > 0 && !empty ? (
        <Sources sources={turn.sources} />
      ) : null}

      {/* Actions appear once the answer is finished. Offering copy halfway
          through a stream copies half an answer. */}
      {!empty && !busy ? (
        <div className="mt-3 flex items-center gap-1">
          <CopyButton text={turn.content} />
          {turn.question ? (
            <button
              type="button"
              onClick={() => onRetry(turn.id, turn.question!)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-muted transition-colors duration-200 hover:bg-surface hover:text-foreground"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* Copy, with the result said out loud rather than only shown: a tick that
   replaces an icon is invisible to a screen reader. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission can be refused, and the answer is still on screen
      // and selectable. A convenience that failed is not an error.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-muted transition-colors duration-200 hover:bg-surface hover:text-foreground"
    >
      {copied ? (
        <Check className="size-3.5 text-accent" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

/* The web pages an answer was built from. Listed rather than summarised,
   because the point of showing a source is that someone can go and check it. */
function Sources({ sources }: { sources: WebSource[] }) {
  return (
    <details className="mt-4 rounded-xl border border-border">
      <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-muted transition-colors duration-200 hover:text-foreground">
        Sources
      </summary>
      <ul className="space-y-3 border-t border-border px-4 py-3">
        {sources.map((source) => (
          <li key={source.url}>
            <a
              href={source.url}
              target="_blank"
              // noreferrer as well as noopener: these are search results, and
              // there is no reason to tell them where the visitor came from.
              rel="noopener noreferrer nofollow"
              className="inline-flex items-start gap-1.5 text-[14px] font-medium underline underline-offset-2 hover:text-foreground"
            >
              {source.title || source.url}
              <ExternalLink className="mt-1 size-3 shrink-0" aria-hidden />
            </a>
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{source.snippet}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block size-1.5 animate-pulse rounded-full bg-muted motion-reduce:animate-none"
      style={{ animationDelay: delay }}
    />
  );
}

function EmptyState({
  onPick,
  signedIn,
}: {
  onPick: (q: string) => void;
  signedIn: boolean;
}) {
  return (
    <div className="py-8">
      <h1 className="font-display text-[clamp(1.6rem,4vw,2.1rem)] font-semibold leading-tight">
        Ask Celpare
      </h1>
      <p className="mt-3 max-w-[52ch] text-[17px] leading-relaxed text-muted">
        Find the right AI for what you are trying to accomplish.
      </p>

      <ul className="mt-7 grid gap-2 sm:grid-cols-2">
        {STARTERS.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="group flex h-full w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-transparent px-4 py-3 text-left text-[15px] transition-colors duration-200 hover:bg-surface"
            >
              {q}
              <ArrowUpRight
                className="size-4 shrink-0 text-muted transition-colors duration-200 group-hover:text-accent"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-6 max-w-[52ch] text-[13px] leading-relaxed text-muted">
        It answers on AI tools, models, tech and SaaS, from the Celpare
        catalogue, its own documentation and the web. Ask follow ups in plain
        language, or just say hello.
      </p>

      {!signedIn ? (
        <p className="mt-6 text-[13px] text-muted">
          You can ask without an account. Chats are not saved unless you sign in.
        </p>
      ) : null}
    </div>
  );
}
