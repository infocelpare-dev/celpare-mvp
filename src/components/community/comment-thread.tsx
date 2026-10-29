"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, CornerDownRight, Ellipsis, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { personName, relativeTime } from "@/lib/format";
import { createComment, deleteComment, type CommentState } from "@/app/actions/community";
import { hideComment } from "@/app/actions/comments";
import type { Comment } from "@/lib/community/queries";
import type { CommentNode } from "@/lib/community/thread";
import { ReportForm } from "./post-controls";
import { CommentLike } from "./post-actions";
import { SignInButton } from "@/components/auth/sign-in-prompt";

/*
  A comment thread, to any depth.

  UNLIMITED REPLIES. Founder instruction 2026-09-22, replacing the one level rule
  10-community.md set for v1. The data has no depth limit and neither does this
  component: it renders whatever the tree gives it.

  THE INDENT IS CAPPED EVEN THOUGH THE DEPTH IS NOT, and the two are different
  things. At 390px, indenting every level by 28px leaves about nine characters per
  line by level ten, which is a thread nobody can read. So the indent stops at
  MAX_INDENT and deeper replies sit at that inset, with the parent named on the
  reply instead. The reply is still exactly where it belongs in the tree; only the
  drawing stops moving right.

  A BRANCH CAN BE COLLAPSED. Anything with descendants gets a control saying how
  many, because a thread with fifty replies under one comment otherwise buries
  every sibling beneath it. Collapsed is per branch and lives in this component:
  it is a view preference, not something worth a round trip or a column.

  IT IS A CLIENT COMPONENT SO BOTH SURFACES CAN USE IT. The post page renders it
  from server data and the video viewer's sheet renders it from an action, and
  neither has its own copy of what a comment looks like.
*/

/* A comment as ranked (guide 20). The extra fields are optional so a plain
   thread still renders: relation is the viewer's OWN relation to the author,
   shown only to them; position and reason feed impression events. */
export type ThreadComment = Comment & {
  relation?: "friend" | "following" | null;
  position?: number | null;
  reason?: string;
};

/* Past this, replies stop moving right. Chosen against 390px: 4 levels of 22px
   is 88px of gutter, which still leaves a readable measure. */
const MAX_INDENT = 4;

export function CommentThread({
  nodes,
  postId,
  likedIds,
  signedIn,
  viewerId,
  onReplied,
  tone = "light",
}: {
  nodes: CommentNode<ThreadComment>[];
  postId: string;
  likedIds: string[];
  signedIn: boolean;
  viewerId: string | null;
  /* Lets a surface that keeps its own count, like the video rail, follow along
     without this component knowing anything about it. */
  onReplied?: () => void;
  /* The video sheet sits on black. Same markup, different ink. */
  tone?: "light" | "dark";
}) {
  const liked = new Set(likedIds);

  if (nodes.length === 0) {
    return (
      <p className={cn("py-6 text-center text-[14px]", tone === "dark" ? "text-white/60" : "text-muted")}>
        No comments yet. Be the first.
      </p>
    );
  }

  return (
    <ol className="space-y-1">
      {nodes.map((node) => (
        <CommentRow
          key={node.id}
          node={node}
          postId={postId}
          liked={liked}
          signedIn={signedIn}
          viewerId={viewerId}
          onReplied={onReplied}
          tone={tone}
        />
      ))}
    </ol>
  );
}

