import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { BackLink } from "@/components/ui/back-link";
import { Avatar } from "@/components/ui/avatar";
import { personName } from "@/lib/format";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getMessages, getThread } from "@/lib/messages/queries";
import { DmComposer } from "@/components/messages/dm-composer";
import { DmMessageRow } from "@/components/messages/dm-message-row";

export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/*
  One conversation.

  fullHeight on the shell, the same as Ask Celpare: the composer stays put and
  only the transcript scrolls. A message thread where the input drifts up the
  page as it fills is the thing that makes a chat feel broken on a phone.
*/
export default async function ThreadPage({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;

  if (!isSupabaseConfigured()) redirect("/community");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/get-started");

  /*
    THREE READS AT ONCE, not one after another (4AZ). They do not depend on each
    other: the policies decide what each returns, so reading the messages before
    knowing the thread is yours returns nothing when it is not, and the read
    marker only ever touches the caller's own participant row.

    Opening the thread is what marks it read, done here with the user already in
    hand rather than through markThreadRead, which would ask the auth server who
    this is a second time. Awaited, because the list this returns to is rendered
    from the same request and would otherwise still show the unread dot.
  */
  const [thread, messages] = await Promise.all([
    getThread(supabase, id, user.id),
    getMessages(supabase, id),
    supabase
      .from("dm_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", id)
      .eq("user_id", user.id)
      .then(({ error }) => {
        if (error) console.error("[dm] mark read failed", error.code, error.message);
      }),
  ]);

  /*
    Null covers "no such thread" and "not yours" with the same answer, so
    neither can be told from the other. dm_participants_select_own is what
    actually returns nothing; this only decides what to render.
  */
  if (!thread) notFound();

  /* The viewer's most recent message, which carries "Delivered". */
  const lastMineId =
    [...messages].reverse().find((m) => m.sender_id === user.id)?.id ?? null;

  /* The name, not the handle. Founder instruction 2026-09-19. */
  const who = thread.other ? personName(thread.other) : "Someone";

  return (
    <AppShell
      banner={<AccountNotices />}
      adminLink={<AdminLink />}
      signedIn
      fullHeight
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
          <BackLink href="/messages" label="Back to messages" className="mb-2" />

          <div className="flex items-center gap-3">
            <Avatar
              size="md"
              fullName={thread.other?.full_name}
              username={thread.other?.username}
              avatarUrl={thread.other?.avatar_url}
              className="shrink-0"
            />
            <div className="min-w-0">
              {thread.other ? (
                <Link
                  href={`/u/${thread.other.username}`}
                  className="hover:underline hover:underline-offset-4"
                >
                  <h1 className="truncate text-[16px] font-semibold">{who}</h1>
                </Link>
              ) : (
                <h1 className="truncate text-[16px] font-semibold">{who}</h1>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {messages.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-muted">
              No messages yet. Say something.
            </p>
          ) : (
            <ol className="mx-auto flex max-w-[640px] flex-col gap-2">
              {messages.map((message, i) => {
                const mine = message.sender_id === user.id;
                /* A run is consecutive messages from one person: the name goes
                   above its first bubble and the photo beside its last. */
                const prev = messages[i - 1];
                const next = messages[i + 1];
                const firstOfRun = !prev || prev.sender_id !== message.sender_id;
                const lastOfRun = !next || next.sender_id !== message.sender_id;
                return (
                  <DmMessageRow
                    key={message.id}
                    message={message}
                    mine={mine}
                    sender={mine ? null : thread.other}
                    showAvatar={!mine && lastOfRun}
                    showName={!mine && firstOfRun}
                    delivered={mine && message.id === lastMineId}
                  />
                );
              })}
            </ol>
          )}
        </div>

        <div className="mx-auto w-full max-w-[640px] shrink-0">
          <DmComposer threadId={id} />
        </div>
      </div>
    </AppShell>
  );
}
