"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { notInterestedInRecommendation } from "@/app/actions/recommend";

/*
  The engine's half of the learning loop (4BK, D184).

  ONE observer per page. Every recommendation card sits in a RecSlot carrying
  data-rec-* attributes, inside a list that carries the request (surface,
  strategy, request id, section). An impression is a card at least half on
  screen for a second in a visible tab; a click is any link inside it; a link
  marked data-rec-compare is a compare add. Events are batched to
  /api/recommend/events with sendBeacon. Nothing a person sees waits on this.
*/

const ENDPOINT = "/api/recommend/events";
const FLUSH_MS = 10_000;
const VISIBLE_MS = 1000;

type Event = {
  entityType: string;
  entityId: string;
  event: "impression" | "click" | "compare_add";
  position: number | null;
  reason: string | null;
  source: string | null;
};

type Batch = { surface: string; strategy: string; requestId: string | null; variant: string | null; section: string | null; events: Event[] };

function sessionId(): string | null {
  try {
    const key = "celpare.feed.session";
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const made = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    window.sessionStorage.setItem(key, made);
    return made;
  } catch {
    return null;
  }
}

function read(slot: HTMLElement, event: Event["event"]): { head: Omit<Batch, "events">; event: Event } | null {
  const list = slot.closest<HTMLElement>("[data-rec-request]");
  const d = slot.dataset;
  if (!list || !d.recType || !d.recId) return null;
  const l = list.dataset;
  const pos = Number(d.recPosition);
  return {
    head: {
      surface: l.recSurface ?? "",
      strategy: l.recStrategy ?? "",
      requestId: l.recRequest || null,
      variant: l.recVariant || null,
      section: l.recSection || null,
    },
    event: {
      entityType: d.recType,
      entityId: d.recId,
      event,
      position: Number.isFinite(pos) ? pos : null,
      reason: d.recReason || null,
      source: d.recSource || null,
    },
  };
}

export function RecommendationTracker() {
  useEffect(() => {
    const batches = new Map<string, Batch>();
    const seen = new Set<string>();
    const timers = new Map<Element, number>();

    const push = (r: NonNullable<ReturnType<typeof read>>) => {
      const k = `${r.head.requestId}:${r.head.surface}:${r.head.strategy}:${r.head.section}`;
      const b = batches.get(k) ?? { ...r.head, events: [] };
      b.events.push(r.event);
      batches.set(k, b);
    };

    const flush = (beacon: boolean) => {
      for (const [k, b] of batches) {
        if (b.events.length === 0) continue;
        const body = JSON.stringify({ ...b, sessionId: sessionId(), events: b.events.splice(0, 60) });
        batches.delete(k);
        try {
          if (beacon && navigator.sendBeacon) {
            navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
            continue;
          }
          void fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
        } catch {
          /* Telemetry never surfaces an error. */
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const list = el.closest<HTMLElement>("[data-rec-request]");
          const key = `${list?.dataset.recRequest}:${el.dataset.recKey}`;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (seen.has(key) || timers.has(el)) continue;
            timers.set(
              el,
              window.setTimeout(() => {
                timers.delete(el);
                /* A hidden tab records nothing: nobody saw it. */
                if (document.visibilityState !== "visible" || seen.has(key)) return;
                const r = read(el, "impression");
                if (r) {
                  seen.add(key);
                  push(r);
                }
              }, VISIBLE_MS),
            );
          } else {
            const t = timers.get(el);
            if (t !== undefined) {
              window.clearTimeout(t);
              timers.delete(el);
            }
          }
        }
      },
      { threshold: [0, 0.5] },
    );

    const watch = () => document.querySelectorAll<HTMLElement>("[data-rec-key]").forEach((el) => observer.observe(el));
    watch();
    /* Sections stream in after the first paint. */
    const mutations = new MutationObserver(watch);
    mutations.observe(document.body, { childList: true, subtree: true });

    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const link = target?.closest("a");
      const slot = target?.closest<HTMLElement>("[data-rec-key]");
      if (!link || !slot) return;
      const r = read(slot, link.hasAttribute("data-rec-compare") ? "compare_add" : "click");
      if (r) {
        push(r);
        flush(true);
      }
    };
    document.addEventListener("click", onClick, { capture: true });

    const timer = window.setInterval(() => flush(false), FLUSH_MS);
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onHidden);

    return () => {
      observer.disconnect();
      mutations.disconnect();
      for (const t of timers.values()) window.clearTimeout(t);
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onHidden);
      window.clearInterval(timer);
      flush(true);
    };
  }, []);

  return null;
}

/*
  One recommended card, with what the engine said about it. The reason line is
  shown only when the engine gave one; the UI never writes its own. Not
  interested is for signed in people only, since a signed out preference would
  have nowhere to live.
*/
export function RecSlot({
  entityType,
  entityId,
  entityKey,
  position,
  reasonCode,
  source,
  surface,
  strategy,
  requestId,
  section,
  title,
  signedIn,
  layout = "grid",
  children,
}: {
  /* grid: a cell in a two column list. shelf: a 264px column in an Explore shelf. */
  layout?: "grid" | "shelf";
  entityType: "tool" | "model";
  entityId: string;
  entityKey: string;
  position: number;
  reasonCode: string | null;
  source: string | null;
  surface: string;
  strategy: string;
  requestId: string;
  section: string | null;
  title: string;
  signedIn: boolean;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const frame = layout === "shelf" ? "flex w-[264px] shrink-0 snap-start flex-col [&>:first-child]:h-auto [&>:first-child]:flex-1" : "flex min-w-0 flex-col";

  if (hidden) {
    return (
      <li className={`${frame} min-h-11 justify-center rounded-xl border border-dashed border-border px-4 text-[13px] text-muted`} role="status">
        {message ?? "Hidden."}
      </li>
    );
  }

  return (
    <li
      className={frame}
      data-rec-key={entityKey}
      data-rec-type={entityType}
      data-rec-id={entityId}
      data-rec-position={position}
      data-rec-reason={reasonCode ?? ""}
      data-rec-source={source ?? ""}
    >
      {children}
      {signedIn ? (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            disabled={pending}
            aria-label={`Not interested in ${title}`}
            onClick={() =>
              start(async () => {
                const res = await notInterestedInRecommendation({
                  entityType,
                  entityId,
                  surface,
                  strategy,
                  requestId,
                  section,
                  position,
                });
                setMessage(res.message);
                if (res.ok) setHidden(true);
              })
            }
            className="inline-flex min-h-8 cursor-pointer items-center rounded-full px-2.5 text-[12px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground disabled:opacity-50"
          >
            Not interested
          </button>
        </div>
      ) : null}
      {message && !hidden ? (
        <p role="status" className="px-1 text-[12px] text-muted">
          {message}
        </p>
      ) : null}
    </li>
  );
}
