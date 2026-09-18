"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clearRecentActivity, type RecentState } from "@/app/actions/recent";

/*
  Clear recent activity.

  Two steps, because this deletes rows and cannot be undone. The first press
  arms it, the second does it, Cancel disarms.

  Deliberately NOT window.confirm: a browser modal blocks every subsequent
  event on the page, and every other destructive control in this codebase asks
  inline. Armed state is local because it is a property of this one control in
  this one session, not something worth a round trip.

  The ux guidance rates a submit with no feedback as High severity, so the
  action reports what happened into a live region rather than the list quietly
  emptying underneath.
*/
export function ClearRecent() {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState<RecentState, FormData>(
    clearRecentActivity,
    { status: "idle", message: "" },
  );

  if (!armed) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" onClick={() => setArmed(true)}>
          <Trash2 className="size-4 shrink-0" aria-hidden />
          Clear recent activity
        </Button>
        {/* The outcome of the last clear survives disarming, so somebody who
            presses it and looks away still finds out it worked. */}
        <span role="status" aria-atomic="true" className="text-[13px] text-muted">
          {state.message}
        </span>
      </div>
    );
  }

  return (
    <form
      action={action}
      /* React resets a form once its action resolves. Disarming here rather
         than in the action keeps the button and the message in step. */
      onSubmit={() => setArmed(false)}
      className="flex flex-wrap items-center gap-3"
    >
      <p className="w-full text-[13px] leading-relaxed text-muted">
        This deletes your searches and the record of which tools you opened.
        It cannot be undone.
      </p>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Clearing" : "Yes, clear it"}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </form>
  );
}
