import Link from "next/link";
import { PanelLeft, Search } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { SparkIcon } from "@/components/ui/spark-icon";

/*
  The app frame, for a loading.tsx fallback.

  WHY THIS HAD TO EXIST. AppShell is rendered by each PAGE, not by a layout, and
  a loading.tsx fallback replaces the page. So while a page was loading there was
  no shell at all: no bar, no logo, no drawer button, and critically none of the
  `h-[100dvh] overflow-hidden` frame that makes <main> the scroller. The document
  itself became scrollable instead, and scrolling down went past the skeleton
  into empty black space with no way to tell whether the app had crashed.

  The founder hit exactly that and sent a screenshot of a black page. It was
  invisible before because the fallback only shows for a moment; it became
  obvious once there was enough data for a page to take a second or two.

  THE RIGHT FIX IS A LAYOUT, AND THIS IS NOT IT. Chrome belongs in layout.tsx,
  above the Suspense boundary, where it would render once and never be replaced.
  Moving AppShell there means every page that currently passes its own
  `signedIn`, `banner` and `adminLink` has to stop, which is a refactor across
  the whole product and not something to do while the founder is using it. This
  makes the fallback match the frame instead, which fixes what people see, and
  the layout move is recorded as the real answer.

  IT RENDERS NOTHING THAT DEPENDS ON THE SESSION. A fallback is synchronous and
  cannot read the cookie, so guessing signed in would flash a Sign in button at
  somebody who is signed in, or hide it from somebody who is not. The logo,
  Search and Ask are the same for everybody, so they are real; the drawer button
  is a sized placeholder because it needs state it cannot have yet.
*/
export function AppShellSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[68px] shrink-0 items-center justify-between gap-2 border-b border-border px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            {/* The drawer button's exact footprint, so the real one does not
                shift the logo sideways when it arrives. */}
            <div className="flex size-9 items-center justify-center" aria-hidden>
              <PanelLeft className="size-[18px] text-muted" />
            </div>
            <Logo wordmarkClassName="hidden sm:inline" />
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Both are public and identical for every visitor, so they are the
                real links rather than grey boxes: the bar is usable while the
                page underneath is still coming. */}
            <Link
              href="/search"
              title="Search Celpare"
              className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            >
              <Search className="size-[18px]" aria-hidden />
              <span className="sr-only">Search Celpare</span>
            </Link>
            <Link
              href="/ask"
              title="Ask Celpare"
              className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            >
              <SparkIcon className="size-[18px]" />
              <span className="sr-only">Ask Celpare</span>
            </Link>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
