"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createComment, type CommentState } from "@/app/actions/community";
import { loadCommentThread, type ThreadResult } from "@/app/actions/comments";
import { CommentThread } from "../comment-thread";

/*
  Comments, inside the video viewer.

  A SHEET OVER THE VIDEO, NOT A NAVIGATION. The comment icon used to be a link to
  the post's page, which meant leaving the video to read what people said about
  it and losing your place in the list to come back. Founder instruction
  2026-09-22: comments are readable from the icon AND outside on the post page.
  This is the first half; the post page is unchanged and still works.

  THE VIDEO KEEPS PLAYING BEHIND IT. Opening comments is not a reason to stop
  watching, and it is the behaviour every vertical feed has settled on. The sheet
  covers the bottom of the frame on a phone and sits beside the column on a
  desktop, so on both the video stays visible.

  IT LOADS ON OPEN, NOT WITH THE PAGE. Thirty videos would otherwise mean thirty
  threads fetched for the one somebody might read. The request is fired when the
  sheet opens and the result is kept, so reopening the same video's comments is
  instant and nothing is refetched until a reply changes it.

  NO DUPLICATE COMMENT SYSTEM. It renders CommentThread, the same component the
  post page renders, against the same createComment action and the same
  comments table. The only thing this file adds is the container and the loading.
*/

export function VideoComments({
  postId,
  open,
  onClose,
  onCountChange,
  onTrack,
}: {
  postId: string;
  open: boolean;
  onClose: () => void;
  /* So the rail's number follows a reply without this component owning it. */
  onCountChange?: (total: number) => void;
  onTrack?: () => void;
}) {
  /*
    The thread AND which post it belongs to, in one piece of state.

    Two separate states would need a synchronous setState in the effect to clear
    the old one, which is the cascading render react-hooks/set-state-in-effect
    exists to stop. Keeping the id beside the result means "still loading" is
    DERIVED from a mismatch rather than stored, so there is nothing to clear and
    a stale thread can never be shown under a different video.
  */
  const [loaded, setLoaded] = useState<{ postId: string; result: ThreadResult } | null>(
    null,
  );
  const thread = loaded?.postId === postId ? loaded.result : null;
  const loading = open && thread === null;
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    const result = await loadCommentThread(postId);
    setLoaded({ postId, result });
    onCountChange?.(result.total);
  }, [postId, onCountChange]);

  /* Load once per open, and only when opened. */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    /* Every setState below runs in an async callback, never in the effect body,
       so nothing cascades. */
    void (async () => {
      const result = await loadCommentThread(postId);
      if (cancelled) return;
      setLoaded({ postId, result });
      onCountChange?.(result.total);
    })();
    return () => {
      cancelled = true;
    };
    /* onCountChange is deliberately out: it is a fresh closure on every parent
       render and including it would refetch the thread continuously. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId]);

  /* Escape closes the sheet before the viewer sees the key, so one press does
     one thing. Capture phase, for the same reason the three dot menu uses it. */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("textarea, input")) return;
      e.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label="Comments"
      /*
        aria-modal FALSE on purpose. The video is still playing and still
        controllable behind this, so claiming the rest of the page is inert would
        be a lie to a screen reader. It is a sheet, not a modal.

        z-30, above the rail at z-20 and the caption at z-10.
      */
      className={cn(
        "absolute inset-x-0 bottom-0 z-30 flex max-h-[70dvh] flex-col",
        "rounded-t-2xl border-t border-white/15 bg-black/95 backdrop-blur-sm",
        "sm:inset-y-0 sm:start-auto sm:end-0 sm:max-h-none sm:w-[min(420px,100%)] sm:rounded-t-none sm:border-s sm:border-t-0",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/15 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-white">
          {thread ? `${thread.total} ${thread.total === 1 ? "comment" : "comments"}` : "Comments"}
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-white/80 transition-colors duration-200 ease-out hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="size-5" aria-hidden />
          <span className="sr-only">Close comments</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2">
        {loading ? (
          <p role="status" className="flex items-center gap-2 py-6 text-[14px] text-white/70">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading comments
          </p>
        ) : thread ? (
          <CommentThread
            nodes={thread.nodes}
            postId={postId}
            likedIds={thread.likedIds}
            signedIn={thread.signedIn}
            viewerId={thread.viewerId}
            tone="dark"
            onReplied={() => {
              onTrack?.();
              void refresh();
            }}
          />
        ) : null}
      </div>

      {/* The composer for a top level comment. Pinned to the bottom so it is
          reachable without scrolling past every reply, which is what somebody
          who opened this to say something actually wants. */}
      <div className="border-t border-white/15 px-4 py-3">
        {thread?.signedIn ? (
          <TopLevelComposer
            postId={postId}
            onPosted={() => {
              onTrack?.();
              void refresh();
            }}
          />
        ) : (
          <p className="text-[13px] text-white/70">
            <Link href="/get-started" className="underline underline-offset-4">
              Sign in
            </Link>{" "}
            to join the conversation.
          </p>
        )}
      </div>
    </div>
  );
}

function TopLevelComposer({
  postId,
  onPosted,
}: {
  postId: string;
  onPosted: () => void;
}) {
  const [state, action, pending] = useActionState<CommentState, FormData>(createComment, {
    status: "idle",
    message: "",
    body: "",
    attempt: 0,
  });
  const seen = useRef(0);

  useEffect(() => {
    if (state.attempt > seen.current) {
      seen.current = state.attempt;
      if (state.status === "idle") onPosted();
    }
  }, [state, onPosted]);

  return (
    <form action={action} key={state.attempt} className="flex items-end gap-2">
      <input type="hidden" name="postId" value={postId} />
      {/* No parentId: this is the top of the thread. */}

      <div aria-hidden className="hidden">
        <label htmlFor="video-comment-website">Website</label>
        <input id="video-comment-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="min-w-0 flex-1">
        <label htmlFor="video-comment-body" className="sr-only">
          Add a comment
        </label>
        <textarea
          id="video-comment-body"
          name="body"
          rows={1}
          required
          maxLength={1000}
          defaultValue={state.body}
          placeholder="Add a comment"
          /* 16px below sm, per D91. */
          className="w-full resize-none rounded-2xl border border-white/25 bg-white/10 px-3.5 py-2.5 text-[16px] text-white placeholder:text-white/50 sm:text-[14px]"
        />
        {state.status === "error" && state.message ? (
          <p role="alert" className="mt-1 text-[13px] text-white">
            {state.message}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 shrink-0 cursor-pointer items-center rounded-full bg-white px-4 text-[14px] font-medium text-black disabled:opacity-50"
      >
        {pending ? "Posting" : "Post"}
      </button>
    </form>
  );
}
