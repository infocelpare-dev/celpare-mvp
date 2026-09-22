/*
  What a section looks like while it is loading.

  A STABLE SKELETON AT THE REAL HEIGHT, not a spinner. The ux guidance rates a
  loading state that does not preserve layout High severity, and a page of eight
  streaming sections is exactly where a collapsing placeholder turns reading into
  chasing: a section that arrives taller than its skeleton pushes everything
  below it down while somebody is halfway through a sentence.

  Nothing shimmers. D11 rules out gradients, and a sweep across eight shelves is
  the unnecessary motion the founder's brief asks to avoid. The blocks pulse
  their opacity, which globals.css neutralises under prefers-reduced-motion.

  ONE LIVE REGION FOR THE WHOLE PAGE, not one per section. Eight busy statuses
  announce eight times, which is worse than silence. The page mounts a single
  status line and these are aria-hidden.
*/

export function SectionSkeleton({ layout }: { layout: "shelf" | "grid" | "list" }) {
  return (
    <div
      aria-hidden
      className="scroll-mt-[84px] border-t border-border py-7 first:border-t-0 sm:py-8"
    >
      <div className="h-[22px] w-40 animate-pulse rounded bg-surface" />
      <div className="mt-2 h-[15px] w-64 max-w-full animate-pulse rounded bg-surface" />

      <div className="mt-4">
        {layout === "shelf" ? <ShelfSkeleton /> : null}
        {layout === "grid" ? <GridSkeleton /> : null}
        {layout === "list" ? <ListSkeleton /> : null}
      </div>
    </div>
  );
}

/* 264px wide and 196px tall, which is the height a tool card settles at with a
   logo, a name, a two line tagline and a footer. */
function ShelfSkeleton() {
  return (
    <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:-mx-5 sm:px-5">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-[196px] w-[264px] shrink-0 animate-pulse rounded-2xl border border-border bg-surface"
        />
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div
          key={i}
          className="h-[104px] animate-pulse rounded-2xl border border-border bg-surface"
        />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 border-b border-border p-4 last:border-b-0">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-surface" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-surface" />
            <div className="h-3.5 w-full max-w-[420px] animate-pulse rounded bg-surface" />
          </div>
        </div>
      ))}
    </div>
  );
}
