"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/*
  One page view per path a person lands on, sent to our own origin (D264).

  Nothing is stored in the browser: no cookie, no localStorage, no id. The
  server decides who the visitor is. The referrer is sent once, with the first
  page, because a later in app navigation was referred by Celpare itself.

  A browser that asks not to be tracked (Global Privacy Control or Do Not
  Track) sends nothing at all.
*/

const ENDPOINT = "/api/telemetry/pageview";

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || navigator.doNotTrack === "1";
}

export function PageviewBeacon() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === last.current) return;
    const first = last.current === null;
    last.current = pathname;
    try {
      if (optedOut()) return;
      const body = JSON.stringify({ path: pathname, referrer: first ? document.referrer : "" });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* A page view is never worth an error. */
    }
  }, [pathname]);

  return null;
}
