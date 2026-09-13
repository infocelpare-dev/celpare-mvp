"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  The narrow rail down the left of the page.

  It exists because making the sidebar a drawer (D61) left a wide empty margin
  on a laptop and put the three things you reach for while chatting behind a
  menu. Those three are here instead: your chats, your settings, your profile.
  Navigation between sections stays in the drawer, where it does not compete.

  Icon only, which is the one place that is defensible: three items, each with a
  permanent tooltip and an accessible name, sitting in a column too narrow for
  labels. Every other icon in the product carries its name beside it.

  Hidden below `lg`, where there is no empty margin to fill. The same three
  controls live in the top bar at those widths.
*/

type RailItem = {
  label: string;
  icon: typeof History;
  /* Either a destination or the chats panel, never both. */
  href?: string;
  opensChats?: boolean;
};

const ITEMS: RailItem[] = [
  { label: "Your chats", icon: History, opensChats: true },
  { label: "Settings", icon: Settings, href: "/settings" },
  { label: "Profile", icon: User, href: "/profile" },
];

export function AppRail({
  onOpenChats,
  showChats,
}: {
  onOpenChats: () => void;
  /* Anonymous visitors have no saved chats (D36), so the button would open a
     panel that is permanently empty. */
  showChats: boolean;
}) {
  const pathname = usePathname();

  const shell =
    "flex size-10 items-center justify-center rounded-xl transition-colors duration-200";

  return (
    <nav
      aria-label="Quick access"
      className="hidden w-[60px] shrink-0 flex-col items-center gap-1 border-r border-border py-3 lg:flex"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;

        if (item.opensChats) {
          if (!showChats) return null;
          return (
            <button
              key="chats"
              type="button"
              onClick={onOpenChats}
              aria-label={item.label}
              title={item.label}
              className={cn(shell, "cursor-pointer text-muted hover:bg-surface hover:text-foreground")}
            >
              <Icon className="size-[18px]" aria-hidden />
            </button>
          );
        }

        if (!item.href) return null;
        const active = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              shell,
              active
                ? "bg-surface text-foreground"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            <Icon className={cn("size-[18px]", active && "text-accent")} aria-hidden />
          </Link>
        );
      })}
    </nav>
  );
}
