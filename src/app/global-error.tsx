"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

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
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

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
              onClick={() => reset()}
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
