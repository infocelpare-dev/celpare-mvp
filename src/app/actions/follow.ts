"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export type FollowState = {
  status: "idle" | "success" | "error";
  following: boolean;
  message: string;
};

/*
  Follow and unfollow. D69, which overrides D28 for follows only.

  The same doctrine as settings.ts: a zod allowlist in, a hardcoded column
  literal out, getUser rather than getSession, and the database as the actual
  control. Here the controls that matter are the composite primary key, which
  makes a repeat follow a no-op rather than a second row, and follows_no_self,
  which the CHECK enforces regardless of what is posted.

  follower_count and following_count are never touched here. They are trigger
  owned and are not in the client UPDATE grant, so this code could not write
  them even if it tried.
*/
const schema = z.object({
  targetId: z.string().uuid("That is not a person."),
  intent: z.enum(["follow", "unfollow"]),
});

export async function toggleFollow(
  _prev: FollowState,
  formData: FormData,
): Promise<FollowState> {
  const wanted = formData.get("intent") === "follow";

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      following: !wanted,
      message: "Not connected.",
    };
  }

  const parsed = schema.safeParse({
    targetId: formData.get("targetId") ?? "",
    intent: formData.get("intent") ?? "follow",
  });

  if (!parsed.success) {
    return { status: "error", following: !wanted, message: "That did not work." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      following: false,
      message: "Sign in to follow people.",
    };
  }

  if (user.id === parsed.data.targetId) {
    // Also refused by follows_no_self, so this is the readable message rather
    // than the control.
    return {
      status: "error",
      following: false,
      message: "You cannot follow yourself.",
    };
  }

  if (parsed.data.intent === "follow") {
    const { error } = await supabase
      .from("follows")
      .insert({ follower_id: user.id, following_id: parsed.data.targetId });

    // 23505 means the row already exists, which is the outcome that was
    // wanted. Idempotency comes from the primary key, so this is a success.
    if (error && error.code !== "23505") {
      console.error("[follow] insert failed", error.code, error.message);
      return { status: "error", following: false, message: "Could not follow." };
    }
  } else {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", parsed.data.targetId);

    if (error) {
      console.error("[follow] delete failed", error.code, error.message);
      return { status: "error", following: true, message: "Could not unfollow." };
    }
  }

  const following = parsed.data.intent === "follow";

  // Both profiles show a count that just changed.
  revalidatePath("/profile");
  revalidatePath("/u/[username]", "page");

  return { status: "success", following, message: "" };
}
