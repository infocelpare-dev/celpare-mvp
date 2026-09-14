"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, CreditCard, Newspaper, Scale, Settings, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { SparkIcon } from "@/components/ui/spark-icon";
import { cn } from "@/lib/utils";

/*
  The product sidebar: the six places a person can go inside Celpare.

  Every item leads somewhere real. Compare, Profile and Pricing are placeholder
  pages that say so plainly, which is deliberate: defect F4 in TRACKER.md was
  three footer links that all landed on one generic page, and a nav item that
  goes nowhere is the same mistake with more prominence. A blank page that names
  itself is honest; a dead link is not.

  Icons carry names beside them rather than standing alone. An icon only rail
  needs a tooltip to be usable, and a tooltip is not available to a thumb.

  It is a drawer at every width, not only on a phone: one button opens it and
  navigating closes it again, so the page keeps the whole screen the rest of the
  time.
*/

const LINKS: {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
}[] = [
  { href: "/community", label: "Feed", icon: Newspaper },
  /* Ask Celpare carries the Celpare spark, not a generic sparkle. It is the
     product's own mark and the one section that is Celpare rather than a
     category. */
  { href: "/ask", label: "Ask Celpare", icon: SparkIcon },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/compare", label: "Compare", icon: Scale },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
];

export function AppSidebar({
  open,
  onClose,
  secondary,
  signedIn,
}: {
  open: boolean;
  onClose: () => void;
  /* Settings only exists for an account, and the rail that used to carry it is
     now on Ask Celpare alone, so the drawer keeps it reachable everywhere. */
  signedIn: boolean;
  /* An optional second section under the nav, used by Ask Celpare for the list
     of saved chats. It lives here rather than in a column of its own, so a
     laptop does not lose 490px of width to two sidebars. */
  secondary?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Only mounted while open, so it cannot swallow taps when closed. */}
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40"
        />
      ) : null}

      <aside
        id="app-sidebar"
        aria-label="Celpare"
        className={cn(
          "z-40 flex w-[248px] shrink-0 flex-col border-r border-border bg-background",
          "fixed inset-y-0 left-0 transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        /* Hidden from assistive tech as well as from view when closed, so the
           six links are not read out from behind the page. */
        aria-hidden={!open}
      >
        <div className="flex h-[68px] shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <Logo />
          <Button
            variant="ghost"
            size="sm"
            className="w-9 px-0"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        <nav aria-label="Sections" className="shrink-0 p-2">
          <ul className="space-y-0.5">
            {LINKS.map((link) => {
              const active =
                pathname === link.href || pathname.startsWith(`${link.href}/`);
              const Icon = link.icon;

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors duration-200 ease-out",
                      active
                        ? "bg-surface font-medium text-foreground"
                        : "text-muted hover:bg-surface hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn("size-4 shrink-0", active && "text-accent")}
                    />
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {signedIn ? (
          <div className="shrink-0 border-t border-border p-2">
            <Link
              href="/settings"
              onClick={onClose}
              aria-current={pathname === "/settings" ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors duration-200 ease-out",
                pathname === "/settings"
                  ? "bg-surface font-medium text-foreground"
                  : "text-muted hover:bg-surface hover:text-foreground",
              )}
            >
              <Settings
                className={cn(
                  "size-4 shrink-0",
                  pathname === "/settings" && "text-accent",
                )}
                aria-hidden
              />
              Settings
            </Link>
          </div>
        ) : null}

        {secondary ? (
          /*
            Close the drawer when anything inside the secondary slot navigates.

            The nav links above each carry their own onClose, but `secondary` is
            an arbitrary node passed down from a server component, so a callback
            cannot be handed to it: functions do not serialise across that
            boundary. Catching the click as it bubbles is what does work, and it
            keeps the rule in one place rather than asking every future slot to
            remember it.

            Without this the drawer stayed open on top of the chat you just
            opened, which on a phone means tapping a chat appears to do nothing.
          */
          <div
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) onClose();
            }}
            className="flex min-h-0 flex-1 flex-col border-t border-border"
          >
            {secondary}
          </div>
        ) : null}
      </aside>
    </>
  );
}
