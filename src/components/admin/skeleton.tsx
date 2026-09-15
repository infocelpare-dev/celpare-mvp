/*
  The loading state for an admin page.

  It mirrors the shape of what is coming: a heading, a row of tiles, a table.
  A spinner would be less work and would tell the reader nothing; a skeleton
  that matches the layout means the page does not jump when the data lands.

  Deliberately no pulse animation on the bars themselves beyond one shared
  fade, and the whole thing is inert under prefers-reduced-motion because the
  global rule in globals.css caps every animation at 0.01ms.
*/
function Bar({ w = "100%", h = 12 }: { w?: string; h?: number }) {
  return (
    <span
      aria-hidden
      className="block animate-pulse rounded bg-surface"
      style={{ width: w, height: h }}
    />
  );
}

export function AdminSkeleton({
  tiles = 4,
  rows = 6,
  table = true,
  /* Off when this sits inside a Suspense boundary on a page whose real header
     has already rendered. A second heading bar under the real title reads as a
     layout bug rather than as loading. */
  header = true,
}: {
  tiles?: number;
  rows?: number;
  table?: boolean;
  header?: boolean;
}) {
  return (
    /* One live region for the whole page rather than a label per bar, so a
       screen reader hears "Loading" once instead of thirty times. */
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading</span>

      {header ? (
        <div className="border-b border-border pb-5">
          <Bar w="220px" h={24} />
          <div className="mt-3">
            <Bar w="min(420px, 80%)" />
          </div>
        </div>
      ) : null}

      {tiles > 0 ? (
        <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(156px,1fr))] gap-3">
          {Array.from({ length: tiles }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border p-4">
              <Bar w="60%" h={10} />
              <div className="mt-3">
                <Bar w="45%" h={22} />
              </div>
              <div className="mt-3">
                <Bar w="80%" h={10} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {table ? (
        <div className="mt-6 overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border bg-surface px-3 py-3">
            <Bar w="30%" h={10} />
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border px-3 py-3 last:border-b-0">
              <Bar w="28%" />
              <Bar w="18%" />
              <Bar w="14%" />
              <Bar w="20%" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
