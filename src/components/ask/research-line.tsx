"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/*
  Deep research on screen (D231, founder 2026-11-04).

  While it works: ResearchActivity, a live list of what it is doing (each
  search with its query, each page as it is read, comparing, thinking,
  checking facts) with an elapsed timer. The report itself is held back until
  research and writing are finished, then shown whole.

  Afterwards: ResearchLine, a one line summary, and ResearchTrail, the whole
  activity list behind "View research", on a live answer and a reopened one.

  ui-ux-pro-max (progress): step indicators, an accessible busy status, the
  long wait explained, long labels truncated rather than wrapping the panel.
*/

export type ResearchSummary = { kind: "choose" | "build"; searches: number; pagesRead: number; compared: number };

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block size-1.5 animate-pulse rounded-full bg-muted motion-reduce:animate-none"
      style={{ animationDelay: delay }}
    />
  );
}

function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ResearchActivity({ steps, startedAt, writing }: { steps: string[]; startedAt: number | null; writing: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  /* The model is writing: shown as its own step, since the report is held back. */
  const shown = writing && !steps.includes("Writing the report") ? [...steps, "Writing the report"] : steps;
  const current = shown.length - 1;

  return (
    <section
      aria-busy="true"
      aria-label="Deep match in progress"
      className="rounded-2xl border border-border bg-surface px-4 py-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[14px] font-medium">
          <span className="size-1.5 rounded-full bg-accent" aria-hidden />
          Matching
        </p>
        <span className="text-[13px] tabular-nums text-muted" aria-label="Time so far">
          {startedAt ? elapsedLabel(now - startedAt) : null}
        </span>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">
        Deep match usually takes one to two minutes. The full answer appears when it is done.
      </p>

      <ol className="mt-3 space-y-1.5">
        {shown.map((step, i) => {
          const live = i === current;
          return (
            <li key={`${step}-${i}`} className={`flex min-w-0 items-center gap-2 text-[13px] ${live ? "text-foreground" : "text-muted"}`}>
              {live ? (
                <span className="inline-flex w-3.5 shrink-0 gap-0.5" aria-hidden>
                  <Dot delay="0ms" />
                  <Dot delay="150ms" />
                </span>
              ) : (
                <Check className="size-3.5 shrink-0 text-accent" aria-hidden />
              )}
              <span className="truncate" title={step} aria-live={live ? "polite" : undefined}>
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ResearchLine({ research }: { research: ResearchSummary }) {
  const parts = [
    `${research.searches} ${research.searches === 1 ? "web search" : "web searches"}`,
    research.pagesRead ? `${research.pagesRead} ${research.pagesRead === 1 ? "page" : "pages"} read` : null,
    research.compared ? `${research.compared} catalogue tools compared` : null,
  ].filter(Boolean);
  return (
    <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border bg-surface px-3 py-1 text-[12px] text-muted">
      <span className="size-1.5 rounded-full bg-accent" aria-hidden />
      <span className="font-medium text-foreground">
        {research.kind === "build" ? "Deep match, project roadmap" : "Deep match"}
      </span>
      <span>{parts.join(", ")}</span>
    </p>
  );
}

/* The finished research: the summary line, and the whole trail on request. */
export function ResearchTrail({ research, steps }: { research: ResearchSummary; steps: string[] }) {
  return (
    <details className="group mb-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
        <ResearchLine research={research} />
        {steps.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted transition-colors duration-200 hover:text-foreground">
            View steps
            <ChevronDown className="size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
          </span>
        ) : null}
      </summary>
      {steps.length > 0 ? (
        <ol className="mt-2.5 space-y-1.5 rounded-xl border border-border px-4 py-3">
          {steps.map((step, i) => (
            <li key={`${step}-${i}`} className="flex min-w-0 items-start gap-2 text-[13px] text-muted">
              <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 break-words">{step}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </details>
  );
}
