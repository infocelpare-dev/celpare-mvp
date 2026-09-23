"use client";

import { useState } from "react";
import Link from "next/link";
import { PanelLeft, Search } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { SparkIcon } from "@/components/ui/spark-icon";
import { Logo } from "@/components/ui/logo";
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
  secondary,
  fullHeight = false,
  /* A column rendered before the page, inside the content row. Ask Celpare
     uses it for the chat history rail and panel. Nothing else has one. */
  asideStart,
  /* The notice strip: suspension, and the platform announcement. Passed in
     rather than fetched here, because this is a client component and both
     sources are server reads. Every page inside the product supplies it from
     <AccountNotices />, so the one place a suspended person cannot miss it is
     every page they can reach. */
  banner,
  /* The admin entry, for staff. Forwarded straight to the sidebar. */
  adminLink,
  children,
}: {
  signedIn: boolean;
  secondary?: React.ReactNode;
  fullHeight?: boolean;
  asideStart?: React.ReactNode;
  banner?: React.ReactNode;
  adminLink?: React.ReactNode;
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
        adminLink={adminLink}
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
              <PanelLeft className="size-[18px]" aria-hidden />
            </Button>
            {/* The bar carries the logo at every width now, because the sidebar
                that used to carry it is closed by default. */}
            <Logo wordmarkClassName="hidden sm:inline" />
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {/*
              THE GLOBAL ACTIONS LIVE HERE NOW, founder instruction 2026-09-19.

              Search and Ask Celpare were in the feed's own sticky header, which
              made them look like feed controls. They are neither: search is
              across the whole of Celpare and Ask is its own surface. Moving
              them into the bar that every page carries says that, and it also
              means they are in the same place on the directory, a tool page
              and a profile rather than only above the feed.

              Both are public, so they show signed out as well. Chats stay in
              the sidebar behind the one menu button rather than being repeated
              here and in a rail, which is the reversal 4O.4 recorded.

              THE MAGNIFIER POINTS AT /search NOW, not /explore. It pointed at
              the browse page because there was no query surface to send it to.
              There is one, and the two are different things: /explore is for
              looking around, /search is for knowing what you want. A magnifier
              means the second.
            */}
            <BarIcon href="/search" label="Search Celpare">
              <Search className="size-[18px]" aria-hidden />
            </BarIcon>
            <BarIcon href="/ask" label="Ask Celpare">
              <SparkIcon className="size-[18px]" />
            </BarIcon>

            {/*
              NO THEME TOGGLE AND NO LOG OUT, both on founder instruction the
              same day. The theme is a preference, so it belongs with the other
              preferences in Settings, not one tap from every page. Log out is
              an account action and belongs on the profile.

              Sign in STAYS, because a signed out visitor has no profile to
              find it on and no settings page to reach.
            */}
            {signedIn ? null : (
              <ButtonLink href="/get-started" variant="outline" size="sm">
                Sign in
              </ButtonLink>
            )}
          </div>
        </header>

        {banner}

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

/*
  An icon in the top bar with a real accessible name and a real tooltip.

  The name is sr-only TEXT rather than an aria-label, so it is in the DOM,
  survives translation and reads the same to every assistive technology, and
  `title` gives a pointer user the same words. An icon with no accessible name
  is the most common way a bar like this becomes unusable.

  40px rather than the 44px used inside the feed: the bar is 68px tall and
  these sit beside a 36px button, so a taller target would not line up. It
  still clears the 24px WCAG target size for web.
*/
function BarIcon({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={label}
      className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
    >
      {children}
      <span className="sr-only">{label}</span>
    </Link>
  );
}
