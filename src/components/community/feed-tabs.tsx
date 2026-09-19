"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedScope, Topic } from "@/lib/community/queries";

/*
  The feed tabs, and the topics that hang off For you.

  FOUNDER INSTRUCTION 2026-09-19, from a screen recording: the topics belong
  INSIDE the For you control and must not appear as a row outside it. In the
  recording the active tab carries a chevron, and pressing it opens a panel
  listing the topics; the feed itself has no chip row at all.

  That is a better shape than the chip row it replaces, and worth saying why.
  The row was eleven chips in a horizontally scrolling strip, which meant four
  were visible and seven were behind a gesture with nothing to suggest it. That
  is the same defect the profile tab bar was rebuilt to avoid in 4O.12. A panel
  shows all eleven at once and costs one tap.

  MESSAGES IS FIRST, where the founder's brief put it. It is not a FeedScope:
  the other two choose whose posts this column shows and never leave the page,
  so it carries `leaves` and is never marked current here.

  THE CHEVRON IS ITS OWN BUTTON, not part of the link. A button nested inside
  an anchor is invalid markup that navigates before it can be pressed, which is
  the exact trap 4O.13 hit with the delete control on a chat row. The label
  navigates, the chevron discloses, and they are siblings.
*/

const TABS: { key: string; label: string; href: string; leaves?: boolean }[] = [
  { key: "messages", label: "Messages", href: "/messages", leaves: true },
  { key: "for-you", label: "For you", href: "/community" },
  { key: "following", label: "Following", href: "/community?feed=following" },
];

export function FeedTabs({
  scope,
  topics,
  activeTopicSlug,
  unreadMessages = 0,
}: {
  scope: FeedScope;
  topics: Topic[];
  activeTopicSlug?: string;
  /* Threads with something unread in them. D28 defers notifications, so
     without this a message would arrive and nothing anywhere would say so. */
  unreadMessages?: number;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /*
    Escape closes it, and a press anywhere outside closes it. Both are bound
    only while it is open, so a closed panel costs no listeners.

    pointerdown rather than click: a click listener fires after the link's own
    navigation has begun, which leaves the panel briefly open over a page that
    is already changing.
  */
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  /* Focus moves into the panel when it opens, so a keyboard user is not left
     behind the control they just pressed. */
  useEffect(() => {
    if (open) panelRef.current?.querySelector("a")?.focus();
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <nav aria-label="Feed">
        <ul className="flex items-center justify-center gap-1">
          {TABS.map((tab) => {
            const selected = !tab.leaves && tab.key === scope;
            const showChevron = selected && tab.key === "for-you" && topics.length > 0;

            return (
              <li key={tab.key} className="flex items-center">
                <Link
                  href={tab.href}
                  aria-current={selected ? "page" : undefined}
                  /* Switching feeds should not throw the reader back to the
                     top of a page they are already at the top of. */
                  scroll={false}
                  onClick={() => setOpen(false)}
                  className={cn(
                    /* 44px tall, the touch target the ux guidance asks for,
                       with the label kept compact rather than padded into a
                       button. */
                    "relative inline-flex h-11 items-center rounded-lg px-3 text-[14px] transition-colors duration-200 ease-out",
                    selected
                      ? "font-medium text-foreground"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {tab.label}

                  {/*
                    The unread mark. A dot, not a number: the count of THREADS
                    is not the count of messages, and showing one as the other
                    is the sort of invented figure D13 rules out. Lime on the
                    surface, never lime text, which is 1.17:1 and barred by D2.
                    aria-label carries the meaning, since a coloured dot alone
                    says nothing to a screen reader.
                  */}
                  {tab.key === "messages" && unreadMessages > 0 ? (
                    <span
                      role="img"
                      aria-label={`${unreadMessages} unread`}
                      className="ms-1.5 inline-block size-2 rounded-full bg-accent align-middle"
                    />
                  ) : null}
                  {/*
                    The active indicator: a short rule under the label, not a
                    filled pill. It is never the ONLY signal, since the label
                    also goes to ink and medium weight. Colour alone would fail
                    the accessibility guidance, and lime text on paper is
                    1.17:1 and is barred outright by D2.
                  */}
                  {selected ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-foreground"
                    />
                  ) : null}
                </Link>

                {showChevron ? (
                  <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="-ms-2 inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:text-foreground"
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 transition-transform duration-200 ease-out",
                        open && "rotate-180",
                      )}
                      aria-hidden
                    />
                    <span className="sr-only">
                      {open ? "Hide topics" : "Show topics"}
                    </span>
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>

      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          /*
            Anchored under the tabs and centred on them, capped so it never
            runs past the feed column. Flat per D11: one hairline border, no
            shadow. It needs a solid background rather than a translucent one,
            because it sits over the posts.
          */
          className="absolute left-1/2 top-full z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-border bg-background p-2"
        >
          <p className="px-3 pb-1 pt-2 text-[12px] font-medium uppercase tracking-wide text-muted">
            Topics
          </p>

          <ul className="max-h-[60vh] overflow-y-auto">
            {topics.map((topic) => {
              const current = topic.slug === activeTopicSlug;
              return (
                <li key={topic.id}>
                  <Link
                    href={`/community/topic/${topic.slug}`}
                    aria-current={current ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex h-11 items-center rounded-lg px-3 text-[14px] transition-colors duration-200 ease-out",
                      current
                        ? "bg-surface font-medium text-foreground"
                        : "text-muted hover:bg-surface hover:text-foreground",
                    )}
                  >
                    {topic.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
