"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button, ButtonLink } from "@/components/ui/button";

/*
  The error state for Explore, for a failure the sections could not contain.

  ALMOST NOTHING SHOULD REACH THIS. Every provider catches its own failure and
  reports it as one failed shelf with a retry, which is the whole point of the
  per section state: one query falling over must not cost somebody the other ten
  sections. What is left for this boundary is a failure before or around the
  sections, such as the session read at the top of the page.

  An error boundary has to be a client component: React needs componentDidCatch
  underneath it, and `reset` is a callback, which cannot cross the server
  boundary.

  IT REPORTS, THEN IT SAYS SOMETHING USEFUL. D82 still holds: Sentry gets the
  exception React caught and no request body, no cookie and no stack frame
  locals.
*/
export default function ExploreError({
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
    <div className="mx-auto w-full max-w-[640px] px-4 py-16 text-center sm:px-5 sm:py-24">
      <h1 className="font-display text-[20px] font-semibold">
        Explore did not load
      </h1>
      <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted">
        Something failed on our side, not yours. It has been reported. This is
        not a statement about what is on Celpare: nothing could be read, so
        nothing could be shown.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/search" variant="outline">
          Search instead
        </ButtonLink>
      </div>
    </div>
  );
}
