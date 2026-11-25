"use client";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";

/*
  RELOAD FIRST, ASK SECOND (founder, 2026-11-25: people saw this screen many
  times and had to reload by hand). On the Workers free plan most of what lands
  here is a page that ran out of CPU once (Error 1102) and loads fine a moment
  later. So the screen reloads the page by itself, up to AUTO_RELOADS times per
  address within GUARD_MS, and only then asks. The count lives in
  sessionStorage so a page that really is broken cannot reload forever; when
  storage is unavailable it never auto reloads.
*/
const AUTO_RELOADS = 2;
const GUARD_MS = 60_000;
const KEY = "cp_error_reloads";

function claimAutoReload(): boolean {
  try {
    const here = location.pathname + location.search;
    const now = Date.now();
    const raw = sessionStorage.getItem(KEY);
    const prev = raw ? (JSON.parse(raw) as { at: string; n: number; t: number }) : null;
    const fresh = prev && prev.at === here && now - prev.t < GUARD_MS ? prev : { at: here, n: 0, t: now };
    if (fresh.n >= AUTO_RELOADS) return false;
    sessionStorage.setItem(KEY, JSON.stringify({ at: here, n: fresh.n + 1, t: fresh.t }));
    return true;
  } catch {
    return false;
  }
}

/*
  The last catch. A global-error replaces the root layout, so it renders when
  something failed badly enough that the normal error boundary could not.

  Written without any Celpare component, on purpose. This file runs when the
  app is already broken, and importing the shell, the theme provider or the
  fonts would give it more ways to fail on the way to rendering. Inline styles
  for the same reason: if the stylesheet is what broke, a class name renders an
  unstyled page and this still reads correctly.

  D2 colours are hardcoded here rather than read from tokens. Ink on paper,
  lime only on the button, and ink text on the lime because white on lime is
  1.17:1 and fails.
*/
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  /* Passed by Next and not used: see retry below. */
  reset: () => void;
}) {
  /* Starts as "reloading" so the first paint is a quiet loading line rather
     than the error, which would flash before the reload. */
  const [reloading, setReloading] = useState(true);

  useEffect(() => {
    Sentry.captureException(error);
    if (claimAutoReload()) {
      /* A full page load, through the service worker's own retries. */
      const t = setTimeout(() => location.reload(), 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setReloading(false), 0);
    return () => clearTimeout(t);
  }, [error]);

  /* reset() re-renders the tree that just failed; a reload asks the server
     again, which is what fixes a CPU error. */
  const retry = () => {
    setReloading(true);
    location.reload();
  };

  if (reloading) {
    return (
      <html lang="en">
        <body
          style={{
            margin: 0,
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            background: "#FFFFFF",
            color: "#5A5A5A",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            fontSize: "15px",
          }}
        >
          <p role="status" aria-live="polite">
            Loading
          </p>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#FFFFFF",
          color: "#1C1C1C",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <main style={{ maxWidth: "460px", textAlign: "center" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 600, margin: 0 }}>
            Something broke on our side
          </h1>
          <p style={{ marginTop: "12px", fontSize: "15px", lineHeight: 1.6, color: "#5A5A5A" }}>
            The error has been reported and we can see it. Nothing you did caused this, and
            nothing you saved has been lost.
          </p>

          {/* The digest is what ties this screen to the entry in Sentry. Somebody
              reporting the problem can quote it, which is worth far more than a
              generic apology. */}
          {error.digest ? (
            <p
              style={{
                marginTop: "16px",
                fontSize: "12px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "#8A8A8A",
              }}
            >
              Reference {error.digest}
            </p>
          ) : null}

          <div
            style={{
              marginTop: "28px",
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={retry}
              style={{
                cursor: "pointer",
                border: "1px solid transparent",
                borderRadius: "10px",
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 500,
                background: "#D1FE03",
                color: "#1C1C1C",
              }}
            >
              Try again
            </button>
            {/* A plain anchor, not next/link, and the lint rule is silenced
                rather than obeyed. next/link does a client side navigation
                through the same router that just failed hard enough to reach
                this screen. A full page load is the point: it throws away the
                broken client state instead of asking it to route one more
                time. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                border: "1px solid #E5E5E5",
                borderRadius: "10px",
                padding: "10px 16px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#1C1C1C",
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
