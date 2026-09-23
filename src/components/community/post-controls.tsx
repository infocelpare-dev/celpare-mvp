"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteComment,
  deletePost,
  reportItem,
  type ReportState,
} from "@/app/actions/community";

/*
  Delete and report, on the post's own page rather than on every card in the
  feed. The brief asks for no clutter and no icon soup, and neither of these is
  something anybody does while scrolling.

  NO BROWSER DIALOGS ANYWHERE IN HERE. No confirm(), no alert(). They block
  every subsequent event, which breaks automation outright, and a native dialog
  cannot be styled, cannot be dismissed with the rest of the page and reads
  badly on a phone.

  DELETE ASKS TWICE, IN PLACE. Two presses, not one, because deleting without
  confirmation is rated High by ui-ux-pro-max, and not a modal, because a modal
  would cover the thing being deleted at the moment somebody wants to look at
  it once more. This is the pattern 4O.13 settled for deleting a chat.
*/

const REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "abuse", label: "Abuse" },
  { value: "harassment", label: "Harassment" },
  { value: "offtopic", label: "Off topic" },
  { value: "illegal", label: "Illegal" },
  { value: "security", label: "Security" },
  { value: "other", label: "Something else" },
];

export function PostControls({
  entityType,
  entityId,
  postId,
  isOwner,
  signedIn,
}: {
  entityType: "post" | "comment";
  entityId: string;
  /* Where to revalidate a comment back to, and where to leave for after a post
     is deleted. */
  postId: string;
  isOwner: boolean;
  signedIn: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  /* Escape unwinds one layer at a time, innermost first, which is the rule the
     chat history panel already follows: a pending delete, then the report
     form. Nothing here closes the page. */
  useEffect(() => {
    if (!asking && !reporting) return;

    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (asking) setAsking(false);
      else setReporting(false);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking, reporting]);

  function confirmDelete() {
    setError("");
    startTransition(async () => {
      const result =
        entityType === "post"
          ? await deletePost(entityId)
          : await deleteComment(entityId, postId);

      if (!result.ok) {
        setError(result.message);
        setAsking(false);
        return;
      }

      if (entityType === "post") {
        /* The page being read no longer exists, so it cannot just refresh. */
        router.push("/community");
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {isOwner ? (
          asking ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-muted">
                Delete this {entityType}?
              </span>
              <Button size="sm" onClick={confirmDelete} disabled={pending}>
                {pending ? "Deleting" : "Yes, delete"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAsking(false)}
                disabled={pending}
              >
                Keep it
              </Button>
            </div>
          ) : (
            <SmallAction onClick={() => setAsking(true)}>
              <Trash2 className="size-4" aria-hidden />
              Delete
            </SmallAction>
          )
        ) : null}

        {/* You cannot report your own post, which is not a rule in the
            database, just a control that would never be used. */}
        {signedIn && !isOwner ? (
          <SmallAction
            onClick={() => setReporting((v) => !v)}
            expanded={reporting}
          >
            <Flag className="size-4" aria-hidden />
            Report
          </SmallAction>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-foreground">
          {error}
        </p>
      ) : null}

      {reporting ? (
        <ReportForm
          entityType={entityType}
          entityId={entityId}
          onDone={() => setReporting(false)}
        />
      ) : null}
    </div>
  );
}

function SmallAction({
  onClick,
  expanded,
  children,
}: {
  onClick: () => void;
  expanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      /* 44px tall so it is a real touch target, with the label always present
         beside the icon rather than the icon standing alone. */
      className="inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function ReportForm({
  entityType,
  entityId,
  onDone,
}: {
  entityType: "post" | "comment";
  entityId: string;
  onDone: () => void;
}) {
  /* Built here rather than imported: see the note in app/actions/community.ts
     about what a "use server" module is allowed to export. */
  const [state, action] = useActionState<ReportState, FormData>(reportItem, {
    status: "idle",
    message: "",
  });
  const firstField = useRef<HTMLSelectElement>(null);
  /* Unique per form: the feed can have several open at once, and fixed ids would
     point every label at the first form's fields. */
  const uid = useId();
  const reasonId = `${uid}-reason`;
  const noteId = `${uid}-note`;
  const hintId = `${uid}-hint`;

  /* Focus moves into the form when it opens, so a keyboard user is not left
     behind the control they just pressed. */
  useEffect(() => {
    firstField.current?.focus();
  }, []);

  if (state.status === "success") {
    return (
      <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
        <p role="status" className="text-[14px]">
          {state.message}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-2 cursor-pointer text-[13px] text-muted underline underline-offset-4 hover:text-foreground"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 rounded-xl border border-border p-4">
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />

      <label
        htmlFor={reasonId}
        className="mb-1.5 block text-[14px] font-medium"
      >
        Why are you reporting this?
      </label>
      <select
        ref={firstField}
        id={reasonId}
        name="reason"
        required
        defaultValue=""
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[16px] text-foreground sm:text-[15px]"
      >
        <option value="" disabled>
          Pick a reason
        </option>
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      <label htmlFor={noteId} className="mt-3 mb-1.5 block text-[14px] font-medium">
        Anything to add
      </label>
      <textarea
        id={noteId}
        name="note"
        rows={2}
        aria-describedby={hintId}
        className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-[16px] text-foreground sm:text-[15px]"
      />
      <p id={hintId} className="mt-1.5 text-[13px] text-muted">
        Optional, 500 characters at most. Only moderators see reports.
      </p>

      {state.status === "error" ? (
        <p role="alert" className="mt-2 text-[13px] text-foreground">
          {state.message}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm">
          Send report
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
