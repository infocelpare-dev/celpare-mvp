import { AppShellSkeleton } from "@/components/app/app-shell-skeleton";

/*
  The inbox before the server answers (4AZ). Before this there was no loading
  state at all, so tapping Messages left the previous page frozen until every
  query had finished, which read as the app hanging.

  Shaped like the real page, back link, heading, New message and a few thread
  rows, so nothing jumps when it arrives.

  A loading.tsx streams, so a redirect() below becomes a client redirect and a
  notFound() in /messages/[id] a soft 404. Both are fine here: nothing under
  /messages is indexed, and a thread that is not yours still renders nothing.
*/
export default function Loading() {
  return (
    <AppShellSkeleton>
      <div className="mx-auto w-full max-w-[640px] px-4 py-6 sm:px-6 sm:py-10" aria-hidden>
        <div className="mb-5 h-5 w-32 rounded bg-surface" />
        <div className="flex items-center justify-between gap-3">
          <div className="h-8 w-40 rounded bg-surface" />
          <div className="h-10 w-36 animate-pulse rounded-full bg-surface" />
        </div>
        <ul className="mt-6 border-t border-border">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex items-center gap-3 border-b border-border py-3.5">
              <div className="size-11 shrink-0 animate-pulse rounded-full bg-surface" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-32 animate-pulse rounded bg-surface" />
                <div className="mt-2 h-3.5 w-2/3 animate-pulse rounded bg-surface" />
              </div>
            </li>
          ))}
        </ul>
        <p role="status" className="sr-only">
          Loading messages
        </p>
      </div>
    </AppShellSkeleton>
  );
}
