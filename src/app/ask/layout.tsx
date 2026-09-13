import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app/app-shell";
import { ChatList } from "@/components/ask/chat-list";
import { listConversations } from "@/lib/ai/conversations";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

/* Reads the session cookie, so it must never be prerendered. */
export const dynamic = "force-dynamic";

/*
  The shell lives here rather than in each page, which fixes a real defect: a
  page owning its own chrome means `loading.tsx` replaces the chrome too, so
  opening a saved chat blanked the bar and the sidebar for the length of the
  database read and then popped them back.

  In a layout the frame is rendered once and stays put across `/ask` and
  `/ask/[id]`, the skeleton appears inside it, and the chat list does not
  reload when you move between conversations.
*/
export default async function AskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let signedIn = false;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  }

  // Anonymous chats are never saved (D36), so there is no list to show.
  const conversations = signedIn ? await listConversations() : [];

  return (
    <AppShell
      signedIn={signedIn}
      fullHeight
      /* Ask Celpare is the only surface with the rail: chats, settings and
         profile beside the conversation. */
      rail
      secondary={signedIn ? <ChatList conversations={conversations} /> : undefined}
      signOutAction={
        <form action={signOut}>
          <Button variant="outline" size="sm" type="submit">
            Log out
          </Button>
        </form>
      }
    >
      {children}
    </AppShell>
  );
}
