"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Turnstile } from "./turnstile";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
  Verify first, then choose. The three options stay hidden until Turnstile
  returns a token.

  What this gate is and is not: it keeps casual bots off the entry screen. It
  is not the security control. The token here is spent on the check itself and
  cannot be reused, so the signup form runs its own Turnstile challenge, and
  that one is verified by Supabase server side. This gate is UI, that one is
  the boundary.

  Two consequences of that, both of which were wrong here until 2026-09-17.

  IT LATCHES. Passing once is the whole event, because nothing downstream ever
  reads the token again. This used to track the token, so the five minute
  expiry, or any transient widget error, flipped it back to false and the three
  options vanished from under somebody still reading the page.

  IT FAILS OPEN. This page is the gate and nothing else: Create an account, Log
  in and Skip for now all live inside the revealed block. A content blocker or a
  Cloudflare outage therefore locked a real person out of the entire site, to
  protect a check that is decoration by its own description. That is D80's line,
  that an operational switch fails open and authorization fails closed, and this
  is not authorization. The signup and login forms still fail closed, because
  they are where the boundary actually is.

  THERE USED TO BE A CARD AROUND THIS. A bordered panel, a filling circle, a
  "Quick check first" heading and a line of explanation, which then swapped to
  "Verified, you are human". Founder instruction on 2026-09-16: the widget and
  nothing else. Cloudflare's widget already says what it is and reports its own
  state, so the card was Celpare narrating something the visitor could read for
  themselves.

  When no site key is configured the options show immediately rather than
  trapping everyone behind a widget that can never load.
*/
export function EntryGate() {
  const [verified, setVerified] = useState(
    () => !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );

  /* Latch, never unlatch. See the note above: an expiry or a transient error
     must not retract options somebody is already reaching for. */
  const handleToken = useCallback((token: string) => {
    if (token) setVerified(true);
  }, []);

  /* The widget cannot load. Open the gate rather than strand the visitor on a
     page whose only other content is the widget that just failed. */
  const handleUnavailable = useCallback(() => {
    setVerified(true);
  }, []);

  return (
    <div>
      {/*
        Stays mounted after it clears. Unmounting it on success made the widget
        vanish the instant it passed, which on a visitor Cloudflare waves
        through is almost immediately, so nobody ever saw the check happen.
        Cloudflare's own widget reports "Success!" once it has, which is the
        confirmation the removed card used to be imitating.
      */}
      <Turnstile
        onToken={handleToken}
        onUnavailable={handleUnavailable}
        action="entry"
      />

      {/*
        Kept mounted and hidden rather than unmounted, so the reveal does not
        jump focus and assistive tech announces it through aria-hidden going
        false rather than a surprise DOM insertion.
      */}
      <div
        aria-hidden={!verified}
        className={cn(
          "transition-opacity duration-200",
          verified
            ? "mt-6 opacity-100"
            : "pointer-events-none h-0 overflow-hidden opacity-0",
        )}
      >
        <div className="space-y-3">
          <ButtonLink href="/signup" className="w-full" tabIndex={verified ? 0 : -1}>
            Create an account
            <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>

          <ButtonLink
            href="/login"
            variant="outline"
            className="w-full"
            tabIndex={verified ? 0 : -1}
          >
            Log in
          </ButtonLink>
        </div>

        <p className="mt-6 border-t border-border pt-5 text-center text-[14px] text-muted">
          <Link
            href="/app"
            tabIndex={verified ? 0 : -1}
            className="underline underline-offset-4 transition-colors duration-200 ease-out hover:text-foreground"
          >
            Skip for now
          </Link>
        </p>
      </div>
    </div>
  );
}
