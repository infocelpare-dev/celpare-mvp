"use client";

import { useEffect } from "react";

/*
  Registers public/sw.js, which replaces Cloudflare's own error page (Error 1102
  and friends, founder 2026-11-24) with a Celpare page that has Try again. See
  the comment at the top of sw.js for what it does and does not touch.

  Production only. In `next dev` a service worker would sit in front of hot
  reload and serve stale pages, and the dev server never answers with a
  Cloudflare error anyway. Registered after load so it never competes with
  the page for the network.
*/
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
