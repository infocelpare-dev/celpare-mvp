"use client";

import { useState, useTransition } from "react";
import { Link2, Trash2 } from "lucide-react";
import { hostOf, relativeTime } from "@/lib/format";
import { deleteMessage } from "@/app/actions/messages";
import { cn } from "@/lib/utils";
import type { DmMessage } from "@/lib/messages/queries";

/*
  One message in a thread.

  A client component only because retracting one needs a press and a pending
  state. Everything it renders is server data; nothing is fetched here.

  `DmMessage` is a TYPE import. lib/messages/queries.ts is server-only and
  mints signed URLs, so a value import would drag it into this bundle and fail
  the build. The type is erased at compile time.

  RETRACTING ASKS TWICE, IN PLACE. No modal and no confirm(): a native dialog
  blocks every later event, and a modal would cover the message somebody wants
  to read once more before removing it. Same pattern as the feed's delete and
  as 4O.13's chat rows.
*/
export function DmMessageRow({
  message,
  mine,
}: {
  message: DmMessage;
  mine: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    setError("");
    startTransition(async () => {
      const result = await deleteMessage(message.id, message.thread_id);
      if (!result.ok) {
        setError(result.message);
        setAsking(false);
      }
      /* On success the server action revalidates this page and the row simply
         stops being rendered. Nothing to do here. */
    });
  }

  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className="group max-w-[85%] sm:max-w-[75%]">
        <div
          className={cn(
            /* Flat per D11: one hairline, no shadow, no gradient. Mine is the
               filled one, and it is ink on lime, never white on lime, which is
               1.17:1 and barred by D2. */
            "rounded-2xl border px-3.5 py-2.5",
            mine
              ? "border-transparent bg-accent text-on-accent"
              : "border-border bg-background",
          )}
        >
          <Body message={message} mine={mine} />
        </div>

        <div
          className={cn(
            "mt-1 flex items-center gap-2 px-1 text-[12px] text-muted",
            mine ? "justify-end" : "justify-start",
          )}
        >
          {/* suppressHydrationWarning: relativeTime reads the clock, so the
              server can say 9m and the browser 8m a second later, which is the
              hydration mismatch 4O.10 fixed on /ask. */}
          <time dateTime={message.created_at} suppressHydrationWarning>
            {relativeTime(message.created_at)}
          </time>

          {mine ? (
            asking ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={pending}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {pending ? "Removing" : "Remove"}
                </button>
                <button
                  type="button"
                  onClick={() => setAsking(false)}
                  disabled={pending}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setAsking(true)}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Trash2 className="size-3.5" aria-hidden />
                <span className="sr-only">Remove this message</span>
              </button>
            )
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-1 px-1 text-[12px] text-foreground">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function Body({ message, mine }: { message: DmMessage; mine: boolean }) {
  if (message.kind === "voice") {
    if (!message.media_url) return <Unavailable />;
    return (
      <div className="min-w-[200px]">
        {/*
          A plain audio element with controls. The browser's own player handles
          scrubbing, speed and the lock screen better than anything written
          here would, and it needs no JavaScript.

          preload="metadata", not auto: a thread with twenty voice notes would
          otherwise pull all twenty on load.
        */}
        <audio
          src={message.media_url}
          controls
          preload="metadata"
          className="w-full"
        />
        {message.duration_seconds ? (
          <p
            className={cn(
              "mt-1 text-[12px]",
              mine ? "text-on-accent/70" : "text-muted",
            )}
          >
            Voice message · {formatDuration(message.duration_seconds)}
          </p>
        ) : null}
      </div>
    );
  }

  if (message.kind === "video") {
    if (!message.media_url) return <Unavailable />;
    return (
      <video
        src={message.media_url}
        controls
        preload="metadata"
        playsInline
        className="max-h-[60vh] w-full min-w-[200px] rounded-xl"
      />
    );
  }

  if (message.kind === "link") {
    return (
      <div>
        {message.body ? (
          <p className="mb-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {message.body}
          </p>
        ) : null}
        <a
          href={message.link_url ?? "#"}
          target="_blank"
          /* ugc and nofollow because a stranger supplied it; noopener is what
             stops the new tab reaching window.opener. */
          rel="noopener noreferrer nofollow ugc"
          className="inline-flex max-w-full items-center gap-1.5 text-[14px] underline underline-offset-4"
        >
          <Link2 className="size-4 shrink-0" aria-hidden />
          <span className="truncate">
            {message.link_url ? hostOf(message.link_url) : "Link"}
          </span>
        </a>
      </div>
    );
  }

  return (
    /* whitespace-pre-wrap keeps the sender's line breaks, break-words stops one
       unbroken 200 character string pushing the thread sideways at 390px.
       Rendered as text, never as markup. */
    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
      {message.body}
    </p>
  );
}

/* The signed URL could not be minted. Says so rather than rendering a broken
   player, which is what an empty <audio> looks like. */
function Unavailable() {
  return (
    <p className="text-[14px] italic opacity-80">
      This attachment could not be loaded. Reload the page to try again.
    </p>
  );
}

function formatDuration(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
