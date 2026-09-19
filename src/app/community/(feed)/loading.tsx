/*
  THIS FILE LIVES IN A (feed) ROUTE GROUP, AND THAT IS NOT TIDINESS.

  A loading.tsx wraps its whole segment SUBTREE in a Suspense boundary. Sitting
  at src/app/community/ it also wrapped /community/new, /community/[id] and
  /community/topic/[slug], and once a fallback has streamed, the response head
  is already flushed: redirect() can no longer set a status, and notFound()
  cannot either. Both then degrade to a meta refresh or a 200.

  Measured, not guessed. With it one level up, /community/new answered 200 with
  `<meta http-equiv="refresh" content="1;url=/get-started">` to a signed out
  request while every other protected page in this app answered 307, and both a
  missing post and an unknown topic answered 200 instead of 404, which is a
  soft 404 that a crawler will happily index.

  The group scopes the boundary to /community alone. error.tsx stays one level
  up on purpose: an error boundary is not a Suspense boundary and does not
  flush anything early, so it still covers the whole subtree without this cost.

  ---

  The loading state for the feed.

  A STABLE SKELETON, not a spinner, per the ux guidance that a loading
  indicator should preserve layout and carry an accessible busy status. The
  rows are the same height and the same rhythm as a real post card, so the page
  does not jump when the posts arrive, which is the whole point of a skeleton
  over a centred spinner.

  Nothing here animates a shimmer. D11 rules out gradients, and a moving
  gradient sweeping across five rows is exactly the unnecessary animation the
  founder's brief asks to avoid. The rows simply pulse their opacity, and
  prefers-reduced-motion neutralises that globally in globals.css.
*/
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] gap-8 px-4 py-4 sm:px-5 xl:justify-center">
      {/* Matches the rails' widths so the middle column does not move sideways
          when the real page replaces this. */}
      <div className="hidden w-[200px] shrink-0 xl:block" aria-hidden />

      <div
        className="min-w-0 flex-1 xl:max-w-[640px]"
        role="status"
        aria-busy="true"
      >
        <span className="sr-only">Loading the feed</span>

        <div className="h-14" aria-hidden />

        <ul className="border-t border-border" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <li
              key={i}
              className="flex gap-3 border-b border-border px-4 py-4 sm:px-5 sm:py-5"
            >
              <div className="size-10 shrink-0 animate-pulse rounded-full bg-surface" />
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="h-3.5 w-40 animate-pulse rounded bg-surface" />
                <div className="h-3.5 w-full animate-pulse rounded bg-surface" />
                <div className="h-3.5 w-4/5 animate-pulse rounded bg-surface" />
                <div className="h-9 w-32 animate-pulse rounded-full bg-surface" />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="hidden w-[300px] shrink-0 xl:block" aria-hidden />
    </div>
  );
}
