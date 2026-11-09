"use client";

import { useActionState, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { createComment, type CommentState } from "@/app/actions/community";
import { cn } from "@/lib/utils";
import { useMentionPicker } from "./mention-picker";

/*
  The one comment box, for a post, a reply and the video sheet (founder,
  2026-11-09: commenting "looks trash"). Before this there were three forms,
  each a bordered textarea with a separate button under it and a 0 of 1000
  counter, which read as a settings form rather than a conversation.

  What it is now: a rounded field that grows with the text, a round send button
  inside the row that is only live when there is something to send, Enter to
  send and Shift+Enter for a new line (a phone keyboard shows Send), a counter
  only near the limit, and the error under the field.

  CONTROLLED, ON PURPOSE. React 19 resets a form after its action; the earlier
  forms remounted on every attempt to get the text back after an error. Here
  the text lives in state: an error leaves it where it was, a success clears it.

  The server action and its checks are unchanged (app/actions/community.ts
  createComment): sign in, length, the honeypot, the parent guard in the
  database.
*/

const LIMIT = 1000;
const SHOW_COUNT_FROM = 800;
const MAX_HEIGHT_PX = 168;

export function CommentComposer({
  postId,
  parentId,
  tone = "light",
  placeholder = "Add a comment",
  label = "Add a comment",
  autoFocus = false,
  onPosted,
  onCancel,
  className,
}: {
  postId: string;
  /* Set for a reply; absent for a comment on the post itself. */
  parentId?: string;
  tone?: "light" | "dark";
  placeholder?: string;
  /* The accessible name. Visible text is the placeholder, so this says what
     the field is for in full, e.g. "Reply to Nadia". */
  label?: string;
  autoFocus?: boolean;
  onPosted?: () => void;
  onCancel?: () => void;
  className?: string;
}) {
  const [state, action, pending] = useActionState<CommentState, FormData>(createComment, {
    status: "idle",
    message: "",
    body: "",
    attempt: 0,
  });
  const [value, setValue] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const seen = useRef(0);
  const dark = tone === "dark";
  const id = `comment-${parentId ?? postId}`;
  /* Type @ to mention someone; the database notifies them when it is saved. */
  const mention = useMentionPicker({ setValue, fieldRef });

  /* A finished attempt: success clears and tells the parent, an error keeps
     the text and shows why. The adjustment happens in an effect because it
     answers the server, not a render. */
  useEffect(() => {
    if (state.attempt <= seen.current) return;
    seen.current = state.attempt;
    if (state.status === "idle") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the server's answer
      setValue("");
      onPosted?.();
    }
  }, [state, onPosted]);

  useEffect(() => {
    if (autoFocus) fieldRef.current?.focus();
  }, [autoFocus]);

  /* Grows with the text up to a cap, then scrolls inside itself. */
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  const empty = value.trim().length === 0;
  const over = value.length > LIMIT;
  const canSend = !empty && !over && !pending;

  return (
    <form ref={formRef} action={action} className={cn("w-full", className)}>
      <input type="hidden" name="postId" value={postId} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}

      {/* The honeypot, the same shape every other form here uses. */}
      <div aria-hidden className="hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div
        className={cn(
          "relative flex items-end gap-2 rounded-3xl border py-1.5 pe-1.5 ps-4 transition-colors duration-200 ease-out",
          /* The site's focus ring, drawn on the whole pill while the field has
             focus, rather than on the bare textarea inside it. */
          "has-[textarea:focus]:outline-2 has-[textarea:focus]:outline-offset-2 has-[textarea:focus]:outline-[var(--ring)] has-[textarea:focus]:outline-solid",
          dark
            ? "border-white/25 bg-white/10 focus-within:border-white/60"
            : "border-border bg-surface focus-within:border-foreground/40",
        )}
      >
        {mention.list(tone)}
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <textarea
          ref={fieldRef}
          id={id}
          name="body"
          rows={1}
          value={value}
          {...mention.fieldProps}
          onChange={(e) => {
            setValue(e.target.value);
            mention.sync();
          }}
          onKeyDown={(e) => {
            /* While the people list is open, its keys come first. */
            if (mention.onKeyDown(e)) return;
            /* Enter sends, Shift+Enter is a new line. Not while an IME is
               composing a word, or Enter would send half of it. */
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) formRef.current?.requestSubmit();
            }
            if (e.key === "Escape" && onCancel) onCancel();
          }}
          placeholder={placeholder}
          enterKeyHint="send"
          maxLength={LIMIT + 200}
          aria-invalid={state.status === "error" || over || undefined}
          aria-describedby={state.status === "error" ? `${id}-error` : undefined}
          /* 16px below sm, per D91: iOS zooms anything smaller and never zooms
             back out. */
          className={cn(
            "focus-ring-none max-h-[168px] min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-6 sm:text-[15px]",
            dark ? "text-white placeholder:text-white/55" : "text-foreground placeholder:text-muted",
          )}
        />
        <button
          type="submit"
          disabled={!canSend}
          className={cn(
            "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-out",
            "focus-visible:outline-2 focus-visible:outline-offset-2",
            "disabled:cursor-not-allowed",
            dark
              ? "bg-white text-black focus-visible:outline-white disabled:bg-white/25 disabled:text-white/60"
              : "bg-foreground text-background focus-visible:outline-foreground disabled:bg-border disabled:text-muted",
          )}
        >
          {pending ? (
            <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
          ) : (
            <ArrowUp className="size-4" aria-hidden />
          )}
          <span className="sr-only">{pending ? "Sending" : parentId ? "Send reply" : "Send comment"}</span>
        </button>
      </div>

      <div className="mt-1 flex min-h-0 items-start justify-between gap-3 px-4 empty:hidden">
        {state.status === "error" && state.message ? (
          <p id={`${id}-error`} role="alert" className={cn("text-[13px]", dark ? "text-white" : "text-foreground")}>
            {state.message}
          </p>
        ) : null}
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "ms-auto cursor-pointer text-[13px] transition-colors duration-200 ease-out",
              dark ? "text-white/70 hover:text-white" : "text-muted hover:text-foreground",
            )}
          >
            Cancel
          </button>
        ) : null}
        {value.length >= SHOW_COUNT_FROM ? (
          <span
            className={cn(
              "ms-auto text-[12px] tabular-nums",
              over ? (dark ? "text-white" : "text-foreground") : dark ? "text-white/60" : "text-muted",
            )}
            aria-live="polite"
          >
            {LIMIT - value.length}
          </span>
        ) : null}
      </div>
    </form>
  );
}
