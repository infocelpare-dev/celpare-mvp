"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  Bookmark,
  Boxes,
  FileText,
  Heart,
  History,
  Image as ImageIcon,
  Library,
  Repeat2,
  Reply,
  Wrench,
  type LucideIcon,
} from "lucide-react";
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

  ICON ONLY, AND THE SELECTED ONE OPENS. Founder instruction 2026-09-18, from a
  screen recording. Every tab is a round icon; the one you are on widens into a
  pill and its name slides out. This REPLACES the note that used to sit here
  saying labels are never hidden. The founder overrode that, and the reason it
  is safe to override is the mechanism below rather than the decision itself.

  THE LABEL IS NEVER REMOVED FROM THE DOM. It is a grid column animated from
  `0fr` to `1fr` inside an `overflow-hidden` wrapper, so a collapsed label has
  zero width but is still real text in the accessibility tree. A screen reader
  reads all ten tabs by name whether or not they are visually open. `hidden`,
  `display:none` or swapping in an `aria-label` would each have cost that, and
  an icon with no accessible name is the single most common way a tab bar like
  this becomes unusable.

  Why the grid trick rather than animating width: `width: auto` is not an
  animatable value, so the usual workarounds are a hardcoded max-width per label
  (which clips "Collections") or measuring in JavaScript (which janks on the
  first paint). `grid-template-columns` interpolates between `0fr` and `1fr`
  natively and needs neither.

  Motion is neutralised globally under prefers-reduced-motion in globals.css, so
  there is nothing per component to add: the pill still opens, it just arrives
  immediately.

  IT WRAPS, IT DOES NOT SCROLL. Ten collapsed pills plus one open one is about
  424px, and the usable width at 390px is 358px. A sideways scroll with a hidden
  scrollbar is what the previous version did and it hid the last four sections
  behind a gesture with nothing to suggest it. Wrapping to a second row keeps
  every section visible, which is what the founder asked for in the first place.
*/

/*
  THE ICONS LIVE HERE, AND THE CALLER PASSES A NAME.

  This is a client component, and a React component is a function. A server
  component cannot hand a function across the boundary: doing it throws
  "Functions cannot be passed directly to Client Components", which is exactly
  what /profile did on the first run after the icons went in. Typechecking does
  not catch it, because the type is perfectly valid on both sides.
*/
const ICONS = {
  posts: FileText,
  replies: Reply,
  media: ImageIcon,
  reposts: Repeat2,
  liked: Heart,
  saved: Bookmark,
  tools: Wrench,
  models: Boxes,
  collections: Library,
  recent: History,
} satisfies Record<string, LucideIcon>;

export type TabIconName = keyof typeof ICONS;

export type TabItem = {
  key: string;
  label: string;
  href: string;
  /* Paired with the label at all times, so it is decorative and aria-hidden.
     Optional: a Tabs with no icons renders as plain text pills. */
  icon?: TabIconName;
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
      className={cn("flex flex-wrap gap-1.5 border-b border-border pb-3", className)}
    >
      {items.map((item) => {
        const selected = item.key === active;
        const Icon = item.icon ? ICONS[item.icon] : null;
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
              /* 44px tall and at least 44px wide when collapsed, which is the
                 touch target the ux guidance asks for. */
              "group inline-flex h-11 min-w-11 items-center justify-center gap-0 rounded-full border px-3",
              "transition-[background-color,border-color,color] duration-200 ease-out",
              selected
                ? "border-foreground bg-surface font-medium text-foreground"
                : "border-border text-muted hover:border-foreground hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="size-[18px] shrink-0" aria-hidden /> : null}

            {/*
              The animated part. `0fr` to `1fr` on a grid column, clipped by
              overflow-hidden. The text is always present; only its column has
              no width when the tab is closed.
            */}
            <span
              className={cn(
                "grid overflow-hidden transition-[grid-template-columns] duration-200 ease-out",
                selected ? "grid-cols-[1fr]" : "grid-cols-[0fr]",
              )}
            >
              <span className="min-w-0 overflow-hidden whitespace-nowrap ps-2 text-[14px]">
                {item.label}
                {item.count !== undefined && item.count > 0 ? (
                  <span className="ms-1.5 tabular-nums text-muted">
                    {formatCount(item.count)}
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
