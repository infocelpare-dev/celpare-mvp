/*
  The shape of a comparison before it has loaded: the item strip, the summary
  cards and one table. Structured rather than a spinner, so nothing jumps when
  the real page arrives. Used by loading.tsx for the first paint.
*/
export function CompareSkeleton({ columns = 3 }: { columns?: number }) {
  return (
    <div aria-hidden>
      <div className="h-[34px] w-40 rounded bg-surface" />
      <div className="mt-2 h-[15px] w-full max-w-[420px] animate-pulse rounded bg-surface" />

      <div className="mt-6 flex gap-3 overflow-hidden sm:grid sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-[132px] w-[72%] shrink-0 animate-pulse rounded-2xl border border-border bg-surface sm:w-auto" />
        ))}
      </div>

      <div className="mt-10 h-6 w-32 rounded bg-surface" />
      <div className="mt-4 h-24 w-full animate-pulse rounded-2xl border border-border bg-surface" />

      <div className="mt-10 h-6 w-28 rounded bg-surface" />
      <div className="mt-4 space-y-px overflow-hidden rounded-2xl border border-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse bg-surface" />
        ))}
      </div>
    </div>
  );
}
