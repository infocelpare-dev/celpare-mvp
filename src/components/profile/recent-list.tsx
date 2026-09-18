import Link from "next/link";
import { Search, Wrench } from "lucide-react";
import type { RecentRow } from "@/lib/profile/queries";

/*
  The searches you ran and the tools you opened, as a list.

  Shared by the Recent tab on /profile and the compact card on the developer
  dashboard, because the founder asked for it in both places and two copies of
  a list are two things to keep in step.

  It is a server component: there is nothing interactive in a row, and the
  Clear control is its own client island beside it.

  PRIVACY. Every caller of this is already owner only. my_recent_activity
  answers for auth.uid() rather than for a profile id, so this cannot be handed
  somebody else's rows even by mistake, and there is no setting anywhere that
  publishes them. Founder decision 2026-09-18.
*/

function relative(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  /* Pinned to UTC. Without a timeZone this formats in the runtime's own zone,
     and the server and the browser are not always in the same one, which is a
     real hydration error and not a theoretical one. It happened on
     /admin/security. */
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function RecentList({ rows }: { rows: RecentRow[] }) {
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border">
      {rows.map((r) => (
        <li key={`${r.kind}-${r.href}`}>
          <Link
            href={r.href}
            className="flex items-center gap-3 px-4 py-3 transition-colors duration-200 ease-out hover:bg-surface"
          >
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted"
            >
              {r.kind === "search" ? (
                <Search className="size-4" />
              ) : (
                <Wrench className="size-4" />
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px]">
                {/* Said in full, because "video editing" on its own does not
                    tell you whether you searched for it or opened it. */}
                <span className="text-muted">
                  {r.kind === "search" ? "Searched for " : "Opened "}
                </span>
                <span className="font-medium">{r.label}</span>
              </span>
              {r.detail ? (
                <span className="mt-0.5 block truncate text-[13px] text-muted">
                  {r.detail}
                </span>
              ) : null}
            </span>

            <span className="shrink-0 text-[13px] text-muted">
              {relative(r.occurred_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
