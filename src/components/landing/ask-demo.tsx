"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  ChevronUp,
  Pause,
  Play,
  SlidersHorizontal,
} from "lucide-react";
import { SparkIcon } from "@/components/ui/spark-icon";
import { cn } from "@/lib/utils";

/*
  Ask Celpare, played like a screen recording (4AY). The founder asked for a video
  of Ask on the landing page and had a screenshot, not a file, so this is the
  recording drawn in code: it stays sharp at every width, follows light and dark,
  and costs no download.

  HONEST BY CONSTRUCTION (D13, D30). The three tools are real catalogue rows, and
  the answer says only what their catalogue taglines and pricing say. Nothing is
  scored or ranked beyond what the rows state, and the caption under the frame
  says it is a preview.

  ONE CLOCK. Everything on screen is derived from `t`, the milliseconds since the
  loop began, so the timeline is the TIMES table below and nothing else. It only
  ticks while the frame is on screen, the tab is visible and nobody has pressed
  Pause. Auto moving content longer than five seconds needs a pause control
  (WCAG 2.2.2), which is the button in the corner.

  REDUCED MOTION shows the finished frame, still. The whole frame is aria-hidden;
  the sentence beside it in the DOM says what it shows.
*/

const QUESTION = "What's three best AI tools for video generation.";

const SUGGESTIONS = [
  "Find the best AI coding tools.",
  "What is the best AI video generator?",
  "Compare Claude and ChatGPT.",
  "Find an AI tool for research.",
];

const ANSWER =
  "Three tools in the Celpare catalogue fit video generation. Runway is built for production work and editing, Kling is known for realistic motion, and Sora is OpenAI's text to video model, included if you already pay for ChatGPT.";

/* Real rows from public.tools (slugs runway, kling, sora), as the catalogue words them. */
const TOOLS = [
  {
    name: "Runway",
    tagline: "Video generation and editing for production work.",
    pricing: "Free tier with limited credits. Paid subscription and enterprise plans.",
  },
  {
    name: "Kling",
    tagline: "Video generation with strong motion realism.",
    pricing: "Free daily credits. Paid subscription plans.",
  },
  {
    name: "Sora",
    tagline: "OpenAI's text to video model.",
    pricing: "Included with paid ChatGPT plans, subject to usage limits.",
  },
];

const ANSWER_WORDS = ANSWER.split(" ");

/* The timeline, in milliseconds from the start of a loop. */
const TIMES = {
  typeStart: 1400,
  charMs: 38,
  send: 1400 + QUESTION.length * 38 + 500,
  thinking: 0, // set below
  answerStart: 0,
  wordMs: 55,
  cardsStart: 0,
  cardGap: 280,
  end: 0,
};
TIMES.thinking = TIMES.send + 1200;
TIMES.answerStart = TIMES.thinking + 1100;
TIMES.cardsStart = TIMES.answerStart + ANSWER_WORDS.length * TIMES.wordMs + 250;
TIMES.end = TIMES.cardsStart + TOOLS.length * TIMES.cardGap + 4200;

const TICK = 50;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function AskDemo() {
  const frame = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), {
      threshold: 0.25,
    });
    io.observe(el);
    const vis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  const playing = !reduced && !paused && onScreen && tabVisible;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setT((prev) => (prev + TICK >= TIMES.end ? 0 : prev + TICK));
    }, TICK);
    return () => window.clearInterval(id);
  }, [playing]);

  /* Reduced motion freezes on the last frame, where everything is visible. */
  const now = reduced ? TIMES.end - 1 : t;

  return (
    <figure className="mx-auto w-full">
      <p className="sr-only">
        A looping preview of Ask Celpare. Someone asks for the three best AI tools
        for video generation, and Ask Celpare answers with Runway, Kling and Sora
        from the Celpare catalogue.
      </p>

      <div
        ref={frame}
        className="relative overflow-hidden rounded-[28px] border border-border bg-surface text-left"
      >
        {/*
          Two copies in one grid cell. The invisible one is always the FINISHED frame,
          so the box has its final height from the first paint at every width and the
          page below never moves while the recording plays. The visible one is live.
        */}
        <div className="grid">
          <div className="invisible col-start-1 row-start-1" aria-hidden>
            <Frame now={TIMES.end - 1} reduced />
          </div>
          <div className="col-start-1 row-start-1">
            <Frame now={now} reduced={reduced} />
          </div>
        </div>

        {reduced ? null : (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Play the Ask Celpare preview" : "Pause the Ask Celpare preview"}
            className="absolute end-3 top-2.5 flex size-8 cursor-pointer items-center justify-center rounded-full border border-border bg-elevated text-muted transition-colors duration-200 hover:text-foreground"
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </button>
        )}
      </div>

      <figcaption className="mt-3 text-center text-[12px] text-muted">
        A preview of Ask Celpare. The tools shown are real entries from the Celpare catalogue.
      </figcaption>
    </figure>
  );
}

