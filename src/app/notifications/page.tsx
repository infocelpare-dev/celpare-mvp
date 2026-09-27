import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { Container } from "@/components/ui/container";
import { Avatar } from "@/components/ui/avatar";
import { relativeTime } from "@/lib/format";
import { createClient, getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  describeNotification,
  notificationHref,
  type NotificationRow,
} from "@/lib/notifications/shared";
import { MarkAllRead, MarkShownRead } from "@/components/notifications/mark-read";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

/*
  Notifications (4BH, D147). Signed in only. my_notifications() returns only the
  caller's rows, with counts and actors recomputed from the source rows, post
  and comment text only where the reader may see it, and nothing about a post
  that has since gone. A failed read throws to error.tsx rather than showing an
  empty list, which would be a false claim that nothing happened (rule 13).
*/

const PAGE = 30;

type Search = { tab?: string; before?: string };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!isSupabaseConfigured()) redirect("/community");
  const user = await getCurrentUser();
  if (!user) redirect("/get-started");

  const sp = await searchParams;
  const tab = sp.tab === "mentions" ? "mentions" : "all";
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? sp.before : null;

  const db = await createClient();
  const { data, error } = await db.rpc("my_notifications", {
    p_before: before,
    p_limit: PAGE,
    p_kind: tab === "mentions" ? "mention" : null,
  });
  if (error) throw new Error(`Notifications could not be read: ${error.message}`);
  const rows = (data as NotificationRow[]) ?? [];
  const unreadIds = rows.filter((r) => !r.read_at).map((r) => r.id);
  const older = rows.length === PAGE ? rows[rows.length - 1].updated_at : null;

  const tabHref = (t: string) => (t === "all" ? "/notifications" : `/notifications?tab=${t}`);

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />} signedIn>
      <Container className="max-w-[640px] py-6 sm:py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[24px] font-medium tracking-tight">Notifications</h1>
          <MarkAllRead disabled={unreadIds.length === 0} />
        </div>

        <nav aria-label="Notification filters" className="mt-5 flex gap-2">
          {(["all", "mentions"] as const).map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              aria-current={tab === t ? "page" : undefined}
              className={
                tab === t
                  ? "inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background"
                  : "inline-flex h-9 items-center rounded-full border border-border px-4 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
              }
            >
              {t === "all" ? "All" : "Mentions"}
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <p className="mt-10 text-center text-[15px] text-muted">
            {before
              ? "Nothing older."
              : tab === "mentions"
                ? "Nobody has mentioned you yet."
                : "Nothing yet. Likes, comments, follows and news about your posts appear here."}
          </p>
        ) : (
          <ul className="mt-5 border-t border-border">
            {rows.map((n) => {
              const performance = n.kind === "post_milestone" || n.kind === "post_lifecycle";
              const excerpt = n.comment_excerpt && (n.kind === "comment" || n.kind === "reply") ? n.comment_excerpt : n.post_excerpt;
              return (
                <li key={n.id} className="border-b border-border">
                  <Link
                    href={notificationHref(n)}
                    className="flex gap-3 px-1 py-3.5 transition-colors duration-200 ease-out hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="shrink-0">
                      {performance ? (
                        <span className="inline-flex size-10 items-center justify-center rounded-full bg-surface text-foreground">
                          {n.kind === "post_lifecycle" ? (
                            <TrendingUp className="size-[18px]" aria-hidden />
                          ) : (
                            <Eye className="size-[18px]" aria-hidden />
                          )}
                        </span>
                      ) : (
                        <Avatar
                          fullName={n.actors[0]?.full_name}
                          username={n.actors[0]?.username}
                          avatarUrl={n.actors[0]?.avatar_url}
                          size="md"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] leading-snug">
                        {!n.read_at ? (
                          <>
                            <span aria-hidden className="me-2 inline-block size-2 rounded-full bg-accent align-middle" />
                            <span className="sr-only">Unread. </span>
                          </>
                        ) : null}
                        {describeNotification(n)}
                      </p>
                      {excerpt ? <p className="mt-0.5 line-clamp-2 text-[14px] text-muted">{excerpt}</p> : null}
                      <p className="mt-1 text-[12px] text-muted">{relativeTime(n.updated_at)}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {older ? (
          <div className="mt-6 flex justify-center">
            <Link
              href={`${tabHref(tab)}${tab === "all" ? "?" : "&"}before=${encodeURIComponent(older)}`}
              className="inline-flex h-10 items-center rounded-full border border-border px-4 text-[13px] font-medium transition-colors duration-200 ease-out hover:bg-surface"
            >
              Show older
            </Link>
          </div>
        ) : null}

        <MarkShownRead ids={unreadIds} />
      </Container>
    </AppShell>
  );
}
