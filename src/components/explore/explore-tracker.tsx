"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { dismissExploreItem } from "@/app/actions/explore";
import type { ExploreItemMeta } from "@/lib/explore/types";

/*
  Explore's half of the learning loop (4BI, D151).

  ONE observer for the whole page. Every ranked card sits in an ExploreSlot
  that carries data-explore-* attributes; an impression is a card at least half
  on screen for a second, a click is any link inside it. Events are batched and
  sent with sendBeacon to /api/explore/events, which writes posts to
  feed_events and everything else to recommendation_events. Nothing a person
  sees waits on this, and a failure is silent.
*/

const ENDPOINT = "/api/explore/events";
const FLUSH_MS = 10_000;
const MAX_BATCH = 50;
const VISIBLE_MS = 1000;

type Event = {
  entityType: string;
  entityId: string;
  event: "impression" | "click" | "play";
  section: string | null;
  position: number | null;
  reason: string | null;
  source: string | null;
};

function sessionId(): string | null {
  try {
    /* The same key the feed uses: one browsing session, one id. */
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

function eventFrom(el: HTMLElement, event: Event["event"]): Event | null {
  const d = el.dataset;
  if (!d.exploreType || !d.exploreId) return null;
  const pos = Number(d.explorePosition);
  return {
    entityType: d.exploreType,
    entityId: d.exploreId,
    event,
    section: d.exploreSection ?? null,
    position: Number.isFinite(pos) ? pos : null,
    reason: d.exploreReason || null,
    source: d.exploreSource || null,
  };
}

export function ExploreTracker({ variant }: { variant: string | null }) {
  useEffect(() => {
    const queue: Event[] = [];
    const seen = new Set<string>();
    const timers = new Map<Element, number>();

    const flush = (beacon: boolean) => {
      if (queue.length === 0) return;
      const events = queue.splice(0, MAX_BATCH);
      const body = JSON.stringify({ variant, sessionId: sessionId(), events });
      try {
        if (beacon && navigator.sendBeacon) {
          navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
          return;
        }
        void fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      } catch {
        /* Telemetry never surfaces an error. */
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const key = `${el.dataset.exploreSection}:${el.dataset.exploreKey}`;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (seen.has(key) || timers.has(el)) continue;
            timers.set(
              el,
              window.setTimeout(() => {
                timers.delete(el);
                if (document.visibilityState !== "visible" || seen.has(key)) return;
                const e = eventFrom(el, "impression");
                if (e) {
                  seen.add(key);
                  queue.push(e);
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

    const watch = () => {
      document.querySelectorAll<HTMLElement>("[data-explore-key]").forEach((el) => observer.observe(el));
    };
    watch();
    /* Sections stream in after the first paint: watch what arrives. */
    const mutations = new MutationObserver(watch);
    mutations.observe(document.body, { childList: true, subtree: true });

    const onClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      const link = target?.closest("a, [data-explore-play]");
      const slot = target?.closest<HTMLElement>("[data-explore-key]");
      if (!link || !slot) return;
      const e = eventFrom(slot, link.hasAttribute("data-explore-play") ? "play" : "click");
      if (e) {
        queue.push(e);
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
  }, [variant]);

  return null;
}

/*
  A ranked card, with what explore_v1 said about it.

  The reason line is shown only for card kinds that have no reason slot of their
  own (tool and model cards draw it as a badge), and only when the ranker gave a
  reason: the UI never invents one. One line, truncated, with the full text in
  the title for pointer users; reasons are short by construction.

  Not interested hides the card at once and records the dismiss. Signed in only,
  since a signed out preference would have nowhere to live.
*/
export function ExploreSlot({
  meta,
  reason,
  showReason,
  signedIn,
  title,
  as: Root = "div",
  layout = "block",
  children,
}: {
  /* "li" on a shelf or grid (the card inside renders as a div), "div" where
     the caller already owns the list item. */
  as?: "li" | "div";
  /* shelf: a 264px column the card fills, with the line underneath. */
  layout?: "shelf" | "block";
  meta: ExploreItemMeta;
  reason: string | null;
  showReason: boolean;
  signedIn: boolean;
  title: string;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const frame =
    layout === "shelf"
      ? "flex w-[264px] shrink-0 snap-start flex-col [&>:first-child]:h-auto [&>:first-child]:flex-1"
      : "flex min-w-0 flex-col";

  if (hidden) {
    return (
      <Root className={frame}>
        <p role="status" className="flex min-h-11 items-center px-1 text-[13px] text-muted">
          {message ?? "Hidden."}
        </p>
      </Root>
    );
  }

  const line = showReason && reason;

  return (
    <Root
      ref={ref as React.Ref<HTMLLIElement & HTMLDivElement>}
      className={frame}
      data-explore-key={meta.key}
      data-explore-type={meta.entityType}
      data-explore-id={meta.entityId}
      data-explore-section={meta.section}
      data-explore-position={meta.position}
      data-explore-reason={meta.reasonCode ?? ""}
      data-explore-source={meta.source ?? ""}
    >
      {children}
      {line || signedIn ? (
        <div className="mt-1.5 flex min-h-6 min-w-0 items-center gap-2 px-1">
          {line ? (
            <p className="min-w-0 flex-1 truncate text-[12px] text-muted" title={reason ?? undefined}>
              {reason}
            </p>
          ) : (
            <span className="flex-1" />
          )}
          {signedIn ? (
            <button
              type="button"
              disabled={pending}
              aria-label={`Not interested in ${title}`}
              onClick={() =>
                start(async () => {
                  const res = await dismissExploreItem({
                    entityType: meta.entityType,
                    entityId: meta.entityId,
                    section: meta.section,
                    position: meta.position,
                  });
                  setMessage(res.message);
                  if (res.ok) setHidden(true);
                })
              }
              className="inline-flex min-h-6 shrink-0 cursor-pointer items-center rounded-full px-2 text-[12px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground disabled:opacity-50"
            >
              Not interested
            </button>
          ) : null}
        </div>
      ) : null}
      {message && !hidden ? (
        <p role="status" className="px-1 text-[12px] text-muted">
          {message}
        </p>
      ) : null}
    </Root>
  );
}
