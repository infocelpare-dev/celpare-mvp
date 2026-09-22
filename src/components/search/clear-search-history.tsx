"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { clearRecentSearches, type SearchHistoryState } from "@/app/actions/search";

/*
  Clear all, in two steps.

  The same shape as ClearRecent in the profile, and for the same reason: this
  deletes rows and cannot be undone, so the first press arms it and the second
  does it. Deliberately not window.confirm, which blocks every later event in the
  tab and is the one browser dialog this codebase has a standing rule against.

  The outcome goes into a live region rather than the list quietly emptying, since
  the ux guidance rates a silent success a defect.
*/
export function ClearSearchHistory() {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState<SearchHistoryState, FormData>(
    clearRecentSearches,
    { status: "idle", message: "" },
  );

  if (!armed) {
    return (
      <div className="flex items-center gap-3">
        <span role="status" aria-atomic="true" className="text-[13px] text-muted">
          {state.message}
        </span>
        {/* Named as the delete it is, with the icon to match, founder
            instruction 2026-09-21. "Clear all" was accurate and quiet; this is a
            control somebody should be able to find without hunting. */}
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
        >
          <Trash2 className="size-4 shrink-0" aria-hidden />
          Delete all
        </button>
      </div>
    );
  }

  return (
    <form
      action={action}
      /* React resets a form once its action resolves, so disarming here keeps
         the control and the message in step. */
      onSubmit={() => setArmed(false)}
      className="flex items-center gap-2"
    >
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg px-1 text-[14px] font-medium text-foreground disabled:opacity-50"
      >
        {pending ? "Deleting" : "Yes, delete them"}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="min-h-11 rounded-lg px-1 text-[14px] text-muted transition-colors duration-200 ease-out hover:text-foreground"
      >
        Cancel
      </button>
    </form>
  );
}
