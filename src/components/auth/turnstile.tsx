"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";

/*
  Cloudflare Turnstile. Replaces the checkbox, which was security theatre
  because any script could post its value.

  Setup, both halves are required:
  1. Cloudflare dashboard, Turnstile, add a widget for your domain.
     Put the SITE key in NEXT_PUBLIC_TURNSTILE_SITE_KEY.
  2. Supabase dashboard, Authentication, Attack Protection, enable CAPTCHA
     protection with provider Turnstile and paste the SECRET key.

  Without step 2 Supabase ignores the token entirely, so the widget would look
  like it works while protecting nothing. Both halves, or neither.

  When no site key is configured the widget renders a disabled notice rather
  than blocking signup, so local development keeps working.
*/

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "auto" | "light" | "dark";
          action?: string;
        },
      ) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export function Turnstile({
  onToken,
  invalid,
}: {
  onToken: (token: string) => void;
  invalid?: boolean;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

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
        callback: (token) => onToken(token),
        "error-callback": () => {
          setFailed(true);
          onToken("");
        },
        "expired-callback": () => onToken(""),
      });
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
        s.onerror = () => setFailed(true);
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

  if (!siteKey) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3.5 text-[13px] text-muted">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        Bot protection is off. Set NEXT_PUBLIC_TURNSTILE_SITE_KEY to enable it.
      </div>
    );
  }

  return (
    <div>
      <div ref={holder} className={invalid ? "rounded-xl ring-2 ring-foreground" : undefined} />
      {failed ? (
        <p role="alert" className="mt-2 text-[13px] text-foreground">
          The bot check could not load. Disable any content blocker and reload.
        </p>
      ) : null}
    </div>
  );
}
