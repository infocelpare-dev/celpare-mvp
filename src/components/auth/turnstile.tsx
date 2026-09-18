"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";

/*
  Cloudflare Turnstile, rendered as Cloudflare draws it.

  Setup, both halves are required:
  1. Cloudflare dashboard, Turnstile, add a widget for your domain.
     Put the SITE key in NEXT_PUBLIC_TURNSTILE_SITE_KEY.
  2. Supabase dashboard, Authentication, Attack Protection, enable CAPTCHA
     protection with provider Turnstile and paste the SECRET key.

  Without step 2 Supabase ignores the token entirely, so the widget would look
  like it works while protecting nothing. Both halves, or neither.

  THIS USED TO WRAP THE WIDGET IN A CELPARE BUTTON. It ran with
  execution: "execute" and appearance: "execute", which keeps Cloudflare's own
  widget off the screen until a custom "I am not a robot" control was tapped.
  Founder instruction on 2026-09-16: no Celpare design around it, the visitor
  sees Cloudflare's widget and interacts with that. So the options are gone and
  this now renders the stock widget, which is also the thing people already
  recognise and trust.

  WHETHER IT ASKS FOR A CLICK IS NOT DECIDED HERE. That is the widget mode in
  the Cloudflare dashboard: Managed shows the interactive checkbox, Non
  interactive shows the box without one, Invisible shows nothing at all. No
  code in this file can override it, so if the checkbox is wanted for everyone
  the widget has to be set to Managed in Cloudflare.

  A TOKEN IS SPENT ONCE IT IS SUBMITTED, whether or not the submission
  succeeded. Supabase redeems it before it checks the password, so a wrong
  password burns the captcha with it. Callers pass resetKey and raise it on
  every failed attempt, which re-runs the challenge and hands back a fresh
  token. Without that the second attempt is refused by the captcha instead of
  by the thing the person actually got wrong.

  When no site key is configured this renders a notice instead of the widget,
  so local development keeps working rather than dead ending at a form nobody
  can submit.
*/

type RenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  theme?: "auto" | "light" | "dark";
  action?: string;
};

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: RenderOptions) => string;
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
  action = "auth",
  resetKey,
  onUnavailable,
}: {
  onToken: (token: string) => void;
  invalid?: boolean;
  /* Reported to Cloudflare so signup and sign in can be told apart in their
     analytics. It is a label, not a permission. */
  action?: string;
  /* Raise this to throw the current token away and run a fresh challenge.
     Callers pass their failed attempt count. */
  resetKey?: number;
  /*
    The widget could not load or could not run: a content blocker, a blocked
    challenges.cloudflare.com, or an outage. A caller for which the check is
    decoration rather than the boundary can use this to stop blocking. A caller
    that IS the boundary should not pass it, and will simply refuse to submit.
  */
  onUnavailable?: () => void;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  /*
    onToken comes from useState's setter in every caller, so it is stable, but
    a ref keeps that from being load bearing. Without it a caller that passed
    an inline function would tear down and re-render the widget on every
    keystroke in the form, which is a new challenge each time.
  */
  const emit = useRef(onToken);
  useEffect(() => {
    emit.current = onToken;
  });

  const unavailable = useRef(onUnavailable);
  useEffect(() => {
    unavailable.current = onUnavailable;
  });

  useEffect(() => {
    if (!siteKey || !holder.current) return;
    const el = holder.current;
    let cancelled = false;

    function render() {
      if (cancelled || !window.turnstile || widgetId.current) return;

      /* Follow the app's own theme rather than the operating system's. "auto"
         reads prefers-color-scheme, which is wrong whenever somebody has used
         the Celpare theme toggle to disagree with their OS. */
      const attr = document.documentElement.getAttribute("data-theme");
      const theme = attr === "dark" || attr === "light" ? attr : "auto";

      widgetId.current = window.turnstile.render(el, {
        sitekey: siteKey!,
        action,
        theme,
        callback: (token) => {
          setFailed(false);
          emit.current(token);
        },
        "error-callback": () => {
          setFailed(true);
          emit.current("");
          unavailable.current?.();
        },
        "timeout-callback": () => {
          setFailed(true);
          emit.current("");
        },
        /* Tokens expire after about five minutes. Clearing ours stops the form
           submitting one Supabase would refuse; Cloudflare re-runs the widget
           itself. */
        "expired-callback": () => {
          emit.current("");
        },
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
        s.onerror = () => {
          setFailed(true);
          unavailable.current?.();
        };
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
  }, [siteKey, action]);

  /*
    Re-arm after a failed submit.

    Compared against a ref rather than run on every change of a dependency,
    because the first render must NOT reset: the widget is mid challenge at
    that point and resetting it would cancel the token it is about to produce.

    The parent's token is cleared as well as Cloudflare's. Those are two copies
    of the same fact and leaving the stale one in React state would let the
    form submit a spent token in the gap before the new challenge finishes.
  */
  const appliedReset = useRef(resetKey);
  useEffect(() => {
    if (appliedReset.current === resetKey) return;
    appliedReset.current = resetKey;

    emit.current("");
    setFailed(false);

    const id = widgetId.current;
    if (!id || !window.turnstile) return;
    try {
      window.turnstile.reset(id);
    } catch {
      /* The widget is gone. The render effect owns making a new one. */
    }
  }, [resetKey]);

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
      {/* Cloudflare owns everything inside this div. Nothing here styles it,
          sizes it or draws a border around it: the widget is meant to look the
          way people have seen it look everywhere else. */}
      <div ref={holder} />

      {invalid && !failed ? (
        <p role="alert" className="mt-2 text-[13px] text-foreground">
          Complete the check above, then try again.
        </p>
      ) : null}

      {failed ? (
        <p role="alert" className="mt-2 text-[13px] text-foreground">
          The bot check could not load. A content blocker or a network problem
          is the usual cause.
        </p>
      ) : null}
    </div>
  );
}
