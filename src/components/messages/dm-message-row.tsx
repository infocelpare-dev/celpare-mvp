"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Download, FileText, Link2, Trash2 } from "lucide-react";
import { hostOf, relativeTime } from "@/lib/format";
import { deleteMessage } from "@/app/actions/messages";
import { cn } from "@/lib/utils";
import type { DmMessage, DmPerson } from "@/lib/messages/queries";

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
  sender = null,
  showAvatar = false,
  showName = false,
  delivered = false,
}: {
  message: DmMessage;
  mine: boolean;
  /* Who sent it, for their photo beside the bubble. Theirs only. */
  sender?: DmPerson | null;
  /* The photo sits beside the LAST bubble of a run from the same person, as
     Instagram and TikTok draw it. The others keep the space, so a run of
     bubbles stays in one column. */
  showAvatar?: boolean;
  /* Their name above the FIRST bubble of a run, as in the founder's reference. */
  showName?: boolean;
  /* "Delivered" under the viewer's most recent message. Stored is delivered:
     there are no read receipts, so nothing stronger is claimed. */
  delivered?: boolean;
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
    <li className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
      {!mine ? (
        showAvatar && sender ? (
          <Link
            href={`/u/${sender.username}`}
            className="mb-5 shrink-0 rounded-full"
          >
            <Avatar
              size="sm"
              fullName={sender.full_name}
              username={sender.username}
              avatarUrl={sender.avatar_url}
            />
            <span className="sr-only">Open {sender.full_name || sender.username}&apos;s profile</span>
          </Link>
        ) : (
          <span aria-hidden className="size-8 shrink-0" />
        )
      ) : null}
      <div className="group max-w-[80%] sm:max-w-[72%]">
        {!mine && showName && sender ? (
          <p className="mb-1 px-1 text-[13px] font-semibold text-foreground">
            {sender.full_name || sender.username}
          </p>
        ) : null}
        <div
          className={cn(
            /* Flat per D11. Mine is the filled one in the primary colour, ink on
               light and near white on dark (D122); the lime it used to be was
               removed at the founder's request, 2026-09-23. Theirs is the soft
               grey surface, as Instagram and TikTok draw the other side. */
            "rounded-[20px]",
            /* A photo or a video nearly fills its bubble; text gets padding. */
            message.kind === "image" || message.kind === "video" ? "p-1" : "px-3.5 py-2.5",
            mine
              ? "bg-primary text-on-primary"
              : "bg-surface text-foreground",
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
          {delivered ? <span>Delivered</span> : null}

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
              mine ? "text-on-primary/70" : "text-muted",
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

  if (message.kind === "image") {
    if (!message.media_url) return <Unavailable />;
    /*
      A photo (4BB). A signed URL from the private dm-images bucket, served by the
      storage host with the image type it was uploaded as, in an <img>, which
      never runs anything. Opening it goes to that same URL in a new tab.
      Plain img rather than next/image: the URL is signed and short lived, so
      there is nothing for an optimiser to cache.
    */
    return (
      <a
        href={message.media_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-xl"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={message.media_url}
          alt="Photo"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="max-h-[320px] w-full min-w-[160px] object-cover"
        />
        <span className="sr-only">Open the photo in full size</span>
      </a>
    );
  }

  if (message.kind === "file") {
    /*
      A TXT or CSV (4BA). Shown as a card, NEVER opened in the page: no preview,
      no iframe, no fetch of its contents. The link is a signed URL minted with
      `download`, so storage answers Content-Disposition: attachment and the
      browser saves it, from the storage host rather than Celpare's origin.
    */
    return (
      <div className="flex min-w-[220px] items-center gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            mine ? "bg-on-primary/15" : "bg-elevated",
          )}
        >
          <FileText className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">
            {message.file_name ?? "File"}
          </span>
          <span className={cn("block text-[12px]", mine ? "text-on-primary/70" : "text-muted")}>
            {formatBytes(message.file_size ?? 0)}
          </span>
        </span>
        {message.media_url ? (
          <a
            href={message.media_url}
            download={message.file_name ?? true}
            rel="noopener noreferrer nofollow"
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-out",
              mine ? "hover:bg-on-primary/15" : "hover:bg-elevated",
            )}
          >
            <Download className="size-[18px]" aria-hidden />
            <span className="sr-only">Download {message.file_name ?? "file"}</span>
          </a>
        ) : null}
      </div>
    );
  }

  if (message.kind === "link") {
    return (
      <div>
        {message.body ? (
          <div className="mb-1.5">
            <ClampedText>{message.body}</ClampedText>
          </div>
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
    <ClampedText>
      <Linkified text={message.body ?? ""} />
    </ClampedText>
  );
}

/*
  Long text, folded to 20 lines (founder, 2026-09-25; D141 allows 20,000
  characters). The 20 is written in the class itself, line-clamp-[20],
  because Tailwind only generates classes it can read literally. CSS line-clamp, so the 20
  lines are the lines the reader SEES, wrapping included, and nothing is cut by
  code mid word. See more appears only when the text really overflows, which is
  measured in the browser; a ResizeObserver re-measures when the bubble width
  changes (a rotated phone). The whole text is always in the DOM, so find in
  page and screen readers still reach it.
*/
function ClampedText({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || open) return;
    const measure = () => setOverflows(node.scrollHeight > node.clientHeight + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open]);

  return (
    <>
      <p
        ref={ref}
        className={cn(
          "whitespace-pre-wrap break-words text-[15px] leading-relaxed",
          !open && "line-clamp-[20]",
        )}
      >
        {children}
      </p>
      {overflows || open ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1 inline-flex min-h-8 cursor-pointer items-center text-[14px] font-medium underline underline-offset-4"
        >
          {open ? "See less" : "See more"}
        </button>
      ) : null}
    </>
  );
}

/*
  Links typed into a message become clickable, as WhatsApp does (4BA): there is
  no separate link button any more. Only http and https, found by a regex and
  rendered as React elements, so the text never becomes markup and no other
  scheme (javascript:, data:) can become a link. rel ugc and nofollow because a
  stranger supplied it; noopener stops the new tab reaching window.opener.
*/
/* The last character may not be punctuation, so "see https://celpare.com." links
   the address and leaves the full stop as text. */
const URL_PATTERN = /(https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]])/g;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="break-all underline underline-offset-4"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
