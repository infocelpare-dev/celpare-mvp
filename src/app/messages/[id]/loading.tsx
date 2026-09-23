import { AppShellSkeleton } from "@/components/app/app-shell-skeleton";

/*
  One conversation before it arrives (4AZ). The header with the other person,
  a few bubbles on both sides, and the composer where it will be, so the thread
  opens in place rather than after a blank wait.
*/
export default function Loading() {
  return (
    <AppShellSkeleton>
      <div className="flex min-h-0 flex-1 flex-col" aria-hidden>
        <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
          <div className="mb-2 h-5 w-36 rounded bg-surface" />
          <div className="flex items-center gap-3">
            <div className="size-10 animate-pulse rounded-full bg-surface" />
            <div className="h-4 w-32 animate-pulse rounded bg-surface" />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-2.5 px-4 py-4 sm:px-5">
          {[60, 44, 70, 38, 52].map((w, i) => (
            <div
              key={i}
              style={{ width: `${w}%` }}
              className={`h-10 animate-pulse rounded-2xl bg-surface ${i % 2 ? "self-end" : "self-start"}`}
            />
          ))}
        </div>
        <div className="shrink-0 border-t border-border px-4 py-3">
          <div className="mx-auto h-12 max-w-[640px] animate-pulse rounded-full bg-surface" />
        </div>
        <p role="status" className="sr-only">
          Loading conversation
        </p>
      </div>
    </AppShellSkeleton>
  );
}
