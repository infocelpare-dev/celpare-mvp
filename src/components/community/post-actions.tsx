"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bookmark, Heart, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/format";
import { toggleLike, toggleSave } from "@/app/actions/community";

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
  className?: string;
}) {
  const [likeOn, setLikeOn] = useState(liked);
  const [likes, setLikes] = useState(likeCount);
  const [saveOn, setSaveOn] = useState(saved);
  const [saves, setSaves] = useState(saveCount);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

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

  function onSave() {
    const next = !saveOn;
    setSaveOn(next);
    setSaves((n) => Math.max(0, n + (next ? 1 : -1)));
    setError("");

    startTransition(async () => {
      const result = await toggleSave(postId, next);
      if (!result.ok) {
        setSaveOn(!next);
        setSaves((n) => Math.max(0, n + (next ? -1 : 1)));
        setError(result.message);
      }
    });
  }

  return (
    <div className={cn("mt-3", className)}>
      <div className="flex items-center gap-1">
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
            label={saveOn ? "Remove from saved" : "Save"}
            count={saves}
            on={saveOn}
            onClick={onSave}
            disabled={pending}
            tone="save"
          >
            <Bookmark
              className={cn("size-[18px]", saveOn && "fill-current")}
              aria-hidden
            />
          </ActionButton>
        ) : (
          <SignInAction label="Save" count={saves} tone="save">
            <Bookmark className="size-[18px]" aria-hidden />
          </SignInAction>
        )}
      </div>

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
  tone: "like" | "save";
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
      <span className="sr-only">{tone === "like" ? "likes" : "saves"}</span>
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
  tone: "like" | "save";
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
      <span className="sr-only">{tone === "like" ? "likes" : "saves"}</span>
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
