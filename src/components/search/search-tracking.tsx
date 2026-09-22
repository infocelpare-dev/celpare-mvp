"use client";

import { useEffect, useRef } from "react";
import type { EntityType } from "@/lib/search/types";
import type { ResultEvent, ResultEventKind } from "@/lib/search/analytics";

/*
  Impressions and clicks, measured from the rendered page.

  WHY THIS IS ONE COMPONENT AND NOT A PROP ON EVERY CARD. The cards stay server
  components: they carry `data-result-type`, `data-result-id` and
  `data-result-position` as plain attributes, and this reads them by delegation.
  So ranking and rendering both stay on the server, nothing about a result card
  becomes interactive to be counted, and adding a new kind of result card needs
  three attributes rather than a tracking hook.

  AN IMPRESSION MEANS SEEN, NOT SENT. The IntersectionObserver fires at half the
  row visible, which is the difference between "this was on the page" and "this
  was in front of somebody". Position comes from the attribute rather than from
  the observer's order, because the observer reports in whatever order things
  scroll into view and position is what makes a click interpretable.

  IT FLUSHES ON THE WAY OUT. A click is the last thing that happens before the
  page is replaced, so it goes out with sendBeacon, which the browser completes
  after the document is gone. fetch would be cancelled by the navigation, which is
  the failure mode where exactly the most valuable event is the one that is never
  recorded. pagehide rather than unload, because iOS Safari does not fire unload.
*/

const FLUSH_AFTER_MS = 1200;

type Pending = Map<string, ResultEvent>;

function readTarget(el: Element): ResultEvent | null {
  const type = el.getAttribute("data-result-type");
  const id = el.getAttribute("data-result-id");
  const position = el.getAttribute("data-result-position");
  if (!type || !id) return null;

  return {
    resultType: type as EntityType,
    resultId: id,
    position: Number(position ?? 0) || 0,
    event: "impression",
  };
}

export function SearchTracking({
  queryId,
  query,
}: {
  queryId: string | null;
  query: string;
}) {
  const pending = useRef<Pending>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query) return;

    const bag = pending.current;

    function send(beacon: boolean) {
      if (bag.size === 0) return;
      const events = [...bag.values()];
      bag.clear();
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }

      const body = JSON.stringify({ queryId, query, events });

      if (beacon && typeof navigator.sendBeacon === "function") {
        const ok = navigator.sendBeacon(
          "/api/search/events",
          new Blob([body], { type: "application/json" }),
        );
        if (ok) return;
      }

      void fetch("/api/search/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        /* Telemetry must never surface as an error to somebody searching. */
      });
    }

    function queue(event: ResultEvent, flushNow: boolean) {
      /* Keyed, so scrolling a row in and out of view records one impression
         rather than one per pass. A click replaces the impression key with its
         own, so both are kept. */
      bag.set(`${event.event}:${event.resultType}:${event.resultId}`, event);

      if (flushNow) {
        send(true);
        return;
      }
      if (!timer.current) {
        timer.current = setTimeout(() => send(false), FLUSH_AFTER_MS);
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const event = readTarget(entry.target);
          if (event) queue(event, false);
          /* Once seen is seen. Unobserving also keeps the callback cheap on a
             long scroll. */
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.5 },
    );

    const nodes = document.querySelectorAll("[data-result-id]");
    for (const node of nodes) observer.observe(node);

    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      const card = target?.closest?.("[data-result-id]");
      if (!card) return;

      const event = readTarget(card);
      if (!event) return;

      /* An outbound click is a stronger signal than opening the Celpare page for
         the same thing, so the two are recorded as different events. The card
         says which by marking its outbound link. */
      const link = target?.closest?.("a");
      const outbound = link?.getAttribute("data-result-action") === "outbound";
      const kind: ResultEventKind = outbound ? "outbound" : "click";

      queue({ ...event, event: kind }, true);
    }

    function onHide() {
      send(true);
    }

    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("pagehide", onHide);

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("pagehide", onHide);
      observer.disconnect();
      /* Leaving the page by a client side navigation gets the same flush a real
         unload would. */
      send(true);
    };
  }, [queryId, query]);

  return null;
}
