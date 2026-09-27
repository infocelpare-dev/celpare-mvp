"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

/*
  The bell in the top bar, signed in only (4BH).

  The count is read from /api/notifications/unread when the bar mounts, when
  the window regains focus, when the route changes, and once a minute while the
  tab is visible. No socket: at Celpare's size a minute is fresh enough, and a
  hidden tab asks for nothing. The /notifications page announces when it marks
  rows read, so the badge clears without waiting for the next minute.

  A failed read shows no badge rather than a zero or a stale number: the count
  is either one the database just gave, or absent.

  The badge is lime with ink text (D2: white on lime fails at 1.17:1). The
  accessible name carries the count as words, once, on the link itself, rather
  than a bare number in a live region (ui-ux-pro-max: contextual badge updates).
*/

export const NOTIFICATIONS_READ_EVENT = "celpare:notifications-read";

/* The count, or null when it could not be read. A hidden tab asks for nothing
   and keeps what it had (undefined). */
async function readUnread(): Promise<number | null | undefined> {
  if (document.visibilityState === "hidden") return undefined;
  try {
    const res = await fetch("/api/notifications/unread", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { count: number | null };
    return typeof body.count === "number" ? body.count : null;
  } catch {
    return null;
  }
}

export function NotificationBell() {
  const [count, setCount] = useState<number | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    let live = true;
    void readUnread().then((c) => {
      if (live && c !== undefined) setCount(c);
    });
    return () => {
      live = false;
    };
  }, [pathname]);

  useEffect(() => {
    const refresh = () =>
      void readUnread().then((c) => {
        if (c !== undefined) setCount(c);
      });
    const onFocus = () => refresh();
    const onRead = () => setCount(0);
    const timer = window.setInterval(() => void refresh(), 60_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, onRead);
    };
  }, []);

  const unread = count !== null && count > 0 ? count : 0;
  const label = unread > 0 ? `Notifications, ${unread >= 100 ? "100 or more" : unread} unread` : "Notifications";

  return (
    <Link
      href="/notifications"
      title={label}
      className="relative inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Bell className="size-[18px]" aria-hidden />
      <span className="sr-only">{label}</span>
      {unread > 0 ? (
        <span
          aria-hidden
          className="tnum absolute end-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center whitespace-nowrap rounded-full bg-accent px-1 text-[11px] font-semibold leading-none text-on-accent"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
