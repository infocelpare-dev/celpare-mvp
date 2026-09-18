import { createClient } from "@/lib/supabase/server";
import type { ToolCitation } from "./types";

/*
  Conversation persistence, for signed in people only.

  Anonymous chats are never written (D36), which is why every function here
  starts by needing a user. That is not a limitation to work around later: it is
  the reason the anonymous path has no RLS surface and no retention question.

  Writes go through the caller's own session, so RLS is what enforces ownership.
  The service role is not used here on purpose: a conversation is user shaped
  data and D21 says the service role never touches a user shaped request.
*/

export type ConversationSummary = {
  id: string;
  title: string | null;
  updated_at: string;
};

export async function listConversations(limit = 30): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[ai] listing conversations failed", error.code, error.message);
    return [];
  }
  return data ?? [];
}

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: ToolCitation[];
};

export async function loadConversation(
  id: string,
): Promise<{ title: string | null; messages: StoredMessage[] } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // RLS restricts both of these to the caller's own rows, so a guessed id
  // returns nothing rather than somebody else's chat.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();

  if (!conversation) return null;

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, role, content, citations")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[ai] loading messages failed", error.code, error.message);
    return null;
  }

  return {
    title: conversation.title,
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      citations: (m.citations ?? []) as ToolCitation[],
    })),
  };
}

/* One line for the sidebar, from the message that earned it. */
function titleFor(message: string): string {
  const trimmed = message.trim();
  return trimmed.length > 57 ? `${trimmed.slice(0, 57)}...` : trimmed;
}

/*
  Has this conversation only ever been small talk?

  Read from the messages rather than stored on the row. Small talk is answered
  locally with no model call and saved with `model = 'local'`, so a chat with
  no model written answer has never been about anything yet. That beats a
  column that would need a migration and then need keeping true.

  A user row carries `model` null, and in SQL `null <> 'local'` is null rather
  than true, so those rows cannot satisfy this filter. The role check is there
  anyway, because relying on that would be a trick rather than a rule.
*/
async function titleIsProvisional(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  title: string | null,
): Promise<boolean> {
  if (!title) return true;
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .neq("model", "local")
    .limit(1)
    .maybeSingle();
  return !data;
}

/* Creates the conversation on the first message and titles it from that
   message. Returns null when nothing should be saved, which is the anonymous
   case and the "history off in settings" case.

   `provisional` marks a title that is only standing in until there is a better
   one. A greeting names the chat "hi", which is true and is not a topic, so
   the first real question takes the name over. Founder instruction
   2026-09-18: every chat carries a topic, and the list never shows a row
   called "New chat". */
export async function ensureConversation(
  userId: string,
  firstMessage: string,
  existingId?: string | null,
  provisional = false,
): Promise<string | null> {
  const supabase = await createClient();

  if (existingId) {
    const { data } = await supabase
      .from("conversations")
      .select("id, title")
      .eq("id", existingId)
      .maybeSingle();
    if (data) {
      /* A real question claims the name off a greeting, and off any row that
         reached the database without a title. */
      if (!provisional && (await titleIsProvisional(supabase, data.id, data.title))) {
        const { error } = await supabase
          .from("conversations")
          .update({ title: titleFor(firstMessage) })
          .eq("id", data.id);
        if (error) {
          // A chat keeping the wrong name is a smaller loss than a turn that
          // never gets written, so this is logged, not thrown.
          console.error("[ai] titling the conversation failed", error.code, error.message);
        }
      }
      return data.id;
    }
    // An id that does not resolve is treated as absent rather than as an
    // error: the likeliest cause is a stale tab pointing at a deleted chat.
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      title: titleFor(firstMessage),
      feature: "ask",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ai] creating conversation failed", error.code, error.message);
    return null;
  }
  return data.id;
}

export async function saveTurn(opts: {
  conversationId: string;
  question: string;
  answer: string;
  citations: ToolCitation[];
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const supabase = await createClient();

  /*
    Both rows must carry the same keys.

    PostgREST builds one INSERT from the union of the keys across the array and
    sends an explicit NULL for any key an object is missing, rather than letting
    the column default apply. So omitting input_tokens on the user row does not
    give it 0, it gives it NULL and the not-null constraint rejects the whole
    insert. This failed exactly that way the first time it ran.
  */
  const { error } = await supabase.from("messages").insert([
    {
      conversation_id: opts.conversationId,
      role: "user",
      content: opts.question,
      citations: [],
      model: null,
      provider: null,
      input_tokens: 0,
      output_tokens: 0,
    },
    {
      conversation_id: opts.conversationId,
      role: "assistant",
      content: opts.answer,
      citations: opts.citations,
      model: opts.model,
      provider: opts.provider,
      input_tokens: opts.inputTokens,
      output_tokens: opts.outputTokens,
    },
  ]);

  if (error) {
    console.error("[ai] saving turn failed", error.code, error.message);
    return;
  }

  // Touch the conversation so the sidebar orders by real activity. The trigger
  // only fires on update, and inserting a message is not one.
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", opts.conversationId);
}

export async function deleteConversation(id: string): Promise<boolean> {
  const supabase = await createClient();
  // Soft delete: 03-data-model.md says user generated content is never hard
  // deleted, and the RLS policy already hides rows with deleted_at set.
  const { error } = await supabase
    .from("conversations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    console.error("[ai] deleting conversation failed", error.code, error.message);
    return false;
  }
  return true;
}
