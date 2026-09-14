"use client";

import Link from "next/link";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/format";

/*
  URL driven, not local state. A profile tab is a place: it should survive a
  reload, be linkable, and go back where it came from. That means real links
  with an href, so this is a tablist of anchors rather than buttons.

  Because they are links, the keyboard already works: Tab reaches each one and
  Enter follows it. What arrow key handling adds is the roving pattern people
  expect inside a tablist, so both are wired here.

  The panel is server rendered per tab, so there is no aria-controls: the
  content is a separate document each time rather than a hidden sibling.
*/

export type TabItem = {
  key: string;
  label: string;
  href: string;
  /* Omitted rather than zero. A count of nothing is not worth the ink, and
     10-community.md says counts are hidden at zero. */
  count?: number;
};

export function Tabs({
  items,
  active,
  label,
  className,
}: {
  items: TabItem[];
  active: string;
  label: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;

    const tabs = Array.from(
      listRef.current?.querySelectorAll<HTMLAnchorElement>('[role="tab"]') ?? [],
    );
    const current = tabs.findIndex((t) => t === document.activeElement);
    if (current === -1) return;

    e.preventDefault();
    let next = current;
    if (e.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    if (e.key === "ArrowRight") next = (current + 1) % tabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    tabs[next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      /*
        Scrolls sideways rather than wrapping to a second row. Seven tabs do
        not fit at 390px, and a tab strip that reflows moves the thing you were
        about to tap. The overflow container is scoped here so the page body
        itself never scrolls horizontally.
      */
      className={cn(
        "-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            role="tab"
            aria-selected={selected}
            /* Roving tabindex: only the selected tab is in the tab order. */
            tabIndex={selected ? 0 : -1}
            scroll={false}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-[15px] transition-colors duration-200 ease-out",
              selected
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 ? (
              <span className="ml-1.5 text-[13px] tabular-nums text-muted">
                {formatCount(item.count)}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

