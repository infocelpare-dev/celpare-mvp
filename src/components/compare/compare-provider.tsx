"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { compareHref, viewType, type CompareView } from "@/lib/compare/params";
import type {
  CompareEvent,
  CompareEventKind,
  CompareGoal,
  CompareItemType,
  CompareRef,
} from "@/lib/compare/types";

/*
  The one piece of client state Compare has, and it is not the comparison.

  THE COMPARISON IS THE URL. Adding, removing, reordering and choosing a goal all
  push a new /compare URL and the server renders the result, so there is no
  client store that can disagree with what a shared link shows. What lives here
  is only what a URL cannot hold: whether a navigation is in flight, and a queue
  of analytics events.

  PENDING IS SHOWN, NOT HIDDEN. While the next comparison renders, the current
  one dims and is marked aria-busy, so a tap on Remove visibly did something
  immediately rather than appearing to be ignored for half a second.

  ANALYTICS ARE BATCHED AND LEAVE BY BEACON, the pattern SearchTracking uses:
  a click that navigates away is the last thing that happens, and fetch would be
  cancelled with the page. Section views are observed once per section per
  comparison, and reaching the end of the page is comparison_completed.

  comparison_abandoned HAS A NARROW, STATED MEANING: somebody added at least one
  item on this page and left while fewer than two were selected, so a comparison
  never actually began. Leaving a finished comparison is not abandonment.
*/

type Ctx = {
  /* This tab's items only. The other tab's are kept, untouched, in the URL. */
  refs: CompareRef[];
  view: CompareView;
  goal: CompareGoal | null;
  pending: boolean;
  /* Replaces this tab's items. The other tab's items ride along unchanged. */
  navigate: (refs: CompareRef[], goal: CompareGoal | null) => void;
  track: (e: CompareEvent) => void;
};

const CompareCtx = createContext<Ctx | null>(null);

export function useCompare(): Ctx {
  const ctx = useContext(CompareCtx);
  if (!ctx) throw new Error("useCompare outside CompareProvider");
  return ctx;
}

const FLUSH_AFTER_MS = 1200;

export function CompareProvider({
  allRefs,
  view,
  goal,
  itemCount,
  children,
}: {
  allRefs: CompareRef[];
  view: CompareView;
  goal: CompareGoal | null;
  /* Items that actually rendered, which can be fewer than refs when one is gone. */
  itemCount: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const type = viewType(view);
  const refs = allRefs.filter((r) => r.type === type);
  const signature = refs.map((r) => `${r.type}:${r.slug}`).join(",") || null;

  const queue = useRef<CompareEvent[]>([]);
  const batchContext = useRef({ itemCount, goal, signature });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addedHere = useRef(false);
  const latest = useRef({ itemCount, goal, signature });

  const flush = useCallback((beacon: boolean) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (queue.current.length === 0) return;
    const body = JSON.stringify({ ...batchContext.current, events: queue.current.splice(0) });
    if (beacon && typeof navigator.sendBeacon === "function") {
      if (navigator.sendBeacon("/api/compare/events", new Blob([body], { type: "application/json" }))) return;
    }
    void fetch("/api/compare/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      /* Analytics never surfaces an error to the person. */
    });
  }, []);

  /* A batch carries one context. When the comparison changes, whatever was
     queued under the old one goes first. */
  useEffect(() => {
    latest.current = { itemCount, goal, signature };
    const b = batchContext.current;
    if (b.signature !== signature || b.goal !== goal || b.itemCount !== itemCount) {
      flush(false);
      batchContext.current = { itemCount, goal, signature };
    }
  }, [itemCount, goal, signature, flush]);

  const track = useCallback(
    (e: CompareEvent) => {
      if (e.event === "item_added") addedHere.current = true;
      queue.current.push(e);
      if (queue.current.length >= 30) {
        flush(false);
        return;
      }
      if (!timer.current) timer.current = setTimeout(() => flush(false), FLUSH_AFTER_MS);
    },
    [flush],
  );

  /* Section views and the end of the page, observed once per comparison. */
  useEffect(() => {
    if (itemCount < 2) return;
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const id = (entry.target as HTMLElement).dataset.compareSection;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          observer.unobserve(entry.target);
          track(id === "end" ? { event: "comparison_completed" } : { event: "section_viewed", section: id.replace(/-/g, "_") });
        }
      },
      /* A quarter of a section in view counts as seen. A whole section rarely
         fits on a phone, so asking for all of it would never fire. */
      { threshold: 0.25 },
    );
    document.querySelectorAll<HTMLElement>("[data-compare-section]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [signature, itemCount, track]);

  /* Links marked data-compare-event, read by delegation so the server rendered
     sections stay server components. */
  useEffect(() => {
    function onClick(ev: MouseEvent) {
      const el = (ev.target as HTMLElement | null)?.closest<HTMLElement>("[data-compare-event]");
      if (!el) return;
      const kind = el.dataset.compareEvent as CompareEventKind;
      const itemType = el.dataset.compareItemType as CompareItemType | undefined;
      const itemId = el.dataset.compareItemId;
      track({ event: kind, ...(itemType && itemId ? { itemType, itemId } : null) });
      /* It may navigate away. Send now rather than lose it. */
      flush(true);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [track, flush]);

  useEffect(() => {
    function onHide() {
      if (addedHere.current && latest.current.itemCount < 2) {
        queue.current.push({ event: "comparison_abandoned" });
      }
      flush(true);
    }
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [flush]);

  const navigate = useCallback(
    (next: CompareRef[], nextGoal: CompareGoal | null) => {
      const others = allRefs.filter((r) => r.type !== type);
      startTransition(() => {
        router.push(compareHref([...next, ...others], nextGoal, view), { scroll: false });
      });
    },
    [router, allRefs, type, view],
  );

  return (
    <CompareCtx.Provider value={{ refs, view, goal, pending, navigate, track }}>
      <div aria-busy={pending} className={cn("transition-opacity duration-200", pending && "opacity-60")}>
        {children}
      </div>
    </CompareCtx.Provider>
  );
}
