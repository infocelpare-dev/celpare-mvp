"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";

/* Google mark. Inlined rather than loaded from a CDN so it works offline and
   cannot be blocked. The colours are Google's and must not be restyled. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/*
  Two ways to sign in with Google.

  1. Google's own button (Google Identity Services), when
     NEXT_PUBLIC_GOOGLE_CLIENT_ID is set and Google's script loads. The sign in
     happens on celpare.com, so Google's account chooser names celpare.com, not
     the Supabase project address. The ID token is posted to /auth/google,
     which signs in through Supabase and sets the session on the server.

  2. The redirect flow (signInWithOAuth), as before: when the client id is not
     configured, or Google's script is blocked or does not load in time. Signing
     in never depends on a third party script loading.

  Nonce: a random value stays in this page; Google gets its SHA-256 and puts it
  in the token; /auth/google sends the raw value to Supabase, which checks the
  two match, so a token lifted from elsewhere cannot be replayed here.
*/

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const GIS_TIMEOUT_MS = 8000;

type GoogleIdApi = {
  initialize(options: Record<string, unknown>): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

let gisLoading: Promise<GoogleIdApi> | null = null;

function loadGis(): Promise<GoogleIdApi> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  if (!gisLoading) {
    gisLoading = new Promise<GoogleIdApi>((resolve, reject) => {
      const timer = window.setTimeout(() => fail(), GIS_TIMEOUT_MS);
      function fail() {
        window.clearTimeout(timer);
        gisLoading = null;
        reject(new Error("gis_unavailable"));
      }
      const script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        window.clearTimeout(timer);
        const api = window.google?.accounts?.id;
        if (api) resolve(api);
        else fail();
      };
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  return gisLoading;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function GisButton({ onUnavailable }: { onUnavailable: () => void }) {
  const { resolvedTheme } = useTheme();
  const slot = useRef<HTMLDivElement>(null);
  const nonce = useRef("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function onCredential(response: { credential?: string }) {
      if (!response.credential) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: response.credential, nonce: nonce.current }),
        });
        const data = (await res.json().catch(() => null)) as { next?: string } | null;
        if (res.ok && data?.next) {
          window.location.assign(data.next);
          return;
        }
        setError(
          res.status === 429
            ? "Too many sign in attempts from this network. Wait a minute, then try again."
            : "Google sign in did not finish. Try again, or use your email below.",
        );
      } catch {
        setError("Google sign in did not finish. Check your connection and try again.");
      }
      setBusy(false);
    }

    (async () => {
      try {
        const api = await loadGis();
        if (cancelled || !slot.current) return;
        nonce.current = randomHex(32);
        api.initialize({
          client_id: CLIENT_ID,
          nonce: await sha256Hex(nonce.current),
          callback: onCredential,
          ux_mode: "popup",
          context: "signin",
          itp_support: true,
          use_fedcm_for_button: true,
        });
        if (cancelled || !slot.current) return;
        slot.current.innerHTML = "";
        api.renderButton(slot.current, {
          type: "standard",
          theme: resolvedTheme === "dark" ? "filled_black" : "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "center",
          // Google caps the button at 400px.
          width: Math.min(400, Math.max(200, slot.current.offsetWidth)),
        });
        setReady(true);
      } catch {
        if (!cancelled) onUnavailable();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedTheme, onUnavailable]);

  return (
    <div>
      <div className="relative flex min-h-11 items-center justify-center" aria-busy={!ready || busy}>
        <div ref={slot} className="flex w-full justify-center" />
        {!ready ? (
          <div
            className="absolute inset-0 rounded-full border border-border bg-background"
            aria-hidden
          />
        ) : null}
      </div>
      <p aria-live="polite" className="mt-2 min-h-0 text-[13px] text-muted empty:hidden">
        {busy ? "Signing you in..." : ""}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/*
  The redirect flow. OAuth is started from the browser, not from a Server
  Action: a Server Action that calls redirect() with Google's URL makes Next
  return a redirect the client router then tries to follow as an RSC request.
  It is cross origin, so the response is not RSC, and the router fails with
  "An unexpected response was received from the server". The browser client
  performs a normal top level navigation instead, which is what OAuth needs.
*/
function RedirectGoogleButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback`,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) {
        setError("Google sign in could not start. Try again.");
        setPending(false);
      }
      // On success the browser navigates away, so nothing more to do here.
    } catch {
      setError("Google sign in could not start. Try again.");
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-border bg-background text-[15px] font-medium text-foreground transition-colors duration-200 ease-out hover:bg-surface disabled:opacity-60"
      >
        <GoogleIcon />
        {pending ? "Redirecting to Google..." : label}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function GoogleButton({ label }: { label: string }) {
  const [useRedirect, setUseRedirect] = useState(!CLIENT_ID);
  const onUnavailable = useCallback(() => setUseRedirect(true), []);

  if (useRedirect) return <RedirectGoogleButton label={label} />;
  return <GisButton onUnavailable={onUnavailable} />;
}

export function AuthDivider() {
  return (
    <div className="my-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[13px] text-muted">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
