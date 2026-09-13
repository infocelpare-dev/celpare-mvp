"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConversationSummary = {
  id: string;
  title: string | null;
  updated_at: string;
};

/*
  The list of saved chats, rendered inside the product sidebar under the
  sections rather than in a column of its own. Two sidebars side by side would
  take 490px before the conversation gets any, which on a 1280 laptop is most
  of the reading width.

  It is only rendered for signed in people, because anonymous chats are never
  saved (D36) and a permanently empty list is a reminder of a feature that is
  not for you.
*/
export function ChatList({
  conversations,
  onNavigate,
}: {
  conversations: ConversationSummary[];
  /* Closes the drawer on a phone, where the sidebar covers the chat. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="text-[13px] font-medium text-muted">Your chats</span>
        <ButtonLink href="/ask" size="sm" variant="outline" onClick={onNavigate}>
          <Plus className="size-3.5" aria-hidden />
          New
        </ButtonLink>
      </div>

      <nav aria-label="Your chats" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="px-2 py-2 text-[13px] leading-relaxed text-muted">
            Your chats will appear here once you ask something.
          </p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => {
              const active = pathname === `/ask/${c.id}`;
              return (
                <li key={c.id}>
                  <Link
                    href={`/ask/${c.id}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block truncate rounded-lg px-3 py-2 text-[14px] transition-colors duration-200",
                      active
                        ? "bg-surface font-medium text-foreground"
                        : "text-muted hover:bg-surface hover:text-foreground",
                    )}
                  >
                    {c.title ?? "New chat"}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </div>
  );
}
