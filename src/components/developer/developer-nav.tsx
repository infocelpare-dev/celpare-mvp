"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wrench, Boxes, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  Developer navigation, inside the ordinary Celpare frame rather than beside it.

  There is no separate developer profile here on founder instruction: turning
  Developer Mode on makes your Celpare account the developer account. One
  person, one profile, one identity. The developer_profiles row still exists
  behind the scenes, but only as the record that you agreed to the terms, which
  is what every write policy checks.
  The founder was explicit that this should feel like part of the product, not
  a second website, so it is a strip under the page heading and the main
  sidebar stays exactly where it was.

  Icon pills that open on the one you are on, the same shape as the profile
  tabs, founder instruction 2026-09-18. Read the long comment in ui/tabs.tsx
  before changing either: the label stays in the DOM and is collapsed to a zero
  width grid column, so a closed pill is still announced by name. An icon with
  no accessible name is how a nav like this stops being usable.

  It wraps rather than scrolling. This nav used to scroll sideways with the
  scrollbar hidden, and four items at 390px would have put Analytics off the
  edge with nothing to say so.
*/

/*
  Places, not actions.

  Submit tool and Submit model used to sit here, which put two verbs in a row
  of nouns and meant the nav grew every time something became submittable. They
  are buttons on the section they belong to instead: My Tools carries Submit a
  tool, My Models carries Submit a model. A person goes to the section, then
  acts inside it.
*/
const LINKS = [
  { href: "/developer", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/developer/tools", label: "My Tools", icon: Wrench },
  { href: "/developer/models", label: "My Models", icon: Boxes },
  { href: "/developer/analytics", label: "Analytics", icon: BarChart3 },
];

export function DeveloperNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Developer"
      className="flex flex-wrap gap-1.5 border-b border-border pb-3"
    >
      {LINKS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact
          ? pathname === href
          : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group inline-flex h-11 min-w-11 items-center justify-center gap-0 rounded-full border px-3",
              "transition-[background-color,border-color,color] duration-200 ease-out",
              active
                ? "border-foreground bg-surface font-medium text-foreground"
                : "border-border text-muted hover:border-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden />
            <span
              className={cn(
                "grid overflow-hidden transition-[grid-template-columns] duration-200 ease-out",
                active ? "grid-cols-[1fr]" : "grid-cols-[0fr]",
              )}
            >
              <span className="min-w-0 overflow-hidden whitespace-nowrap ps-2 text-[14px]">
                {label}
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