function Frame({ now, reduced }: { now: number; reduced: boolean }) {
  const typed = QUESTION.slice(
    0,
    Math.max(0, Math.min(QUESTION.length, Math.floor((now - TIMES.typeStart) / TIMES.charMs))),
  );
  const sent = now >= TIMES.send;
  const status = !sent ? null : now < TIMES.thinking ? "Searching" : now < TIMES.answerStart ? "Thinking" : null;
  const words = Math.max(
    0,
    Math.min(ANSWER_WORDS.length, Math.floor((now - TIMES.answerStart) / TIMES.wordMs)),
  );
  const cards = Math.max(
    0,
    Math.min(TOOLS.length, Math.floor((now - TIMES.cardsStart) / TIMES.cardGap) + 1),
  );
  const fadingOut = !reduced && now > TIMES.end - 500;

  return (
    <div
      aria-hidden
      className={cn(
        "flex h-full flex-col transition-opacity duration-500 ease-out",
        fadingOut ? "opacity-0" : "opacity-100",
      )}
    >
      {/* App bar, as the real one draws it. */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-on-accent">
            <SparkIcon className="size-3.5" />
          </span>
          <span className="font-display text-[15px] font-semibold">Ask Celpare</span>
        </div>
        <span className="me-10 font-mono text-[11px] text-muted">celpare.com/ask</span>
      </div>

      {/* Conversation */}
      <div className="flex-1 px-4 py-5 sm:px-8 sm:py-7">
        {!sent ? (
          <div className="mx-auto max-w-[760px]">
            <p className="text-[17px] text-muted sm:text-[19px]">
              Find the right AI for what you are trying to accomplish.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {SUGGESTIONS.map((s, i) => (
                <div
                  key={s}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl border border-border bg-elevated px-4 py-3 text-[14px] sm:text-[15px]",
                    i > 1 && "hidden sm:flex",
                  )}
                >
                  <span className="truncate">{s}</span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[760px]">
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl bg-elevated px-4 py-2.5 text-[14px] sm:text-[15px]">
                {QUESTION}
              </p>
            </div>

            <div className="mt-5">
              {status ? (
                <p className="flex items-center gap-2 text-[14px] text-muted">
                  <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                  {status}
                </p>
              ) : (
                <p className="text-[14px] leading-[1.65] sm:text-[15px]">
                  {ANSWER_WORDS.slice(0, words).join(" ")}
                  {words < ANSWER_WORDS.length ? (
                    <span className="ms-0.5 inline-block h-4 w-[2px] translate-y-[3px] bg-foreground" />
                  ) : null}
                </p>
              )}

              <ul className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-3">
                {TOOLS.map((tool, i) => (
                  <li
                    key={tool.name}
                    className={cn(
                      "rounded-2xl border border-border bg-elevated p-4 transition-all duration-500 ease-out",
                      i < cards && !status && words >= ANSWER_WORDS.length
                        ? "translate-y-0 opacity-100"
                        : "translate-y-2 opacity-0",
                      i > 0 && "hidden md:block",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-8 items-center justify-center rounded-full bg-accent font-display text-[13px] font-semibold text-on-accent">
                        {tool.name[0]}
                      </span>
                      <span className="font-display text-[15px] font-semibold">{tool.name}</span>
                    </div>
                    <p className="mt-2.5 text-[13px] leading-snug">{tool.tagline}</p>
                    <p className="mt-1.5 text-[12px] leading-snug text-muted">{tool.pricing}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border px-4 py-4 sm:px-8">
        <div className="mx-auto max-w-[760px] rounded-[24px] border border-border bg-elevated px-4 pb-3 pt-3.5">
          <p className="min-h-[24px] text-[15px]">
            {sent ? (
              <span className="text-muted">Ask a follow up</span>
            ) : typed ? (
              <>
                {typed}
                <span className="ms-0.5 inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-foreground" />
              </>
            ) : (
              <span className="text-muted">Ask about AI tools and models</span>
            )}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[13px] font-medium text-on-accent">
              <SlidersHorizontal className="size-3.5" />
              Tool search
              <ChevronUp className="size-3.5" />
            </span>
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full bg-primary text-on-primary transition-transform duration-200",
                !reduced && now >= TIMES.send - 250 && now < TIMES.send + 100 && "scale-90",
              )}
            >
              <ArrowUp className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
