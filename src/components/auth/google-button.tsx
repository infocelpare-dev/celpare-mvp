"use client";

import { useState } from "react";
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
  OAuth is started from the browser, not from a Server Action.

  A Server Action that calls redirect() with Google's URL makes Next return a
  redirect the client router then tries to follow as an RSC request. It is
  cross origin, so the response is not RSC, and the router fails with
  "An unexpected response was received from the server". The browser client
  performs a normal top level navigation instead, which is what OAuth needs.
*/
export function GoogleButton({ label }: { label: string }) {
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

export function AuthDivider() {
  return (
    <div className="my-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[13px] text-muted">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
