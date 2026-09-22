"use client";

import Link from "next/link";
import { useState } from "react";
import { Heart, MessageCircle, Repeat2, Share2, Check, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { formatCount, personName } from "@/lib/format";
import type { VideoPost } from "@/lib/community/video";
import { VideoCaption } from "./video-caption";
import { VideoMoreMenu } from "./video-more-menu";
import { VideoComments } from "./video-comments";

/*
  What sits on top of a video: the actions down the right, the creator and the
  caption along the bottom.

  A GRADIENT SCRIM, NOT A PANEL. Text over video is unreadable against a bright
  frame and a solid bar would cover a third of it, so the bottom and top carry a
  transparent-to-black gradient. That is the one place this codebase uses a
  gradient, and it is not decoration: it is the contrast that makes white text
  legible over an unknown image, which the accessibility guidance requires and no
  flat colour can provide here. D11 rules out gradients as ornament, and this is
  a legibility device.

  EVERYTHING REUSES THE EXISTING SYSTEM. Like is toggleLike, the same action and
  the same optimistic-with-rollback shape post-actions.tsx uses. Comments open the
  post's own page, which is where the comment composer already lives. Share is the
  share flow from the post card. Save and report are inside the three dot menu and
  are the existing picker and the existing reportItem. There is no second anything.

  THE COUNTS ARE THE POST'S COUNTS. A video is a post, so its likes are its likes,
  and a separate video like would have split one number into two that disagree.
  There is no share count anywhere in Celpare, so none is drawn: a number nothing
  maintains is the invented metric D13 and D30 rule out.
*/

export function VideoOverlay({
  post,
  likeOn,
  likes,
  onLike,
  likePending,
  likeError,
  repostOn,
  reposts,
  onRepost,
  repostPending,
  following,
  onFollow,
  followPending,
  saved,
  signedIn,
  viewerId,
  onTrack,
}: {
  post: VideoPost;
  /*
    THE LIKE STATE LIVES IN THE SLIDE, NOT HERE. Double tapping the video and
    pressing the heart are the same action, so they have to be the same state and
    the same request. Owning it here would mean the gesture and the button each
    had their own idea of whether the post was liked.
  */
  likeOn: boolean;
  likes: number;
  onLike: () => void;
  likePending: boolean;
  likeError: string;
  /* Same shape and the same reason as the like: the repost is owned by the slide
     so the rail and anything else that triggers it share one state. */
  repostOn: boolean;
  reposts: number;
  onRepost: () => void;
  repostPending: boolean;
  following: boolean;
  onFollow: () => void;
  followPending: boolean;
  saved: boolean;
  signedIn: boolean;
  viewerId: string | null;
  onTrack: (
    event:
      | "like"
      | "comment_opened"
      | "share"
      | "save"
      | "report"
      | "not_interested"
      | "profile_opened"
      | "follow"
      | "repost",
  ) => void;
}) {
  const author = post.author;
  const name = author ? personName(author) : "Someone";
  /* Nobody follows themselves, and follows_no_self would refuse it anyway. */
  const isOwnPost = viewerId !== null && viewerId === post.author_id;
  const href = `/community/${post.id}`;

  const [copied, setCopied] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  /* The rail's number follows the sheet once it has read the real thread, which
     includes replies. posts.comment_count is the starting point and the trigger
     keeps it true; this only moves while the sheet is open. */
  const [commentTotal, setCommentTotal] = useState(post.comment_count);

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window === "undefined" ? "" : window.location.origin);
  const postUrl = `${base}${href}`;

  async function onShare() {
    onTrack("share");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ url: postUrl });
        return;
      }
      await navigator.clipboard.writeText(postUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Cancelled, or the clipboard is blocked. Neither is worth a message. */
    }
  }

  return (
    <>
      {/* The scrims. pointer-events-none throughout, so they never eat a tap
          meant for the video or for a control above them. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/75 via-black/40 to-transparent"
      />

      {/*
        THE ACTION RAIL. Right side, bottom aligned, 44px targets with gap-2
        between them, which is the touch size and the 8px spacing the guidance
        asks for. It sits above the caption's end padding so the two never
        overlap at 390px.
      */}
      {/*
        z-20, ABOVE THE CAPTION BLOCK, and this is load bearing.

        The caption container is `inset-x-0`, so its BOX spans the full width and
        runs underneath this rail even though its text stops short at `pe-20`.
        Both were z-10 and the caption comes later in the DOM, so it painted on
        top and swallowed every click on the lower half of the rail: More was
        completely dead and Share was partly dead. Found by asking the browser
        what was actually at the button's centre, which returned the caption div.

        Padding the text was never going to fix it. The box is what receives the
        click, so the stacking order is what has to say which one wins.
      */}
      <div className="absolute bottom-4 end-2 z-20 flex flex-col items-center gap-2">
        <RailButton
          label={likeOn ? "Unlike this video" : "Like this video"}
          count={likes}
          onClick={onLike}
          disabled={likePending}
          pressed={likeOn}
          signedIn={signedIn}
        >
          <Heart
            className={cn("size-7 drop-shadow", likeOn && "fill-current")}
            aria-hidden
          />
        </RailButton>

        {/*
          OPENS THE SHEET, it no longer navigates. Founder instruction
          2026-09-22: comments are readable from the icon without leaving the
          video. The post page still shows the same thread for anybody arriving
          from outside, and both render the same component.

          A button rather than a link now, because it opens something on this
          page. Reading still needs no account: the sheet gates only the
          composer.
        */}
        <button
          type="button"
          onClick={() => {
            onTrack("comment_opened");
            setCommentsOpen(true);
          }}
          aria-haspopup="dialog"
          aria-expanded={commentsOpen}
          className="inline-flex min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full px-1 text-white transition-colors duration-200 ease-out hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <MessageCircle className="size-7 drop-shadow" aria-hidden />
          <span className="sr-only">Comments on this video</span>
          {commentTotal > 0 ? (
            <span className="text-[12px] font-medium tabular-nums drop-shadow">
              {formatCount(commentTotal)}
            </span>
          ) : null}
        </button>

        {/*
          REPOST. D70 built the table in Phase 4K and nothing could ever write
          it: no action, no control, a Reposts tab on the profile that could only
          ever be empty. The action exists now and this is the first control that
          calls it.
        */}
        <RailButton
          label={repostOn ? "Undo repost" : "Repost this video"}
          count={reposts}
          onClick={onRepost}
          disabled={repostPending}
          pressed={repostOn}
          signedIn={signedIn}
        >
          <Repeat2
            className={cn("size-7 drop-shadow", repostOn && "stroke-[2.5]")}
            aria-hidden
          />
        </RailButton>

        <button
          type="button"
          onClick={onShare}
          className="inline-flex min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full px-1 text-white transition-colors duration-200 ease-out hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {copied ? (
            <Check className="size-7 drop-shadow" aria-hidden />
          ) : (
            <Share2 className="size-7 drop-shadow" aria-hidden />
          )}
          <span className="sr-only">Share this video</span>
        </button>

        <VideoMoreMenu
          postId={post.id}
          postUrl={postUrl}
          saved={saved}
          signedIn={signedIn}
          onSave={() => onTrack("save")}
          onReport={() => onTrack("report")}
          onNotInterested={() => onTrack("not_interested")}
          onShare={() => onTrack("share")}
        />
      </div>

      {/*
        THE CREATOR AND THE CAPTION. Bottom left, with the rail's width kept
        clear so a long name never runs under the buttons.
      */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-4 pe-20 sm:px-5 sm:pe-24">
        <div className="flex items-center gap-2.5">
          {author ? (
            <Link
              href={`/u/${author.username}`}
              onClick={() => onTrack("profile_opened")}
              className="flex min-h-11 items-center gap-2.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Avatar
                fullName={author.full_name}
                username={author.username}
                avatarUrl={author.avatar_url}
                size="sm"
              />
              <span className="truncate text-[15px] font-semibold text-white drop-shadow">
                {name}
              </span>
            </Link>
          ) : (
            <span className="text-[15px] font-semibold text-white drop-shadow">{name}</span>
          )}

          {/*
            FOLLOW, and it only appears when it would do something: not on your
            own video, not when you already follow, and not to a signed out
            visitor, who gets the gate instead. A button that says Follow to
            somebody who already follows is defect F4, which is why this needed
            the viewer to read follows before it could be drawn at all.

            NO VERIFIED BADGE, and that is an absence on purpose. `profiles` has
            no verified column. is_developer is a UI preference that grants
            nothing (D75), so a badge drawn from it would be a claim the database
            does not make.
          */}
          {author && !following && !isOwnPost ? (
            signedIn ? (
              <button
                type="button"
                onClick={onFollow}
                disabled={followPending}
                className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-white/70 px-3 text-[13px] font-medium text-white transition-colors duration-200 ease-out hover:bg-white/15 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <UserPlus className="size-3.5" aria-hidden />
                Follow
              </button>
            ) : (
              <Link
                href="/get-started"
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-white/70 px-3 text-[13px] font-medium text-white transition-colors duration-200 ease-out hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <UserPlus className="size-3.5" aria-hidden />
                Follow
              </Link>
            )
          ) : null}
        </div>

        <div className="mt-2">
          <VideoCaption body={post.body} linkUrl={post.link_url} />
        </div>
      </div>

      <VideoComments
        postId={post.id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCountChange={setCommentTotal}
      />

      {likeError ? (
        <p
          role="alert"
          className="absolute inset-x-4 bottom-2 z-30 text-[13px] text-white drop-shadow"
        >
          {likeError}
        </p>
      ) : null}
    </>
  );
}

/*
  One control in the rail: the icon, its count under it, and a name only a screen
  reader sees. 44px minimum in both directions.

  A signed out visitor gets a link to the gate rather than a button that the
  server would refuse, which is the rule the feed's action row already follows.
*/
function RailButton({
  label,
  count,
  onClick,
  disabled,
  pressed,
  signedIn,
  children,
}: {
  label: string;
  count: number;
  onClick: () => void;
  disabled: boolean;
  pressed: boolean;
  signedIn: boolean;
  children: React.ReactNode;
}) {
  const shell =
    "inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-full px-1 text-white transition-colors duration-200 ease-out hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

  if (!signedIn) {
    return (
      <Link href="/get-started" className={shell}>
        {children}
        <span className="sr-only">{label}, sign in first</span>
        {count > 0 ? (
          <span className="text-[12px] font-medium tabular-nums drop-shadow">
            {formatCount(count)}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(shell, "cursor-pointer disabled:cursor-default disabled:opacity-70")}
    >
      {children}
      <span className="sr-only">{label}</span>
      {count > 0 ? (
        <span className="text-[12px] font-medium tabular-nums drop-shadow">
          {formatCount(count)}
        </span>
      ) : null}
    </button>
  );
}
