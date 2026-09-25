"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/*
  Negative feedback on the feed: not interested in a post, mute an author, mute
  a topic. Written with the person's own client, so feed_feedback's policies
  decide: a row can only ever be written for yourself.

  WHAT IT DOES AND DOES NOT DO. It reduces what the ranker shows THIS person.
  It deletes nothing, hides nothing from anybody else and notifies nobody, and
  it is reversible: `undo` removes the row.

  The target is checked to exist and be visible to the person first, through
  their own client, so the table cannot fill with ids that point at nothing.
*/

const schema = z.object({
  targetType: z.enum(["post", "author", "topic"]),
  targetId: z.string().uuid(),
  undo: z.boolean().optional(),
});

export type FeedbackResult = { ok: boolean; message: string };

export async function setFeedFeedback(input: {
  targetType: "post" | "author" | "topic";
  targetId: string;
  undo?: boolean;
}): Promise<FeedbackResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That could not be saved." };
  const { targetType, targetId, undo } = parsed.data;
  const kind = targetType === "post" ? "not_interested" : "mute";

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return { ok: false, message: "Sign in to tune your feed." };

  if (undo) {
    const { error } = await db
      .from("feed_feedback")
      .delete()
      .eq("user_id", user.id)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .eq("kind", kind);
    if (error) {
      console.error("[feed] feedback undo failed", error.code, error.message);
      return { ok: false, message: "That could not be undone. Try again." };
    }
    return { ok: true, message: "Undone." };
  }

  if (targetType === "author" && targetId === user.id) {
    return { ok: false, message: "You cannot mute yourself." };
  }

  const table = targetType === "post" ? "posts" : targetType === "author" ? "profiles" : "topics";
  const { data: exists, error: lookupError } = await db
    .from(table)
    .select("id")
    .eq("id", targetId)
    .maybeSingle();
  if (lookupError) {
    console.error("[feed] feedback lookup failed", lookupError.code, lookupError.message);
    return { ok: false, message: "That could not be saved. Try again." };
  }
  if (!exists) return { ok: false, message: "That is no longer available." };

  const { error } = await db
    .from("feed_feedback")
    .upsert(
      { user_id: user.id, target_type: targetType, target_id: targetId, kind },
      { onConflict: "user_id,target_type,target_id,kind", ignoreDuplicates: true },
    );
  if (error) {
    console.error("[feed] feedback failed", error.code, error.message);
    return { ok: false, message: "That could not be saved. Try again." };
  }

  return {
    ok: true,
    message:
      targetType === "post"
        ? "You will see fewer posts like this."
        : targetType === "author"
          ? "Muted. Their posts will stay out of your feeds."
          : "Muted. Posts in this topic will stay out of your feeds.",
  };
}
