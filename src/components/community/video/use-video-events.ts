"use client";

import { useCallback, useEffect, useRef } from "react";
import type {
  VideoEvent,
  VideoEventKind,
  VideoSource,
} from "@/lib/community/video-analytics";

/*
  The client half of video analytics: collect, batch, flush.

  WHY A QUEUE RATHER THAN A REQUEST PER EVENT. Watching one video produces an
  impression, a start, two or three progress milestones and a swipe, and a person
  going through ten videos would otherwise send sixty requests in a minute. They
  are batched and sent on a timer, which is also what makes the beacon on the way
  out carry something worth sending.

  THE FLUSH ON THE WAY OUT IS THE IMPORTANT ONE. Most watching ends by leaving:
  closing the tab, hitting back, switching apps. `visibilitychange` to hidden is
  the only event that reliably fires on mobile, where `beforeunload` and `unload`
  do not, so that is the primary trigger and sendBeacon is what survives the page
  going away. A normal fetch at that moment gets cancelled.

  NOTHING HERE READS ANYTHING BACK. The endpoint answers 204 and no part of the
  interface waits on it, so a failed flush loses events and changes nothing a
  person can see. That is the right trade for telemetry: it must never be able to
  make the player stutter.
*/

const FLUSH_INTERVAL_MS = 10_000;
const MAX_QUEUE = 40;

/*
  Groups one signed out person's events within a sitting. sessionStorage, not
  localStorage, so it dies with the tab and never becomes a durable identifier;
  the server throws it away entirely for anybody signed in.
*/
function sessionId(): string | null {
  try {
    const key = "celpare.video.session";
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const made = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    window.sessionStorage.setItem(key, made);
    return made;
  } catch {
    /* Private mode, or storage blocked. An ungrouped event is still worth more
       than no event, so this is not a reason to stop recording. */
    return null;
  }
}

export type TrackFn = (
  event: VideoEventKind,
  postId: string,
  extra?: Omit<VideoEvent, "postId" | "event">,
) => void;

export function useVideoEvents(source: VideoSource): TrackFn {
  const queue = useRef<VideoEvent[]>([]);
  const endpoint = "/api/community/video/events";

  const flush = useCallback(
    (beacon: boolean) => {
      if (queue.current.length === 0) return;

      const events = queue.current.splice(0, MAX_QUEUE);
      const body = JSON.stringify({ source, sessionId: sessionId(), events });

      try {
        if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
          return;
        }
        void fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {
          /* Telemetry never surfaces an error. Losing a batch is acceptable;
             an error toast over somebody's video is not. */
        });
      } catch {
        /* Same. */
      }
    },
    [source],
  );

  useEffect(() => {
    const timer = window.setInterval(() => flush(false), FLUSH_INTERVAL_MS);

    function onHidden() {
      if (document.visibilityState === "hidden") flush(true);
    }

    document.addEventListener("visibilitychange", onHidden);
    /* pagehide as well, because iOS Safari can skip visibilitychange when the
       tab is closed outright rather than backgrounded. */
    window.addEventListener("pagehide", onHidden);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onHidden);
      /* Unmounting is leaving too: navigating from the viewer back to the feed
         would otherwise drop everything since the last tick. */
      flush(true);
    };
  }, [flush]);

  return useCallback((event, postId, extra) => {
    queue.current.push({ postId, event, ...extra });
    /* A hard ceiling, so a bug that records in a loop cannot grow the array
       without bound between flushes. The oldest go first: the newest events are
       the ones describing what is on screen now. */
    if (queue.current.length > MAX_QUEUE * 2) {
      queue.current.splice(0, queue.current.length - MAX_QUEUE);
    }
  }, []);
}
