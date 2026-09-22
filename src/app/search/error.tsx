"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button, ButtonLink } from "@/components/ui/button";

/*
  The error state for search.

  An error boundary has to be a client component: React needs componentDidCatch
  underneath it, and `reset` is a callback, which cannot cross the server
  boundary.

  IT REPORTS, THEN IT SAYS SOMETHING USEFUL. Sentry captures the real error and
  the person is told the search failed rather than being handed a digest they can
  do nothing with. D82 still holds: nothing here gives Sentry a request body, a
  cookie or the query itself, because a search query is personal and the error
  React caught is enough to find the fault.

  Two ways out: run it again, which re-renders on the server without a full page
  load, and a page that is known to work.
*/
export default function SearchError({
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
        The search did not run
      </h1>
      <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted">
        Something failed on our side, not yours. It has been reported. Trying
        again often works, because this kind of failure is usually one request
        rather than the whole service.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/explore" variant="outline">
          Browse categories instead
        </ButtonLink>
      </div>
    </div>
  );
}
