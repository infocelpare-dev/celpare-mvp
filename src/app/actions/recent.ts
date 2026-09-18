"use server";

import { revalidatePath } from "next/cache";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  Recent activity: the one thing a person can do to their own history, which is
  delete it.

  There is no action here that WRITES history. Searches and tool views are
  recorded server side by lib/telemetry.ts through the service role, and that
  is deliberate: an endpoint the browser can post to is an endpoint anybody can
  post to, and these rows feed the spend and abuse dashboards. See the comment
  at the top of telemetry.ts for the full argument.

  Reading is the same story in reverse. Neither anon nor authenticated holds a
  grant on search_events or tool_view_events, so both directions go through a
  SECURITY DEFINER function that answers only for auth.uid().
*/

export type RecentState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function clearRecentActivity(): Promise<RecentState> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Not available right now." };
  }

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  /* getUser, not getSession, per D21: it verifies with the auth server rather
     than trusting a cookie this process happens to hold. */
  if (!user) {
    return { status: "error", message: "Sign in to do that." };
  }

  /*
    The function checks auth.uid() itself and raises 42501 when there is none,
    so the check above is the courtesy and this is the control. It also takes
    no argument, which means there is no id to tamper with: a forged request
    can only ever clear the history of whoever sent it.
  */
  const { error } = await db.rpc("clear_my_recent_activity");

  if (error) {
    console.error("[recent] clear failed", error.code, error.message);
    return {
      status: "error",
      message: "That did not go through. Try again in a moment.",
    };
  }

  /* Both profile routes render the tab, and neither should keep showing rows
     that no longer exist. */
  revalidatePath("/profile");
  revalidatePath("/settings");

  return { status: "success", message: "Cleared." };
}
