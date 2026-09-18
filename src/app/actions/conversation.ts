"use server";

import { z } from "zod";
import { deleteConversation } from "@/lib/ai/conversations";
import { isSupabaseConfigured } from "@/lib/supabase/server";

/*
  Deleting a chat from the history panel.

  `deleteConversation` was written in Phase 4O and never called from anywhere.
  This is the caller. It is a soft delete, per 03-data-model.md: user generated
  content is never hard deleted, and the RLS policy already hides a row once
  `deleted_at` is set, so the chat leaves the list and the URL stops resolving
  without the transcript being destroyed.

  Ownership is not checked here on purpose. The write goes through the caller's
  own session, so the `conversations_own` policy is what decides, and somebody
  else's id simply matches no row. Checking it here as well would be a second
  answer to a question the database has already answered.

  No `revalidatePath`. A chat that has not been reloaded since it was created
  holds its id in the URL through `history.replaceState`, so the rendered tree
  is still the one for /ask, and a revalidation would fetch the URL against
  that tree. The panel drops the row itself instead, and the server list
  catches up on the next New chat or reload.
*/
const schema = z.object({ id: z.string().uuid("That is not a chat.") });

export async function deleteChat(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Not connected." };
  }

  const parsed = schema.safeParse({ id });
  if (!parsed.success) {
    return { ok: false, message: "That is not a chat." };
  }

  const ok = await deleteConversation(parsed.data.id);
  return {
    ok,
    message: ok ? "" : "That chat could not be deleted. Try again in a moment.",
  };
}
