"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button, ButtonLink } from "@/components/ui/button";

/*
  The error state for Compare, for a failure the page could not contain.

  Almost nothing should reach it. A missing item keeps its slot and says so, and
  every evidence read reports its own failure where its section would be (D109).
  What is left is a failure around all of that. Reported to Sentry with nothing
  but the exception, per D82.
*/
export default function CompareError({
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
      <h1 className="font-display text-[20px] font-semibold">Couldn&apos;t load this comparison</h1>
      <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted">
        Something failed on our side, not yours, and it has been reported. Your selection is still in the
        address bar, so trying again keeps it.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>Retry</Button>
        <ButtonLink href="/compare" variant="outline">
          Start a new comparison
        </ButtonLink>
      </div>
    </div>
  );
}