function CommentRow({
  node,
  postId,
  liked,
  signedIn,
  viewerId,
  onReplied,
  tone,
}: {
  node: CommentNode<ThreadComment>;
  postId: string;
  liked: Set<string>;
  signedIn: boolean;
  viewerId: string | null;
  onReplied?: () => void;
  tone: "light" | "dark";
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  /* Deleting your own reply, founder instruction 2026-09-23. Asks once, in place,
     the pattern PostControls uses: ui-ux-pro-max rates delete without
     confirmation High, and a modal would cover the reply being reconsidered. */
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, startDelete] = useTransition();
  const router = useRouter();
  /* Hide, Not interested and Report live behind one More control, so a deep
     thread does not grow three more buttons on every row. */
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [hiddenNote, setHiddenNote] = useState("");
  const [hideError, setHideError] = useState("");
  const [hiding, startHide] = useTransition();

  function hide(kind: "hide" | "not_interested") {
    setHideError("");
    startHide(async () => {
      const result = await hideComment(node.id, kind);
      if (!result.ok) {
        setHideError(result.message);
        return;
      }
      setMenu(false);
      setHiddenNote(result.message);
    });
  }

  function confirmDelete() {
    setDeleteError("");
    startDelete(async () => {
      const result = await deleteComment(node.id, postId);
      if (!result.ok) {
        setDeleteError(result.message);
        setConfirming(false);
        return;
      }
      /* Gone here at once, then the page (or the video sheet, through
         onReplied) re-reads the thread, where replies under it are promoted
         rather than lost (thread.ts). */
      setDeleted(true);
      setConfirming(false);
      router.refresh();
      onReplied?.();
    });
  }

  const author = node.author;
  const handle = author?.username ?? null;
  const name = author ? personName(author) : "Someone";
  const isMine = Boolean(viewerId && viewerId === node.author_id);
  const dark = tone === "dark";

  /* Only the first few levels move right. Beyond that the depth is real and the
     drawing simply stops, which is what MAX_INDENT is for. */
  const indent = Math.min(node.depth, MAX_INDENT) * 22;

  return (
    <li style={{ marginInlineStart: indent }}>
      <div
        data-cid={node.id}
        data-depth={node.depth}
        data-pos={node.position ?? undefined}
        data-reason={node.reason ?? undefined}
        className={cn(
          "relative py-2.5",
          /* A hairline down the left of a reply, so a deep branch reads as one
             conversation rather than a stack of unrelated rows. Only on replies:
             a top level comment has nothing to hang from. */
          node.depth > 0 && "ps-3 border-s",
          node.depth > 0 && (dark ? "border-white/15" : "border-border"),
        )}
      >
        <div className="flex gap-2.5">
          <Link
            href={handle ? `/u/${handle}` : `/community/${postId}`}
            className="shrink-0"
          >
            <Avatar
              fullName={author?.full_name}
              username={author?.username}
              avatarUrl={author?.avatar_url}
              size="sm"
            />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
              {handle ? (
                <Link
                  href={`/u/${handle}`}
                  className={cn(
                    "font-medium hover:underline hover:underline-offset-4",
                    dark && "text-white",
                  )}
                >
                  {name}
                </Link>
              ) : (
                <span className={cn("font-medium", dark && "text-white")}>{name}</span>
              )}

              {isMine ? (
                <span className={cn("text-[11px]", dark ? "text-white/50" : "text-muted")}>
                  you
                </span>
              ) : node.relation ? (
                <span
                  className={cn(
                    "rounded-full border px-1.5 text-[11px] leading-[18px]",
                    dark ? "border-white/20 text-white/70" : "border-border text-muted",
                  )}
                >
                  {node.relation === "friend" ? "Friend" : "Following"}
                </span>
              ) : null}

              {/* suppressHydrationWarning because relativeTime reads the clock,
                  and the server and the browser can be a minute apart. The post
                  card learned this the hard way in 4O.10. */}
              <span
                suppressHydrationWarning
                className={cn("text-[12px]", dark ? "text-white/50" : "text-muted")}
              >
                <time dateTime={node.created_at}>{relativeTime(node.created_at)}</time>
              </span>
            </div>

            {deleted || hiddenNote ? (
              <p
                role="status"
                className={cn("mt-0.5 text-[14px] italic", dark ? "text-white/50" : "text-muted")}
              >
                {deleted ? "You deleted this reply." : hiddenNote}
              </p>
            ) : (
              <p
                className={cn(
                  "mt-0.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed",
                  dark && "text-white/90",
                )}
              >
                {node.body}
              </p>
            )}

            {deleted || hiddenNote ? null : (
            <div className="-ms-3 flex flex-wrap items-center gap-1">
              <CommentLike
                commentId={node.id}
                likeCount={node.like_count}
                liked={liked.has(node.id)}
                signedIn={signedIn}
              />

              <button
                type="button"
                onClick={() => setReplying((v) => !v)}
                aria-expanded={replying}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full px-2 text-[13px]",
                  "transition-colors duration-200 ease-out",
                  dark
                    ? "text-white/70 hover:bg-white/10 hover:text-white"
                    : "text-muted hover:bg-surface hover:text-foreground",
                )}
              >
                <CornerDownRight className="size-3.5" aria-hidden />
                Reply
                <span className="sr-only"> to {name}</span>
              </button>

              {node.descendantCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setCollapsed((v) => !v)}
                  aria-expanded={!collapsed}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full px-2 text-[13px]",
                    "transition-colors duration-200 ease-out",
                    dark
                      ? "text-white/70 hover:bg-white/10 hover:text-white"
                      : "text-muted hover:bg-surface hover:text-foreground",
                  )}
                >
                  {collapsed ? (
                    <ChevronRight className="size-3.5" aria-hidden />
                  ) : (
                    <ChevronDown className="size-3.5" aria-hidden />
                  )}
                  {collapsed
                    ? `Show ${node.descendantCount} ${node.descendantCount === 1 ? "reply" : "replies"}`
                    : "Hide replies"}
                </button>
              ) : null}

              {isMine ? (
                confirming ? (
                  <span className="inline-flex flex-wrap items-center gap-1">
                    <span className={cn("px-1 text-[13px]", dark ? "text-white/70" : "text-muted")}>
                      Delete this reply?
                    </span>
                    <button
                      type="button"
                      onClick={confirmDelete}
                      disabled={deleting}
                      className={cn(
                        "inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-[13px] font-medium",
                        "transition-colors duration-200 ease-out disabled:opacity-60",
                        dark ? "text-white hover:bg-white/10" : "text-foreground hover:bg-surface",
                      )}
                    >
                      {deleting ? "Deleting" : "Yes, delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={deleting}
                      className={cn(
                        "inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-[13px]",
                        "transition-colors duration-200 ease-out",
                        dark ? "text-white/70 hover:bg-white/10" : "text-muted hover:bg-surface",
                      )}
                    >
                      Keep it
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full px-2 text-[13px]",
                      "transition-colors duration-200 ease-out",
                      dark
                        ? "text-white/70 hover:bg-white/10 hover:text-white"
                        : "text-muted hover:bg-surface hover:text-foreground",
                    )}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Delete
                    <span className="sr-only"> your reply</span>
                  </button>
                )
              ) : null}

              {signedIn && !isMine ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenu((v) => !v);
                    setReporting(false);
                  }}
                  aria-expanded={menu}
                  className={cn(
                    "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full px-2 text-[13px]",
                    "transition-colors duration-200 ease-out",
                    dark
                      ? "text-white/70 hover:bg-white/10 hover:text-white"
                      : "text-muted hover:bg-surface hover:text-foreground",
                  )}
                >
                  <Ellipsis className="size-4" aria-hidden />
                  <span className="sr-only">More options for the comment by {name}</span>
                </button>
              ) : null}
            </div>
            )}

            {menu && !hiddenNote && !deleted ? (
              <div className="-ms-3 flex flex-wrap items-center gap-2">
                <MenuButton dark={dark} disabled={hiding} onClick={() => hide("hide")}>
                  Hide comment
                </MenuButton>
                <MenuButton dark={dark} disabled={hiding} onClick={() => hide("not_interested")}>
                  Not interested
                </MenuButton>
                <MenuButton dark={dark} expanded={reporting} onClick={() => setReporting((v) => !v)}>
                  Report
                </MenuButton>
              </div>
            ) : null}

            {hideError ? (
              <p role="alert" className={cn("mt-1 text-[13px]", dark ? "text-white" : "text-foreground")}>
                {hideError}
              </p>
            ) : null}

            {menu && reporting && !hiddenNote ? (
              <ReportForm
                entityType="comment"
                entityId={node.id}
                onDone={() => {
                  setReporting(false);
                  setMenu(false);
                }}
              />
            ) : null}

            {deleteError ? (
              <p role="alert" className={cn("mt-1 text-[13px]", dark ? "text-white" : "text-foreground")}>
                {deleteError}
              </p>
            ) : null}

            {replying ? (
              <ReplyForm
                postId={postId}
                parentId={node.id}
                replyingTo={name}
                tone={tone}
                signedIn={signedIn}
                onDone={() => {
                  setReplying(false);
                  onReplied?.();
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* The children. Rendered as their own list so the nesting is real in the
          markup too, which is what lets a screen reader report the level. */}
      {!collapsed && !hiddenNote && node.children.length > 0 ? (
        <ol className="space-y-1">
          {node.children.map((child) => (
            <CommentRow
              key={child.id}
              node={child}
              postId={postId}
              liked={liked}
              signedIn={signedIn}
              viewerId={viewerId}
              onReplied={onReplied}
              tone={tone}
            />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function MenuButton({
  children,
  onClick,
  dark,
  disabled,
  expanded,
}: {
  children: React.ReactNode;
  onClick: () => void;
  dark: boolean;
  disabled?: boolean;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expanded}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-[13px]",
        "transition-colors duration-200 ease-out disabled:opacity-60",
        dark ? "text-white/80 hover:bg-white/10" : "text-foreground hover:bg-surface",
      )}
    >
      {children}
    </button>
  );
}

/*
  The reply box under one comment.

  Its own useActionState per comment, so two open reply boxes cannot share a
  pending state or an error. Keyed on `attempt` for the reason the composer is:
  React 19 resets a form after its action resolves, and the remount is what makes
  a refused reply keep its text while a successful one clears.
*/
function ReplyForm({
  postId,
  parentId,
  replyingTo,
  tone,
  signedIn,
  onDone,
}: {
  postId: string;
  parentId: string;
  replyingTo: string;
  tone: "light" | "dark";
  signedIn: boolean;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<CommentState, FormData>(createComment, {
    status: "idle",
    message: "",
    body: "",
    attempt: 0,
  });
  const ref = useRef<HTMLTextAreaElement>(null);
  const seen = useRef(0);
  const dark = tone === "dark";

  useEffect(() => {
    ref.current?.focus();
  }, []);

  /* A successful reply comes back with an empty body and a bumped attempt. That
     is the only signal the action gives, so it is what closes the box. */
  useEffect(() => {
    if (state.attempt > seen.current) {
      seen.current = state.attempt;
      if (state.status === "idle") onDone();
    }
  }, [state, onDone]);

  if (!signedIn) {
    return (
      <p className={cn("mt-2 text-[13px]", dark ? "text-white/70" : "text-muted")}>
        <SignInButton className="underline underline-offset-4">
          Sign in
        </SignInButton>{" "}
        to reply.
      </p>
    );
  }

  return (
    <form action={action} key={state.attempt} className="mt-2">
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="parentId" value={parentId} />

      {/* The honeypot, the same shape every other form in this codebase uses. */}
      <div aria-hidden className="hidden">
        <label htmlFor={`reply-website-${parentId}`}>Website</label>
        <input id={`reply-website-${parentId}`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <label htmlFor={`reply-${parentId}`} className="sr-only">
        Reply to {replyingTo}
      </label>
      <textarea
        ref={ref}
        id={`reply-${parentId}`}
        name="body"
        rows={2}
        required
        maxLength={1000}
        defaultValue={state.body}
        placeholder={`Reply to ${replyingTo}`}
        /* 16px below sm, per D91: iOS zooms the page for anything smaller and
           never zooms back out. */
        className={cn(
          "w-full rounded-xl border px-3 py-2 text-[16px] sm:text-[14px]",
          dark
            ? "border-white/25 bg-white/10 text-white placeholder:text-white/50"
            : "border-border bg-background text-foreground placeholder:text-muted",
        )}
      />

      {state.status === "error" && state.message ? (
        <p role="alert" className={cn("mt-1 text-[13px]", dark ? "text-white" : "text-foreground")}>
          {state.message}
        </p>
      ) : null}

      <div className="mt-1.5 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className={cn(
            "inline-flex h-9 cursor-pointer items-center rounded-full px-4 text-[13px] font-medium disabled:opacity-50",
            dark ? "bg-white text-black" : "bg-foreground text-background",
          )}
        >
          {pending ? "Posting" : "Reply"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className={cn(
            "inline-flex h-9 cursor-pointer items-center rounded-full px-3 text-[13px]",
            dark ? "text-white/70 hover:text-white" : "text-muted hover:text-foreground",
          )}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
