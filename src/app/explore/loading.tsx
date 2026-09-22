import { AppShellSkeleton } from "@/components/app/app-shell-skeleton";

import { SectionSkeleton } from "@/components/explore/skeletons";

/*
  The loading state for Explore, before anything on the server has answered.

  It matches the real page part for part: the heading block, the search field at
  its real height, seven tab pills and four section skeletons. Nothing moves when
  the page arrives, which is the ux guidance on content jumping and the reason
  this is not a spinner.

  THE SECTIONS HAVE THEIR OWN SKELETONS TOO, and that is not a duplicate. This
  one covers the moment before the route has produced anything; those cover a
  section that is still streaming while the rest of the page is already readable.
  They are the same component, so the two states look like one.

  NO ROUTE GROUP IS NEEDED. A loading.tsx wraps its whole subtree in Suspense,
  and once a fallback streams the response head is flushed, so a redirect() or a
  notFound() in a sibling route degrades to a meta refresh and a soft 404. That
  is why /community keeps its (feed) group. /explore has no children, so there is
  nothing underneath this to damage.
*/
export default function Loading() {
  return (
    <AppShellSkeleton>
      <div className="mx-auto w-full max-w-[1140px] px-4 py-4 sm:px-5" aria-hidden>
        <div className="h-[34px] w-44 rounded bg-surface" />
        <div className="mt-2 h-[15px] w-full max-w-[420px] animate-pulse rounded bg-surface" />
        <div className="mt-4 h-12 w-full animate-pulse rounded-xl border border-border bg-surface" />

        <div className="mt-5 flex gap-1.5 overflow-hidden border-b border-border pb-3">
          {[56, 70, 78, 70, 76, 78, 76].map((w, i) => (
            <div
              key={i}
              style={{ width: w }}
              className="h-10 shrink-0 animate-pulse rounded-full bg-surface"
            />
          ))}
        </div>

        <SectionSkeleton layout="shelf" />
        <SectionSkeleton layout="shelf" />
        <SectionSkeleton layout="grid" />
        <SectionSkeleton layout="list" />

        {/* One live region for the whole skeleton. Six of them would announce six
            times. */}
        <p role="status" className="sr-only">
          Loading Explore
        </p>
      </div>
    </AppShellSkeleton>
  );
}
