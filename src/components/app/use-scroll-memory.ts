"use client";

import { useEffect, type RefObject } from "react";
import { usePathname } from "next/navigation";

/*
  Coming back to the feed must put you where you were (founder, 2026-11-09:
  leaving a post "reloaded" the feed).

  The page did not reload: the router served the cached feed. But every page
  inside Celpare scrolls an inner <main>, not the window, and browsers only
  restore the WINDOW's scroll on back and forward. So returning from a post
  always landed at the top of the feed, which looks exactly like a reload.

  This remembers the main column's scrollTop per URL as you scroll, and puts it
  back only on a back or forward navigation (a popstate). A link you tap still
  starts the next page at the top, as everywhere else on the web. Content
  streams in after the URL changes, so the restore retries for a moment until
  the page is tall enough to scroll that far.

  sessionStorage, so it lives as long as the tab and never leaves the browser;
  every access is guarded, because private windows can refuse it.
*/

const PREFIX = "celpare:scroll:";
const RESTORE_FOR_MS = 2000;

/* The URL a back or forward press landed on. Not a timestamp, because a slow
   render can land well after the press, and not a flag consumed on read,
   because React runs effects twice in development; it is cleared when the
   next page is a different URL. */
let poppedKey: string | null = null;
let previousPath: string | null = null;
let currentPath: string | null = null;

/*
  Registered when the module loads, before anything renders. Where the browser
  has the Navigation API (Chrome, Edge), a back or forward press raises a
  "navigate" event of type "traverse" FIRST, and the router renders the cached
  page before popstate ever fires, so popstate alone arrives too late. The
  traverse event names the destination. popstate stays as the fallback for
  browsers without the Navigation API, in the capture phase so it runs before
  the router's own handler.
*/
type NavigateEventLike = Event & { navigationType?: string; destination?: { url?: string } };

if (typeof window !== "undefined") {
  const nav = (window as unknown as { navigation?: EventTarget }).navigation;
  nav?.addEventListener("navigate", (e) => {
    const ev = e as NavigateEventLike;
    if (ev.navigationType !== "traverse" || !ev.destination?.url) return;
    const u = new URL(ev.destination.url);
    poppedKey = PREFIX + u.pathname + u.search;
  });
  window.addEventListener(
    "popstate",
    () => {
      poppedKey = keyFor();
    },
    { capture: true },
  );
}

function keyFor(): string {
  return PREFIX + window.location.pathname + window.location.search;
}

function save(key: string, top: number) {
  try {
    window.sessionStorage.setItem(key, String(Math.round(top)));
  } catch {
    /* Storage refused: nothing to remember, nothing breaks. */
  }
}

function read(key: string): number | null {
  try {
    const v = window.sessionStorage.getItem(key);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

/* The in app page shown before this one, or null on a first load. BackLink uses
   it to go back through history (and so restore scroll) when the page it names
   is the page you came from. */
export function cameFrom(): string | null {
  return previousPath;
}

export function useScrollMemory(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  const pathname = usePathname();

  useEffect(() => {
    if (currentPath !== pathname) {
      previousPath = currentPath;
      currentPath = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const key = keyFor();

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => save(key, el.scrollTop));
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    /* Only a back or forward navigation restores; it fired just before this. */
    let timer = 0;
    if (poppedKey !== key) poppedKey = null;
    const wanted = poppedKey === key ? read(key) : null;    if (wanted && wanted > 0) {
      const started = Date.now();
      const attempt = () => {
        el.scrollTop = wanted;
        const reached = Math.abs(el.scrollTop - wanted) < 2;
        if (!reached && Date.now() - started < RESTORE_FOR_MS) {
          timer = window.setTimeout(attempt, 50);
        }
      };
      attempt();
    }

    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [ref, enabled, pathname]);
}
