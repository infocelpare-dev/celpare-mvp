import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Logo } from "@/components/ui/logo";
import { ROLE_LABEL, type Role } from "@/lib/admin/capabilities";
import { visibleNav } from "./nav";
import { AdminChrome } from "./admin-nav";
import type { AdminSession } from "@/lib/admin/guard";

/*
  The frame every admin page sits in.

  Denser than the product shell: a 52px bar instead of 68, a pinned rail instead
  of a drawer, and the content column left wide rather than capped at a reading
  measure. An administrator is comparing columns of numbers, not reading prose,
  and the two want opposite layouts.

  The layout itself lives in AdminChrome, which is a client component because the
  drawer needs state. Everything here is server rendered and handed down as
  slots, so the logo, the search form and the account link never reach the
  browser bundle.

  The nav is filtered by capability before it is handed over, so a role's own
  sidebar arrives without the twelve items it cannot reach. That is presentation
  only: each page calls requireAdmin() with the same capability and each RPC
  checks it again in SQL.
*/
export function AdminShell({
  session,
  children,
}: {
  session: AdminSession;
  children: React.ReactNode;
}) {
  return (
    <AdminChrome
      groups={visibleNav(session.capabilities)}
      roleLabel={ROLE_LABEL[session.role as Role]}
      brand={
        /* On a wide screen the rail carries the section name, so the bar only
           needs the product mark below that width. */
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          <Logo wordmarkClassName="hidden sm:inline" />
        </div>
      }
      search={
        /*
          Global admin search, as a GET form.

          Every result it can return is gated by capability inside
          admin_global_search, branch by branch, so this cannot reach around a
          section the role is refused. It is a shortcut through the same doors,
          never a second set of keys.
        */
        <form
          action="/admin/find"
          method="get"
          role="search"
          className="flex min-w-0 max-w-[420px] flex-1 items-center gap-2 rounded-lg border border-border px-2.5"
        >
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <input
            type="search"
            name="q"
            placeholder="Find a user, tool, report, audit event"
            aria-label="Search the admin dashboard"
            className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted focus:outline-none"
          />
        </form>
      }
      actions={
        <>
          <Link
            href="/community"
            className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground sm:inline-flex"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Celpare
          </Link>
          <ThemeToggle />
          <Link
            href={session.username ? `/u/${session.username}` : "/profile"}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-[11px] font-medium text-muted transition-colors duration-200 ease-out hover:text-foreground"
            title={`${session.username ?? session.email}, ${ROLE_LABEL[session.role as Role]}`}
          >
            {(session.username ?? session.email).slice(0, 2).toUpperCase()}
          </Link>
        </>
      }
    >
      {children}
    </AdminChrome>
  );
}
