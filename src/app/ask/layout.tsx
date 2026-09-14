import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app/app-shell";
import { ChatHistoryPanel } from "@/components/ask/chat-history-panel";
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

  Chat history moved out of the main sidebar's secondary slot and into its own
  rail and panel on 2026-09-14. The main sidebar is unchanged and still carries
  the product sections; keeping the conversation list in both places would be
  the same duplication that got the old rail removed.
*/
export default async function AskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let signedIn = false;
  let fullName: string | null = null;
  let username: string | null = null;
  let avatarUrl: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);

    if (user) {
      /*
        Only what the rail renders: a picture and a name. No email, which is
        not in the SELECT grant anyway, and nothing else about the account.
      */
      const { data } = await supabase
        .from("profiles")
        .select("full_name, username, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      fullName = data?.full_name ?? null;
      username = data?.username ?? null;
      avatarUrl = data?.avatar_url ?? null;
    }
  }

  // Anonymous chats are never saved (D36), so there is no list to show.
  const conversations = signedIn ? await listConversations() : [];

  return (
    <AppShell
      signedIn={signedIn}
      fullHeight
      asideStart={
        <ChatHistoryPanel
          conversations={conversations}
          signedIn={signedIn}
          fullName={fullName}
          username={username}
          avatarUrl={avatarUrl}
        />
      }
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
