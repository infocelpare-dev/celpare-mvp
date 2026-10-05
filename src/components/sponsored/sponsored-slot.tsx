"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/*
  One sponsored card's events and controls (D204, D205). The list item itself.

  A VIEW is the card at least half on screen for a second in a visible tab; a
  CLICK is any link inside it; a link marked data-sponsored-save is a SAVE.
  Hide ad and Report ad are open to everyone, signed in or not: the server
  keys them to the same viewer the frequency cap uses, so a hidden ad stays
  hidden for that viewer for 30 days. Everything goes to /api/sponsored/events,
  never to search or recommendation events, so an ad never trains organic
  ranking.
*/

const ENDPOINT = "/api/sponsored/events";
const VISIBLE_MS = 1000;

type EventKind = "view" | "click" | "save" | "dismiss" | "report";
type Reason = "irrelevant" | "misleading" | "offensive" | "spam";

const REASONS: { value: Reason; label: string }[] = [
  { value: "irrelevant", label: "Not relevant" },
  { value: "misleading", label: "Misleading" },
  { value: "offensive", label: "Offensive" },
  { value: "spam", label: "Spam" },
];

const CONTROL =
  "inline-flex min-h-8 cursor-pointer items-center rounded-full px-2.5 text-[12px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";

function send(body: object, beacon: boolean) {
  const json = JSON.stringify(body);
  try {
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([json], { type: "application/json" }));
      return Promise.resolve(true);
    }
    return fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true })
      .then((r) => r.ok)
      .catch(() => false);
  } catch {
    /* Telemetry never surfaces an error. */
    return Promise.resolve(false);
  }
}

export function SponsoredSlot({
  surface,
  toolId,
  name,
  position,
  requestId,
  className,
  children,
}: {
  surface: "search" | "ask";
  toolId: string;
  name: string;
  position: number;
  requestId: string | null;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const [state, setState] = useState<"shown" | "reporting" | "hidden" | "reported">("shown");
  const [pending, setPending] = useState(false);

  const emit = (event: EventKind, beacon: boolean, reason?: Reason) =>
    send({ surface, requestId, events: [{ toolId, event, position, reason: reason ?? null }] }, beacon);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let seen = false;
    let timer: number | undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (seen) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (timer !== undefined) return;
          timer = window.setTimeout(() => {
            timer = undefined;
            /* A hidden tab records nothing: nobody saw it. */
            if (document.visibilityState !== "visible" || seen) return;
            seen = true;
            void emit("view", false);
          }, VISIBLE_MS);
        } else if (timer !== undefined) {
          window.clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(el);

    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target?.closest("[data-sponsored-control]")) return;
      if (target?.closest("[data-sponsored-save]")) {
        void emit("save", true);
        return;
      }
      if (target?.closest("a")) void emit("click", true);
    };
    el.addEventListener("click", onClick, { capture: true });

    return () => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      el.removeEventListener("click", onClick, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId, requestId, position, surface]);

  if (state === "hidden" || state === "reported") {
    return (
      <li className={`flex min-h-11 items-center rounded-xl border border-dashed border-border px-4 text-[13px] text-muted ${className ?? ""}`} role="status">
        {state === "hidden"
          ? `Hidden. You will not see this ad for ${name} again for 30 days.`
          : "Reported. Thank you, the ad is hidden and Celpare will review it."}
      </li>
    );
  }

  return (
    <li ref={ref} className={className} data-sponsored-tool={toolId} data-sponsored-position={position}>
      {children}
      <div className="flex flex-wrap items-center justify-end gap-1 px-1 pb-1" data-sponsored-control>
        {state === "reporting" ? (
          <fieldset className="flex flex-wrap items-center justify-end gap-1">
            <legend className="sr-only">Why are you reporting this ad for {name}?</legend>
            <span aria-hidden className="mr-1 text-[12px] text-muted">
              Why?
            </span>
            {REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                disabled={pending}
                className={CONTROL}
                onClick={async () => {
                  setPending(true);
                  await emit("report", false, r.value);
                  setPending(false);
                  setState("reported");
                }}
              >
                {r.label}
              </button>
            ))}
            <button type="button" className={CONTROL} onClick={() => setState("shown")}>
              Cancel
            </button>
          </fieldset>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              aria-label={`Hide the ad for ${name}`}
              className={CONTROL}
              onClick={async () => {
                setPending(true);
                await emit("dismiss", false);
                setPending(false);
                setState("hidden");
              }}
            >
              Hide ad
            </button>
            <button
              type="button"
              aria-label={`Report the ad for ${name}`}
              className={CONTROL}
              onClick={() => setState("reporting")}
            >
              Report ad
            </button>
          </>
        )}
      </div>
    </li>
  );
}
