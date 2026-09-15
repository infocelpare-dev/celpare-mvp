"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminNavGroup } from "./nav";

/*
  The dashboard's chrome: the rail, the drawer, the bar, and the content column.

  All four live in one client component because the drawer button belongs in the
  bar and the drawer belongs beside the content, and the two share one piece of
  state. The first version had AdminNav render the button as a sibling of the
  content column, which put a 36px flex child between the rail and the page at
  every width below lg: it looked like it was in the bar and was actually
  stealing a column from the content. Measured at 390px the content column was
  354px rather than 390.

  The rail is pinned on a wide screen and becomes that drawer below 1024px.
  That is a deliberate departure from the product shell, which is a drawer at
  every width on founder instruction. That instruction was about Ask Celpare and
  the feed, reading and writing surfaces where the page wants the whole screen.
  An administrator does the opposite: they move between eighteen destinations
  constantly, and hiding the map behind a button costs a tap on every move.

  Everything the server decided arrives as props or as children, so this file
  holds the interaction and none of the data.
*/
export function AdminChrome({
  groups,
  roleLabel,
  brand,
  search,
  actions,
  children,
}: {
  groups: AdminNavGroup[];
  roleLabel: string;
  /* Server rendered slots. Passing them down rather than importing them keeps
     the logo, the search form and the account link out of the client bundle. */
  brand: React.ReactNode;
  search: React.ReactNode;
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const list = (
    <nav aria-label="Admin sections" className="flex-1 overflow-y-auto px-2 py-3">
      {groups.map((group) => (
        <div key={group.label} className="mb-4 last:mb-0">
          <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    /*
                      Closed from the click rather than from an effect watching
                      the pathname. An effect that calls setState on every route
                      change is a cascading render, and it would also miss
                      tapping the link for the page you are already on, where
                      the path never changes and the drawer would stay open.
                    */
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-3 py-1.5 text-[14px] transition-colors duration-200 ease-out",
                      active
                        ? "bg-surface font-medium text-foreground"
                        : "text-muted hover:bg-surface hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* The pinned rail. display:none below lg rather than unmounted, so the
          drawer below is the only copy at that width and a screen reader does
          not read eighteen links out twice. */}
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-border lg:flex">
        <div className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <span className="font-display text-[14px] font-semibold">Admin</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
            {roleLabel}
          </span>
        </div>
        {list}
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Close admin navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      ) : null}

      <aside
        id="admin-drawer"
        aria-label="Admin sections"
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-border bg-background transition-transform duration-200 ease-out lg:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <span className="font-display text-[14px] font-semibold">Admin</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close admin navigation"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {list}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open admin navigation"
            aria-expanded={open}
            aria-controls="admin-drawer"
            className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border transition-colors duration-200 ease-out hover:bg-surface lg:hidden"
          >
            <Menu className="size-4" aria-hidden />
          </button>

          {brand}
          {search}
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">{actions}</div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
