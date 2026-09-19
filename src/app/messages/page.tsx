import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Link2, Mic, MessagesSquare, Video } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { Avatar } from "@/components/ui/avatar";
import { personName, relativeTime } from "@/lib/format";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { listPeople, listThreads } from "@/lib/messages/queries";
import { NewThread } from "@/components/messages/new-thread";

export const metadata: Metadata = {
  title: "Messages",
  description: "Your direct messages on Celpare.",
  /* Private by definition. Never indexed. */
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/*
  The thread list.

  Signed in only, and that is enforced twice: the redirect below decides what
  to RENDER, and anon holds no grant at all on any dm_ table, so a request that
  got past this would return nothing rather than somebody's conversations.
*/
export default async function MessagesPage() {
  if (!isSupabaseConfigured()) redirect("/community");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/get-started");

  const [threads, people] = await Promise.all([
    listThreads(supabase, user.id),
    listPeople(supabase, user.id),
  ]);

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />} signedIn>
      <Container className="max-w-[640px] py-6 sm:py-10">
        {/*
          THE WAY BACK. Founder report 2026-09-19: "i cant back to for you if i
          enter messages", and they were right. Messages is reached from a tab
          in the feed's own header, so it LOOKS like a third feed, but it is a
          separate page whose header has no tabs on it. Once here the only
          route back was the drawer behind the menu button, which is two taps
          and a guess.

          An explicit destination, not history.back(): the same reasoning as
          every other BackLink in this app. You can arrive here from a
          notification-less unread dot, from a profile, or by typing the URL,
          and "back" is only the feed in one of those cases.
        */}
        <BackLink href="/community" label="Back to the feed" className="mb-5" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[24px] font-semibold leading-tight sm:text-[28px]">
            Messages
          </h1>
          <NewThread people={people} />
        </div>

        {threads.length === 0 ? (
          /* The empty state gets real design, the same as the feed's: at
             launch it is the state everybody sees. It does not invent a
             conversation to fill the space (D30). */
          <div className="mt-10 px-4 py-14 text-center sm:py-20">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-border">
              <MessagesSquare className="size-6 text-muted" aria-hidden />
            </div>
            <h2 className="mt-5 font-display text-[19px] font-semibold">
              No conversations yet
            </h2>
            <p className="mx-auto mt-2.5 max-w-[46ch] text-[15px] leading-relaxed text-muted">
              Messages are private between you and one other person. You can
              send text, a link, a voice message or a video.
            </p>
          </div>
        ) : (
          <ul className="mt-6 border-t border-border">
            {threads.map((thread) => {
              /* The name. The @username belongs on the profile and nowhere
                  else, founder instruction 2026-09-19. */
              const who = thread.other ? personName(thread.other) : "Someone";

              return (
                <li key={thread.id}>
                  <Link
                    href={`/messages/${thread.id}`}
                    className="flex items-center gap-3 border-b border-border px-1 py-3.5 transition-colors duration-200 ease-out hover:bg-surface"
                  >
                    <Avatar
                      size="md"
                      fullName={thread.other?.full_name}
                      username={thread.other?.username}
                      avatarUrl={thread.other?.avatar_url}
                      className="shrink-0"
                    />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={
                            thread.unread
                              ? "truncate text-[15px] font-semibold"
                              : "truncate text-[15px] font-medium"
                          }
                        >
                          {who}
                        </span>
                        <span
                          className="shrink-0 text-[13px] text-muted"
                          suppressHydrationWarning
                        >
                          {relativeTime(thread.last_message_at)}
                        </span>
                      </span>

                      <span className="mt-0.5 flex items-center gap-1.5 text-[14px] text-muted">
                        <Preview
                          kind={thread.lastMessage?.kind}
                          body={thread.lastMessage?.body ?? null}
                          mine={thread.lastMessage?.sender_id === user.id}
                        />
                      </span>
                    </span>

                    {/* The unread mark is lime on a surface, never lime text:
                        #d1fe03 on paper is 1.17:1 and D2 bars it. A dot is a
                        shape, so it also does not depend on colour alone. */}
                    {thread.unread ? (
                      <span
                        className="size-2.5 shrink-0 rounded-full bg-accent"
                        aria-label="Unread"
                        role="img"
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Container>
    </AppShell>
  );
}

/*
  One line of preview.

  A voice note and a video have no text to show, so they are named rather than
  left blank. "You:" on your own last message is what stops a list of your own
  sends reading as a list of replies.
*/
function Preview({
  kind,
  body,
  mine,
}: {
  kind?: "text" | "voice" | "link" | "video";
  body: string | null;
  mine: boolean;
}) {
  if (!kind) return <span className="truncate">No messages yet</span>;

  const prefix = mine ? "You: " : "";

  if (kind === "voice") {
    return (
      <>
        <Mic className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{prefix}Voice message</span>
      </>
    );
  }
  if (kind === "video") {
    return (
      <>
        <Video className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{prefix}Video</span>
      </>
    );
  }
  if (kind === "link") {
    return (
      <>
        <Link2 className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{prefix}{body?.trim() || "Link"}</span>
      </>
    );
  }
  return <span className="truncate">{prefix}{body}</span>;
}
