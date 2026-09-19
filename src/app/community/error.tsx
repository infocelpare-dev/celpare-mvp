"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button, ButtonLink } from "@/components/ui/button";

/*
  The error state for the feed and everything under it.

  An error boundary has to be a client component: React needs the class
  componentDidCatch underneath it, and `reset` is a callback, which cannot
  cross the server boundary.

  IT REPORTS, THEN IT SAYS SOMETHING USEFUL. Sentry captures the real error,
  and the person is told plainly that the feed did not load rather than being
  shown a digest hash they can do nothing with. D82 still holds: nothing here
  hands Sentry request bodies, cookies or conversation content, only the error
  that React already caught.

  Two ways out rather than one: try again, which re-runs the server render
  without a full page load, and a way back to a page that is known to work.
*/
export default function CommunityError({
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
        The feed did not load
      </h1>
      <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted">
        Something failed on our side, not yours. It has been reported. Trying
        again often works, because this kind of failure is usually a single
        request rather than the whole service.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/explore" variant="outline">
          Browse tools instead
        </ButtonLink>
      </div>

      {/* The digest is the only handle that ties what somebody saw to what
          Sentry recorded, so it is shown quietly rather than hidden. */}
      {error.digest ? (
        <p className="mt-6 text-[12px] text-muted">
          Reference {error.digest}
        </p>
      ) : null}
    </div>
  );
}
