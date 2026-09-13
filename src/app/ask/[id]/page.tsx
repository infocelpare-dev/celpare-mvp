import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AskChat } from "@/components/ask/ask-chat";
import { loadConversation } from "@/lib/ai/conversations";
import { composerConfig } from "@/lib/ai/modes";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const conversation = await loadConversation(id);
  return {
    title: conversation?.title ?? "Ask Celpare",
    // A saved chat is private. Keeping it out of the index is not a substitute
    // for the RLS policy that actually protects it, but there is no reason to
    // advertise the URL either.
    robots: { index: false, follow: false },
  };
}

export default async function SavedChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let signedIn = false;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  }

  const conversation = await loadConversation(id);
  // RLS returns nothing for somebody else's chat, so this is a 404 rather than
  // a 403: the existence of the row is not something to confirm.
  if (!conversation) notFound();

  const { grants, defaults } = await composerConfig();

  return (
    <AskChat
      signedIn={signedIn}
      grants={grants}
      defaultModes={defaults}
      initialConversationId={id}
      /* Each answer carries the question above it, so Retry works on a
         conversation loaded from the database and not only on one typed in
         this tab. */
      initialTurns={conversation.messages.map((m, i) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citations: m.citations,
        question:
          m.role === "assistant" && conversation.messages[i - 1]?.role === "user"
            ? conversation.messages[i - 1].content
            : undefined,
      }))}
    />
  );
}
