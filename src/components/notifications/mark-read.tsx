"use client";

import { useEffect, useState, useTransition } from "react";
import { markNotificationsRead } from "@/app/actions/notifications";
import { NOTIFICATIONS_READ_EVENT } from "./notification-bell";

/*
  Opening /notifications marks what it showed as read (4BH), AFTER the page has
  rendered, so the unread dots are still visible on this visit and gone on the
  next. The bell is told at once, so its badge clears without waiting a minute.
*/
export function MarkShownRead({ ids }: { ids: string[] }) {
  useEffect(() => {
    if (ids.length === 0) return;
    void markNotificationsRead(ids).then((r) => {
      if (r.ok) window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
    });
  }, [ids]);
  return null;
}

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex items-center gap-2">
      {failed ? (
        <span role="status" aria-atomic="true" className="text-[13px] text-muted">
          Could not mark them read.
        </span>
      ) : null}
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const r = await markNotificationsRead(null);
            setFailed(!r.ok);
            if (r.ok) window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT));
          })
        }
        className="inline-flex h-10 cursor-pointer items-center rounded-full border border-border px-4 text-[13px] font-medium transition-colors duration-200 ease-out hover:bg-surface disabled:cursor-default disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {pending ? "Marking" : "Mark all read"}
      </button>
    </div>
  );
}
