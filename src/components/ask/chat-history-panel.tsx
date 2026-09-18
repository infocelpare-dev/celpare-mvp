"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { History, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
/* The type comes from the data source. `import type` is erased at compile
   time, so no server module is pulled into this client component. */
import type { ConversationSummary } from "@/lib/ai/conversations";
import { startNewChat } from "./new-chat";
import { deleteChat } from "@/app/actions/conversation";

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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  /* The row waiting for a second press, and the rows already gone. Deleting is
     a soft delete the server has agreed to, so the row leaves the list here
     rather than through a refresh: the URL of a chat still on its first visit
     is set by `replaceState`, and a refresh against it would fetch a route the
     rendered tree is not expecting. The server list catches up on the next
     New chat or reload. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, startDeleting] = useTransition();
  const searchRef = useRef<HTMLInputElement | null>(null);

  /*
    Escape closes it, like every other dismissible surface in the product. It
    unwinds one layer at a time, innermost first: a delete waiting to be
    confirmed, then the search, then the panel. Escaping straight past a
    pending delete would leave the person unsure whether they had cancelled it.
  */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirming) setConfirming(null);
      else if (searching) {
        setSearching(false);
        setQuery("");
      } else setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, searching, confirming]);

  // Opening the search puts the cursor in it. A field you still have to click
  // is not a shortcut.
  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

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

  /*
    New chat. Three things in one press, and the order is the whole point.

    `startNewChat` is what empties the screen. A new chat lives at /ask and
    takes that URL over with its own id once it is saved, so the link alone
    cannot be trusted to change anything: pressed from a chat started there it
    leads to the page already rendered, and React keeps the conversation.

    Then the navigation, run here rather than left to the link, so the URL is
    back at /ask before the refresh is asked for. A refresh fetches the
    current URL but patches it onto the tree already rendered, so refreshing
    while the URL still said /ask/[id] would ask the server for the chat being
    left behind and hand it to a page that is not expecting it.

    The refresh itself is for the list below, rendered by the server layout and
    so missing the chat just finished until something asks the server again.
    Pressing New chat is exactly when a person looks for the one they left.
  */
  function newChat(e: React.MouseEvent<HTMLAnchorElement>) {
    // A held modifier means "open in a new tab", not "clear this chat". Leave
    // those to the browser and to the href, which is why this stays a link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    closeIfOverlay();
    startNewChat();
    router.push("/ask");
    router.refresh();
  }

  /*
    The visible list: what the server sent, less what was just deleted, less
    what the search excludes. Filtering by title is enough because every chat
    now has one (4O.11): a greeting names its chat until a real question takes
    the name over, so there is no untitled row for a search to miss.

    The list the server sends is the most recent 100, so a search reaches back
    that far and no further. Worth knowing before somebody reports that an old
    chat cannot be found.
  */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((c) => !removed.includes(c.id))
      .filter((c) => !q || (c.title ?? "").toLowerCase().includes(q));
  }, [conversations, removed, query]);

  const groups = groupByDay(visible);

  function toggleSearch() {
    setSearching((v) => {
      if (v) setQuery("");
      return !v;
    });
  }

  /*
    Two presses to delete, not one, and not a modal. `ui-ux-pro-max` rates
    deleting without confirmation High severity, and the row can ask for itself:
    the second press is where the first one was, so it costs a glance rather
    than a dialog that covers the list you are working in.

    The row goes as soon as the server agrees. If the chat being deleted is the
    one on screen, the screen is cleared too, because leaving an open
    conversation whose record is gone is how a person ends up typing into
    something that can no longer be saved.
  */
  function remove(id: string) {
    setFailed(null);
    startDeleting(async () => {
      const res = await deleteChat(id);
      if (!res.ok) {
        setFailed(res.message);
        return;
      }
      setConfirming(null);
      setRemoved((prev) => [...prev, id]);
      if (pathname === `/ask/${id}`) {
        startNewChat();
        router.push("/ask");
      }
    });
  }


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
            onClick={newChat}
            className="inline-flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-[14px] font-medium transition-colors duration-200 ease-out hover:bg-surface"
          >
            <Plus className="size-4" aria-hidden />
            New chat
          </Link>
          <button
            type="button"
            onClick={toggleSearch}
            aria-label={searching ? "Close search" : "Search chats"}
            aria-expanded={searching}
            aria-controls="chat-history-search"
            title="Search chats"
            className={cn(
              "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors duration-200 ease-out",
              searching
                ? "bg-surface text-foreground"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            <Search className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close chat history"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Revealed by the icon rather than always present, so the panel stays
            a list of chats until you are actually looking for one. */}
        {searching ? (
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2 rounded-xl border border-border px-2.5 focus-within:border-accent">
              <Search className="size-4 shrink-0 text-muted" aria-hidden />
              <input
                id="chat-history-search"
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats"
                aria-label="Search chats"
                /* 16px, because iOS zooms the whole page on a smaller field.
                   Same reason as 4AB.16. */
                className="h-9 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted lg:text-[14px]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted transition-colors duration-200 hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {failed ? (
          <p role="alert" className="border-b border-border px-3 py-2 text-[13px] text-danger-text">
            {failed}
          </p>
        ) : null}

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
          ) : groups.length === 0 ? (
            /* A dead end is worse than a short answer, so this says what was
               searched for and what to do about it rather than "0 results". */
            <p className="px-2 py-2 text-[13px] leading-relaxed text-muted">
              {query.trim() ? (
                <>
                  No chats match{" "}
                  <span className="text-foreground">{query.trim()}</span>. Try a
                  word from the question you asked.
                </>
              ) : (
                "Your chats will appear here once you ask something."
              )}
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

                    /* Asking about this row, so the row asks back instead of a
                       dialog opening over the list. */
                    if (confirming === c.id) {
                      return (
                        <li
                          key={c.id}
                          className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-2"
                        >
                          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                            Delete this chat?
                          </span>
                          <button
                            type="button"
                            onClick={() => remove(c.id)}
                            disabled={pending}
                            className="shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-[13px] font-medium text-danger-text transition-colors duration-200 hover:bg-danger-surface disabled:opacity-60"
                          >
                            {pending ? "Deleting" : "Delete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            disabled={pending}
                            className="shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-[13px] text-muted transition-colors duration-200 hover:text-foreground disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </li>
                      );
                    }

                    return (
                      <li
                        key={c.id}
                        className={cn(
                          /* The delete control is a sibling of the link, never
                             inside it: a button nested in an anchor is invalid
                             markup and navigates before it can be pressed. */
                          "group flex items-center rounded-lg transition-colors duration-200",
                          active
                            ? "bg-surface font-medium text-foreground"
                            : "text-muted hover:bg-surface hover:text-foreground",
                        )}
                      >
                        <Link
                          href={`/ask/${c.id}`}
                          onClick={closeIfOverlay}
                          aria-current={active ? "page" : undefined}
                          className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-2.5 text-[14px]"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {c.title ?? "Untitled chat"}
                          </span>
                          {/*
                            `relative` reads the clock, so the server renders
                            "9m" and the browser hydrates "8m" a second later
                            and React throws a hydration mismatch. The times
                            are correct, they are just measured a moment apart.
                            This is the one case React documents the attribute
                            for, and the text corrects itself on the next
                            render. Same family as the date bug in 4S.8.
                          */}
                          <span
                            suppressHydrationWarning
                            className="shrink-0 text-[12px] tabular-nums text-muted"
                          >
                            {relative(c.updated_at)}
                          </span>
                        </Link>
                        {/*
                          Faint until wanted, never absent. Hover alone would
                          hide it on a touch screen, so it also shows on focus
                          and at every width below `lg`, where there is no
                          pointer to hover with.
                        */}
                        <button
                          type="button"
                          onClick={() => {
                            setFailed(null);
                            setConfirming(c.id);
                          }}
                          aria-label={`Delete chat: ${c.title ?? "untitled"}`}
                          title="Delete chat"
                          className="mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted transition-all duration-200 hover:bg-danger-surface hover:text-danger-text focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
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
