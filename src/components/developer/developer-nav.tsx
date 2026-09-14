"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wrench, Boxes, Plus } from "lucide-react";
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

  Scrolls sideways at narrow widths for the same reason the profile tabs do:
  six items do not fit at 390px, and a nav that reflows moves the thing you
  were about to tap.
*/

const LINKS = [
  { href: "/developer", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/developer/tools", label: "My Tools", icon: Wrench },
  { href: "/developer/models", label: "My Models", icon: Boxes },
  { href: "/developer/submit", label: "Submit tool", icon: Plus },
  { href: "/developer/models/new", label: "Submit model", icon: Plus },
];

export function DeveloperNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Developer"
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              "-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-[15px] transition-colors duration-200 ease-out",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
