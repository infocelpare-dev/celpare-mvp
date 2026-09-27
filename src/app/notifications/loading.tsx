import { AppShellSkeleton } from "@/components/app/app-shell-skeleton";

/* Shaped like the real page so nothing jumps when it arrives (4BH). */
export default function Loading() {
  return (
    <AppShellSkeleton>
      <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6 sm:py-10" aria-hidden>
        <div className="flex items-center justify-between gap-3">
          <div className="h-8 w-44 rounded bg-surface" />
          <div className="h-10 w-32 animate-pulse rounded-full bg-surface" />
        </div>
        <div className="mt-5 flex gap-2">
          <div className="h-9 w-14 rounded-full bg-surface" />
          <div className="h-9 w-24 rounded-full bg-surface" />
        </div>
        <ul className="mt-5 border-t border-border">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li key={i} className="flex gap-3 border-b border-border py-3.5">
              <div className="size-10 shrink-0 animate-pulse rounded-full bg-surface" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-3/4 animate-pulse rounded bg-surface" />
                <div className="mt-2 h-3.5 w-1/2 animate-pulse rounded bg-surface" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppShellSkeleton>
  );
}
