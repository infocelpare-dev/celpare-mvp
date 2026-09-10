"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
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

  When no site key is configured the options show immediately rather than
  trapping everyone behind a widget that can never load.
*/
export function EntryGate() {
  const [verified, setVerified] = useState(
    () => !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  );

  const handleToken = useCallback((token: string) => {
    setVerified(Boolean(token));
  }, []);

  return (
    <div>
      <div
        className={cn(
          "rounded-[16px] border p-6 transition-colors duration-200",
          verified ? "border-border" : "border-border bg-surface",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={cn(
              "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors duration-200",
              verified ? "bg-accent text-on-accent" : "bg-border",
            )}
          >
            {verified && <Check className="h-3 w-3" />}
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-semibold">
              {verified ? "Verified, you are human" : "Quick check first"}
            </h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
              {verified
                ? "Choose how you want to continue."
                : "Confirm you are not a robot to continue."}
            </p>
          </div>
        </div>

        {!verified && (
          <div className="mt-5">
            <Turnstile onToken={handleToken} />
          </div>
        )}
      </div>

      {/*
        Kept mounted and hidden rather than unmounted, so the reveal does not
        jump focus and assistive tech announces it through aria-hidden going
        false rather than a surprise DOM insertion.
      */}
      <div
        aria-hidden={!verified}
        className={cn(
          "mt-6 transition-opacity duration-200",
          verified ? "opacity-100" : "pointer-events-none h-0 overflow-hidden opacity-0",
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
