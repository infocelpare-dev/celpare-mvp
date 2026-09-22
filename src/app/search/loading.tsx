import { AppShellSkeleton } from "@/components/app/app-shell-skeleton";

/*
  The loading state for search.

  A STABLE SKELETON AT THE REAL ROW HEIGHT, not a spinner, per the ux guidance
  that a loading state should preserve layout and carry an accessible busy status.
  The rows match the result rows, so nothing jumps when the results arrive.

  Nothing shimmers. D11 rules out gradients, and a gradient sweeping across six
  rows is the unnecessary animation the founder's brief asks to avoid. The rows
  pulse their opacity, which prefers-reduced-motion neutralises globally.

  NO ROUTE GROUP NEEDED HERE. The (feed) group exists under /community because a
  loading.tsx wraps its whole subtree in Suspense, and once a fallback streams the
  response head is flushed, so redirect() and notFound() in sibling routes degrade
  to a meta refresh and a soft 404. /search has no children, so there is nothing
  underneath this to damage.
*/
export default function Loading() {
  return (
    <AppShellSkeleton>
      <div className="mx-auto w-full max-w-[760px] px-4 py-4 sm:px-5">
        <div className="h-5 w-32 rounded bg-surface" aria-hidden />

        {/* The field itself is the same height as the real one, so the page does
            not move when it is replaced. */}
        <div className="mt-3 h-12 w-full animate-pulse rounded-xl border border-border bg-surface" aria-hidden />

        <div className="mt-5 flex gap-1 border-b border-border pb-3" aria-hidden>
          {[64, 76, 84, 80].map((w) => (
            <div
              key={w}
              style={{ width: w }}
              className="h-10 animate-pulse rounded-full bg-surface"
            />
          ))}
        </div>

        <ol className="mt-1" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li
              key={i}
              className="flex gap-3.5 border-b border-border px-1 py-4 sm:gap-4"
            >
              <div className="size-12 shrink-0 animate-pulse rounded-full bg-surface sm:size-14" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-40 animate-pulse rounded bg-surface" />
                <div className="h-3.5 w-full max-w-[420px] animate-pulse rounded bg-surface" />
                <div className="h-3 w-48 animate-pulse rounded bg-surface" />
              </div>
            </li>
          ))}
        </ol>

        {/* One live region for the whole skeleton. Six of them would announce six
            times. */}
        <p role="status" className="sr-only">
          Searching Celpare
        </p>
      </div>
    </AppShellSkeleton>
  );
}
