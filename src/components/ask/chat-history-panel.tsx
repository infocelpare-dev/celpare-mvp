"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { History, Plus, Settings, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
/* The type comes from the data source. `import type` is erased at compile
   time, so no server module is pulled into this client component. */
import type { ConversationSummary } from "@/lib/ai/conversations";

/*
  Chat history for Ask Celpare: a slim rail beside the existing sidebar, and a
  panel it opens.

  The main sidebar is untouched. This is a second, narrower column that belongs
  to Ask Celpare alone, the way the conversation list belongs to Ask Celpare
  alone. On a feed or a pricing page these controls would have nothing to do.

  The panel is inline on a large screen, so opening it pushes the conversation
  rather than covering it, and an overlay below that, where there is no room to
  push anything. Same component, two behaviours, decided by one breakpoint.
*/

type Group = { label: string; items: ConversationSummary[] };

/*
  Today, Yesterday, then everything else. Calendar days, not 24 hour windows:
  something from 11pm last night is "Yesterday" to a person even though it is
  two hours old.
*/
function groupByDay(conversations: ConversationSummary[]): Group[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const today: ConversationSummary[] = [];
  const yesterday: ConversationSummary[] = [];
  const earlier: ConversationSummary[] = [];

  for (const c of conversations) {
    const at = new Date(c.updated_at);
    if (at >= startOfToday) today.push(c);
    else if (at >= startOfYesterday) yesterday.push(c);
    else earlier.push(c);
  }

  return [
    { label: "Today", items: today },
    { label: "Yesterday", items: yesterday },
    { label: "Previous", items: earlier },
  ].filter((g) => g.items.length > 0);
}

function relative(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function ChatHistoryPanel({
  conversations,
  signedIn,
  fullName,
  username,
  avatarUrl,
}: {
  conversations: ConversationSummary[];
  signedIn: boolean;
  fullName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Escape closes it, like every other dismissible surface in the product.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /*
    Close on navigation only where the panel is an overlay. On a large screen
    it is an ordinary column beside the conversation, so closing it after every
    pick would throw away your place in the list for no reason. Below lg it
    covers the chat, and leaving it open means tapping a conversation looks
    like nothing happened.

    The breakpoint is read at click time rather than stored, so a window that
    is resized mid session still behaves correctly.
  */
  function closeIfOverlay() {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(max-width: 1023px)").matches) setOpen(false);
  }

  const groups = groupByDay(conversations);

  return (
    <>
      {/* The rail. Always present on Ask Celpare, at every width. */}
      <div className="flex w-[52px] shrink-0 flex-col items-center justify-between border-r border-border py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close chat history" : "Chat history"}
          aria-expanded={open}
          aria-controls="chat-history-panel"
          title="Chat history"
          className={cn(
            "flex size-9 cursor-pointer items-center justify-center rounded-lg transition-colors duration-200 ease-out",
            open
              ? "bg-surface text-foreground"
              : "text-muted hover:bg-surface hover:text-foreground",
          )}
        >
          <History className="size-[18px]" aria-hidden />
        </button>

        {/*
          Settings and profile at the foot of the rail. Both point at the
          experiences that already exist rather than duplicating them, and both
          are hidden when signed out, where there is no account to open.
        */}
        {signedIn ? (
          <div className="flex flex-col items-center gap-1">
            <Link
              href="/settings"
              aria-label="Settings"
              title="Settings"
              aria-current={pathname === "/settings" ? "page" : undefined}
              className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
            >
              <Settings className="size-[18px]" aria-hidden />
            </Link>
            <Link
              href="/profile"
              aria-label="Your profile"
              title="Your profile"
              aria-current={pathname === "/profile" ? "page" : undefined}
              className="flex size-9 items-center justify-center rounded-lg transition-colors duration-200 ease-out hover:bg-surface"
            >
              {/* Falls back to initials, then to a neutral mark. Never renders
                  empty, and never shows anything but a picture and a name. */}
              <Avatar
                size="sm"
                fullName={fullName}
                username={username}
                avatarUrl={avatarUrl}
              />
            </Link>
          </div>
        ) : null}
      </div>

      {/* Backdrop, only where the panel covers the conversation. */}
      {open ? (
        <button
          type="button"
          aria-label="Close chat history"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      ) : null}

      <div
        id="chat-history-panel"
        hidden={!open}
        className={cn(
          "z-40 flex w-[288px] shrink-0 flex-col border-r border-border bg-background",
          /* Overlay on a small screen, an ordinary column on a large one. */
          "fixed inset-y-0 left-[52px] lg:static lg:inset-auto lg:z-auto",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-3">
          <Link
            href="/ask"
            onClick={closeIfOverlay}
            className="inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-[14px] font-medium transition-colors duration-200 ease-out hover:bg-surface"
          >
            <Plus className="size-4" aria-hidden />
            New chat
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close chat history"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <nav
          aria-label="Chat history"
          className="min-h-0 flex-1 overflow-y-auto px-2 py-3"
        >
          {!signedIn ? (
            /* D36: anonymous chats are never saved, so there is no list. Saying
               why is better than an empty box. */
            <p className="px-2 py-2 text-[13px] leading-relaxed text-muted">
              Chats are saved to your account. Sign in to keep them.
            </p>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-2 text-[13px] leading-relaxed text-muted">
              Your chats will appear here once you ask something.
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-4 last:mb-0">
                <p className="px-2 pb-1 text-[12px] font-medium uppercase tracking-wide text-muted">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((c) => {
                    const active = pathname === `/ask/${c.id}`;
                    return (
                      <li key={c.id}>
                        <Link
                          href={`/ask/${c.id}`}
                          onClick={closeIfOverlay}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] transition-colors duration-200",
                            active
                              ? "bg-surface font-medium text-foreground"
                              : "text-muted hover:bg-surface hover:text-foreground",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {c.title ?? "New chat"}
                          </span>
                          <span className="shrink-0 text-[12px] tabular-nums text-muted">
                            {relative(c.updated_at)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </nav>
      </div>
    </>
  );
}
