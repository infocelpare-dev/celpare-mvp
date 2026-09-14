"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AppSidebar } from "./app-sidebar";

/*
  The frame every page inside Celpare sits in: a thin bar across the top, the
  page below it, and the sidebar hidden behind one button until it is wanted.

  The sidebar is a drawer at every width, on founder instruction: one icon, and
  the sections appear when you tap it. That is a real trade and worth naming.
  A pinned sidebar keeps the destinations in view; a drawer gives the page the
  whole screen, which on a reading and writing surface like Ask Celpare is the
  thing being optimised for. The cost is one tap to change section, and the
  mitigation is that the drawer closes itself on navigation so it never sits in
  the way.

  `fullHeight` is for Ask Celpare, where the composer must stay put and only the
  transcript scrolls. Everything else scrolls normally inside the main column,
  which keeps the bar in place while reading.
*/
export function AppShell({
  signedIn,
  signOutAction,
  secondary,
  fullHeight = false,
  /* A column rendered before the page, inside the content row. Ask Celpare
     uses it for the chat history rail and panel. Nothing else has one. */
  asideStart,
  children,
}: {
  signedIn: boolean;
  signOutAction?: React.ReactNode;
  secondary?: React.ReactNode;
  fullHeight?: boolean;
  asideStart?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    /* dvh rather than vh: on a phone the browser chrome collapses, and vh
       leaves the bottom of the page under the address bar. */
    <div className="flex h-[100dvh] overflow-hidden">
      <AppSidebar
        open={open}
        onClose={() => setOpen(false)}
        secondary={secondary}
        signedIn={signedIn}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center justify-between gap-2 border-b border-border px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-9 px-0"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
              aria-expanded={open}
              aria-controls="app-sidebar"
            >
              <Menu className="size-4" aria-hidden />
            </Button>
            {/* The bar carries the logo at every width now, because the sidebar
                that used to carry it is closed by default. */}
            <Logo wordmarkClassName="hidden sm:inline" />
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            {/* Chats live in the sidebar, reachable from the one menu button,
                rather than being repeated here and in a rail. */}
            <ThemeToggle />
            {signedIn ? (
              signOutAction
            ) : (
              <ButtonLink href="/get-started" variant="outline" size="sm">
                Sign in
              </ButtonLink>
            )}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {asideStart}

          <main
            className={
              fullHeight
                ? "flex min-h-0 min-w-0 flex-1 flex-col"
                : "min-h-0 min-w-0 flex-1 overflow-y-auto"
            }
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
