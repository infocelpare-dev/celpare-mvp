"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { Button, ButtonLink } from "@/components/ui/button";

/*
  Notifications could not be read (4BH). Says so, reports it, and offers a
  retry: an empty list here would claim nothing happened (rule 13).
*/
export default function NotificationsError({
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
      <h1 className="font-display text-[20px] font-semibold">Couldn&apos;t load your notifications</h1>
      <p className="mx-auto mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted">
        Something failed on our side, not yours, and it has been reported. Try again in a moment.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={() => {
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
