"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChartNoAxesColumn, Check, Flag, Heart, MessageCircle, Repeat2, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SaveToCollection } from "@/components/collections/save-to-collection";
import { formatCount } from "@/lib/format";
import { toggleLike, toggleRepost } from "@/app/actions/community";
import { ReportForm } from "./post-controls";

/*
  The action row under a post: like, comment, save.

  OPTIMISTIC WITH A ROLLBACK, per 10-community.md section 9. A like that waits
  for a round trip feels broken, so the count moves on press and only moves
  back if the server refuses.

  Deliberately NOT useOptimistic. That hook resets to the value passed in as
  soon as the surrounding transition ends, which is correct when the server
  re-renders the row with the new count. Nothing here revalidates the feed on a
  like, on purpose: revalidating would re-fetch and re-rank the whole feed
  under somebody who is reading it, and the post they just liked could jump. So
  this component owns the count until the page is loaded again, which plain
  state does and useOptimistic does not.

  IDEMPOTENCE IS NOT DEFENDED HERE. Pressing like twice quickly sends two
  inserts, and the composite primary key on `likes` makes the second one a
  23505 that the action treats as success. The database is the control; the
  disabled state below is only there to stop the count visibly double counting.
*/

export function PostActions({
  postId,
  href,
  likeCount,
  commentCount,
  saveCount,
  liked,
  saved,
  signedIn,
  repostCount = 0,
  reposted = false,
  viewCount,
  showReport = false,
  isOwner = false,
  className,
}: {
  postId: string;
  /* Where the comment button goes. The post's own page. */
  href: string;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  liked: boolean;
  saved: boolean;
  signedIn: boolean;
  /* Repost is on every post of every kind, founder instruction 2026-09-23. */
  repostCount?: number;
  reposted?: boolean;
  /* Distinct people who saw the post, first in the row (founder, 2026-09-24).
     Omitted, nothing renders: a surface without the number shows no number. */
  viewCount?: number;
  /* The flag icon. The feed card turns it on; the post page has its own
     Report and Delete row (PostControls) and leaves it off. */
  showReport?: boolean;
  /* Nobody reports their own post. */
  isOwner?: boolean;
  className?: string;
}) {
  const [likeOn, setLikeOn] = useState(liked);
  const [repostOn, setRepostOn] = useState(reposted);
  const [reposts, setReposts] = useState(repostCount);
  const [reporting, setReporting] = useState(false);
  const [likes, setLikes] = useState(likeCount);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  /*
    Share, founder instruction 2026-09-19. Same shape as the tool page's:
    the native sheet where there is one, the clipboard where there is not.

    THE URL IS BUILT AT PRESS TIME, not at render. NEXT_PUBLIC_SITE_URL is the
    canonical address and is what a share should carry, so a link shared from a
    page reached with tracking parameters still hands over the clean one. When
    it is unset, as it is in development, window.location.origin stands in,
    and reading that during render rather than on press would be a server and
    client mismatch of exactly the kind 4AG.3 shipped once already.

    A cancelled share sheet and a blocked clipboard both land in the catch and
    neither is an error worth showing. A SUCCESSFUL copy says so: the ux
    guidance rates a silent success a defect, and a copy is invisible by
    nature, so the icon becomes a tick for two seconds.
  */
  async function onShare() {
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window === "undefined" ? "" : window.location.origin);
    const url = `${base}${href}`;

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Cancelled, or the clipboard is blocked. Neither is worth a message. */
    }
  }

  function onLike() {
    const next = !likeOn;
    setLikeOn(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    setError("");

    startTransition(async () => {
      const result = await toggleLike("post", postId, next);
      if (!result.ok) {
        /* Roll back to exactly where it was, rather than to the server's idea
           of it: the server does not know what else was pressed meanwhile. */
        setLikeOn(!next);
        setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
        setError(result.message);
      }
    });
  }

  /* Same optimistic shape as the like, rolled back exactly if refused. */
  function onRepost() {
    const next = !repostOn;
    setRepostOn(next);
    setReposts((n) => Math.max(0, n + (next ? 1 : -1)));
    setError("");

    startTransition(async () => {
      const result = await toggleRepost(postId, next);
      if (!result.ok) {
        setRepostOn(!next);
        setReposts((n) => Math.max(0, n + (next ? -1 : 1)));
        setError(result.message);
      }
    });
  }

  return (
    <div className={cn("mt-3", className)}>
      <div className="flex items-center gap-1">
        {/*
          Views: a fact, not a control, so it is plain text with no hover and no
          button role. The number is real (D13, D30): distinct accounts or signed
          out sessions that had the post on screen, the author excluded, kept by
          database triggers on the impression events. Read aloud as "12 views",
          never as a bare number.
        */}
        {viewCount !== undefined ? (
          <span className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 px-3 text-[13px] text-muted">
            <ChartNoAxesColumn className="size-[18px]" aria-hidden />
            <span className="tabular-nums" aria-hidden>
              {formatCount(viewCount)}
            </span>
            <span className="sr-only">
              {viewCount === 1 ? "1 view" : `${viewCount} views`}
            </span>
          </span>
        ) : null}

        {signedIn ? (
          <ActionButton
            label={likeOn ? "Unlike" : "Like"}
            count={likes}
            on={likeOn}
            onClick={onLike}
            disabled={pending}
            tone="like"
          >
            <Heart
              className={cn("size-[18px]", likeOn && "fill-current")}
              aria-hidden
            />
          </ActionButton>
        ) : (
          <SignInAction label="Like" count={likes} tone="like">
            <Heart className="size-[18px]" aria-hidden />
          </SignInAction>
        )}

        {/* Always a link, signed in or not: reading the comments needs no
            account, and the composer on that page handles the rest. */}
        <Link
          href={href}
          className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
        >
          <MessageCircle className="size-[18px]" aria-hidden />
          <span className="sr-only">Comments</span>
          {commentCount > 0 ? (
            <span className="tabular-nums">{formatCount(commentCount)}</span>
          ) : null}
        </Link>

        {signedIn ? (
          <ActionButton
            label={repostOn ? "Undo repost" : "Repost"}
            count={reposts}
            on={repostOn}
            onClick={onRepost}
            disabled={pending}
            tone="repost"
          >
            <Repeat2
              className={cn("size-[18px]", repostOn && "stroke-[2.5]")}
              aria-hidden
            />
          </ActionButton>
        ) : (
          <SignInAction label="Repost" count={reposts} tone="repost">
            <Repeat2 className="size-[18px]" aria-hidden />
          </SignInAction>
        )}

        {/*
          SAVE OPENS THE PICKER. Founder decision 2026-09-21. The component
          carries the count itself, so the row still reads the same as the like
          beside it, and it handles the signed out case with a link to the gate
          rather than a control that would refuse.
        */}
        <SaveToCollection
          entityType="post"
          entityId={postId}
          initialSaved={saved}
          signedIn={signedIn}
          variant="icon"
          count={saveCount}
        />

        {/*
          Share is open to everybody, signed in or not. It writes nothing and
          asks the database for nothing, so gating it behind an account would
          be a control refusing to do something it is perfectly able to do.
          It carries no count, because a share is not counted: counting one
          would need tracking that does not exist, and a number nothing
          maintains is the invented metric D13 and D30 rule out.
        */}
        <button
          type="button"
          onClick={onShare}
          className="inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
        >
          {copied ? (
            <Check className="size-[18px]" aria-hidden />
          ) : (
            <Share2 className="size-[18px]" aria-hidden />
          )}
          <span className="sr-only">Share this post</span>
        </button>

        {/* The confirmation, announced as well as drawn. aria-live rather than
            role=alert: a copied link is not an error. */}
        <span role="status" aria-live="polite" className="text-[13px] text-muted">
          {copied ? "Link copied" : ""}
        </span>

        {/* Report, on every post and not only videos. Pushed to the far end so
            it is never pressed by mistake on the way to Share. */}
        {showReport && signedIn && !isOwner ? (
          <button
            type="button"
            onClick={() => setReporting((v) => !v)}
            aria-expanded={reporting}
            className={cn(
              "ms-auto inline-flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-full px-3 text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground",
              reporting && "text-foreground",
            )}
          >
            <Flag className="size-[18px]" aria-hidden />
            <span className="sr-only">Report this post</span>
          </button>
        ) : null}
      </div>

      {reporting ? (
        <ReportForm
          entityType="post"
          entityId={postId}
          onDone={() => setReporting(false)}
        />
      ) : null}

      {/* role=alert, because the ux guidance rates a visual only error High.
          Rendered only when there is one, so nothing is announced on load. */}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/*
  44px tall and at least 44px wide, which is the iOS touch target the ux
  guidance asks for, with gap-1 between them for the spacing rule. The count
  sits inside the button so the number is part of the same target.
*/
function ActionButton({
  label,
  count,
  on,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  count: number;
  on: boolean;
  onClick: () => void;
  disabled: boolean;
  tone: "like" | "save" | "repost";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={cn(
        "inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-[13px]",
        "transition-colors duration-200 ease-out hover:bg-surface disabled:cursor-default disabled:opacity-60",
        /*
          The on state is a FILLED icon in ink, not a lime one. globals.css is
          explicit that lime is a background for ink text or an accent on ink
          and is never a text color: #d1fe03 on paper is 1.17:1. So the signal
          that carries here is fill and weight, which works in both themes and
          does not depend on color at all, which is what the accessibility
          guidance wants anyway.
        */
        on ? "font-medium text-foreground" : "text-muted hover:text-foreground",
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
      {/* Hidden at zero, per 10-community.md section 9: a grey nought on every
          action of every post is noise, and on an empty feed it is three of
          them per row. */}
      {count > 0 ? <span className="tabular-nums">{formatCount(count)}</span> : null}
      <span className="sr-only">{tone === "like" ? "likes" : tone === "repost" ? "reposts" : "saves"}</span>
    </button>
  );
}

/*
  The signed out version. A link rather than a disabled button, because the
  answer to "you need an account" is a way to get one, not a dead control.
*/
function SignInAction({
  label,
  count,
  tone,
  children,
}: {
  label: string;
  count: number;
  tone: "like" | "save" | "repost";
  children: React.ReactNode;
}) {
  return (
    <Link
      href="/get-started"
      className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
    >
      {children}
      <span className="sr-only">{label}, sign in first</span>
      {count > 0 ? <span className="tabular-nums">{formatCount(count)}</span> : null}
      <span className="sr-only">{tone === "like" ? "likes" : tone === "repost" ? "reposts" : "saves"}</span>
    </Link>
  );
}

/*
  The like on a comment. Same optimistic shape as a post's, smaller surface:
  a comment has no save and no comment count of its own, so there is one
  control rather than three.
*/
export function CommentLike({
  commentId,
  likeCount,
  liked,
  signedIn,
}: {
  commentId: string;
  likeCount: number;
  liked: boolean;
  signedIn: boolean;
}) {
  const [on, setOn] = useState(liked);
  const [count, setCount] = useState(likeCount);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <SignInAction label="Like" count={count} tone="like">
        <Heart className="size-4" aria-hidden />
      </SignInAction>
    );
  }

  function onClick() {
    const next = !on;
    setOn(next);
    setCount((n) => Math.max(0, n + (next ? 1 : -1)));
    setError("");

    startTransition(async () => {
      const result = await toggleLike("comment", commentId, next);
      if (!result.ok) {
        setOn(!next);
        setCount((n) => Math.max(0, n + (next ? -1 : 1)));
        setError(result.message);
      }
    });
  }

  return (
    <>
      <ActionButton
        label={on ? "Unlike" : "Like"}
        count={count}
        on={on}
        onClick={onClick}
        disabled={pending}
        tone="like"
      >
        <Heart className={cn("size-4", on && "fill-current")} aria-hidden />
      </ActionButton>
      {error ? (
        <span role="alert" className="text-[13px] text-foreground">
          {error}
        </span>
      ) : null}
    </>
  );
}
