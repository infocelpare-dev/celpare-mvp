"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { Button, ButtonLink } from "@/components/ui/button";

/*
  Messages could not be read (4BA.11). Covers the inbox and every thread.

  A failed read used to come back as an empty list, so a conversation that could
  not be loaded said "No messages yet. Say something", which is a false claim
  about somebody's messages and hid the failure from Sentry too (D99, D109). A
  failure now lands here: it says what happened, reports the exception and
  nothing else (D82), and offers a retry that re-reads on the server.
*/
export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-16 text-center sm:px-5 sm:py-24">
      <h1 className="font-display text-[20px] font-semibold">Couldn&apos;t load your messages</h1>
      <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted">
        Something failed on our side, not yours, and it has been reported. Your messages are
        safe. Try again in a moment.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={() => {
            /* refresh re-runs the server read; reset clears this boundary. */
            router.refresh();
            reset();
          }}
        >
          Try again
        </Button>
        <ButtonLink href="/community" variant="outline">
          Back to the feed
        </ButtonLink>
      </div>
    </div>
  );
}
