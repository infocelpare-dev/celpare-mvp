"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  Cloudflare Turnstile, gated behind an explicit tap.

  Setup, both halves are required:
  1. Cloudflare dashboard, Turnstile, add a widget for your domain.
     Put the SITE key in NEXT_PUBLIC_TURNSTILE_SITE_KEY.
  2. Supabase dashboard, Authentication, Attack Protection, enable CAPTCHA
     protection with provider Turnstile and paste the SECRET key.

  Without step 2 Supabase ignores the token entirely, so the widget would look
  like it works while protecting nothing. Both halves, or neither.

  Why the tap. By default Turnstile runs its challenge the moment it renders and
  clears most visitors with no interaction at all, which reads as nothing having
  happened. `execution: "execute"` holds the challenge until we call execute(),
  so a person always confirms deliberately before anything is verified.

  This is a UI decision, not a security one. Cloudflare still decides whether the
  challenge itself needs interaction, and the token is still what Supabase
  verifies server side. Requiring the tap does not make the check stronger, it
  makes it visible.

  When no site key is configured the widget renders a disabled notice rather
  than blocking signup, so local development keeps working.
*/

type RenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  theme?: "auto" | "light" | "dark";
  action?: string;
  /* "render" runs the challenge immediately. "execute" waits for execute(). */
  execution?: "render" | "execute";
  /* "execute" keeps the widget out of the layout until the challenge runs. */
  appearance?: "always" | "execute" | "interaction-only";
};

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: RenderOptions) => string;
      execute: (el: HTMLElement | string, opts?: Partial<RenderOptions>) => void;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Status = "loading" | "ready" | "running" | "verified" | "failed";

export function Turnstile({
  onToken,
  invalid,
  label = "I am not a robot",
}: {
  onToken: (token: string) => void;
  invalid?: boolean;
  label?: string;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!siteKey || !holder.current) return;
    const el = holder.current;
    let cancelled = false;

    function render() {
      if (cancelled || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(el, {
        sitekey: siteKey!,
        action: "signup",
        theme: "auto",
        execution: "execute",
        appearance: "execute",
        callback: (token) => {
          setStatus("verified");
          onToken(token);
        },
        "error-callback": () => {
          setStatus("failed");
          onToken("");
        },
        "timeout-callback": () => {
          setStatus("failed");
          onToken("");
        },
        /*
          Tokens expire after about five minutes. Dropping back to "ready"
          asks for the tap again rather than letting the form submit a token
          that Supabase will reject.
        */
        "expired-callback": () => {
          setStatus("ready");
          onToken("");
        },
      });
      setStatus("ready");
    }

    if (window.turnstile) {
      render();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${SCRIPT_SRC}"]`,
      );
      if (existing) {
        existing.addEventListener("load", render);
      } else {
        const s = document.createElement("script");
        s.src = SCRIPT_SRC;
        s.async = true;
        s.defer = true;
        s.onload = render;
        s.onerror = () => setStatus("failed");
        document.head.appendChild(s);
      }
    }

    return () => {
      cancelled = true;
      const id = widgetId.current;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          /* widget already gone */
        }
      }
      widgetId.current = null;
    };
  }, [siteKey, onToken]);

  const run = useCallback(() => {
    if (!holder.current || !window.turnstile || status === "running") return;
    setStatus("running");
    window.turnstile.execute(holder.current);
  }, [status]);

  if (!siteKey) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3.5 text-[13px] text-muted">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        Bot protection is off. Set NEXT_PUBLIC_TURNSTILE_SITE_KEY to enable it.
      </div>
    );
  }

  const done = status === "verified";

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={done || status === "loading" || status === "running"}
        aria-describedby="turnstile-status"
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-[14px] transition-colors duration-200 ease-out",
          done
            ? "border-border bg-surface"
            : "border-border hover:bg-surface disabled:hover:bg-transparent",
          invalid && !done && "border-foreground",
          status === "loading" && "opacity-60",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border transition-colors duration-200",
            done
              ? "border-transparent bg-accent text-on-accent"
              : "border-border",
          )}
        >
          {done ? (
            <Check className="h-3.5 w-3.5" />
          ) : status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
          ) : null}
        </span>

        <span className={done ? "text-muted" : "text-foreground"}>
          {done
            ? "Verified"
            : status === "running"
              ? "Checking..."
              : status === "loading"
                ? "Loading the check..."
                : label}
        </span>
      </button>

      {/* The widget mounts here and only takes up space while a challenge is
          actually on screen, because appearance is "execute". */}
      <div ref={holder} className="mt-3 empty:mt-0" />

      <p id="turnstile-status" role="status" className="sr-only">
        {done
          ? "Verified as human."
          : status === "running"
            ? "Checking, please wait."
            : "Not yet verified."}
      </p>

      {status === "failed" ? (
        <p role="alert" className="mt-2 text-[13px] text-foreground">
          The bot check could not complete. Disable any content blocker and
          reload the page.
        </p>
      ) : null}
    </div>
  );
}
