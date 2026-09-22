"use server";

import { revalidatePath } from "next/cache";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  The only things a person can do to their own search history: remove one item, or
  remove all of it.

  NOTHING HERE WRITES HISTORY. A search is recorded by the page that ran it,
  server side, through the service role, for the reason telemetry.ts sets out in
  full: these rows feed ranking and the abuse dashboards, and an endpoint the
  browser can post to is an endpoint anybody can post to. src/app/actions/recent.ts
  is the same shape and the same argument.

  BOTH FUNCTIONS ARE DELETES, NOT HIDES. Removing a search from the list has to
  mean it stops existing, which is what D85 settled for recent activity. A hidden
  row would still be in the table the ranking signals are read from.
*/

export type SearchHistoryState = {
  status: "idle" | "success" | "error";
  message: string;
};

const NOT_SIGNED_IN: SearchHistoryState = {
  status: "error",
  message: "Sign in to do that.",
};

async function sessionUser() {
  if (!isSupabaseConfigured()) return null;
  const db = await createClient();
  /* getUser, not getSession, per D21. */
  const {
    data: { user },
  } = await db.auth.getUser();
  return user ? { db, user } : null;
}

export async function removeRecentSearch(
  _prev: SearchHistoryState,
  formData: FormData,
): Promise<SearchHistoryState> {
  const query = String(formData.get("query") ?? "").slice(0, 200);
  if (!query.trim()) return { status: "error", message: "Nothing to remove." };

  const session = await sessionUser();
  if (!session) return NOT_SIGNED_IN;

  /*
    The function normalises the query itself and scopes the delete to auth.uid(),
    so the worst a forged request can do is delete one of the sender's own rows.
    It also returns the row count, which is how the message can be honest about
    whether anything was actually removed.
  */
  const { data, error } = await session.db.rpc("delete_my_search", {
    p_normalized: query,
  });

  if (error) {
    console.error("[search] delete history failed", error.code, error.message);
    return { status: "error", message: "That did not go through." };
  }

  /* BOTH SURFACES, the same two clearRecentSearches revalidates. my_recent_activity
     lists your searches beside the tools you opened, so removing one here and not
     saying so there left /profile offering a search that no longer exists. */
  revalidatePath("/search");
  revalidatePath("/profile");
  return {
    status: "success",
    message: Number(data ?? 0) > 0 ? "Removed." : "It was already gone.",
  };
}

export async function clearRecentSearches(): Promise<SearchHistoryState> {
  const session = await sessionUser();
  if (!session) return NOT_SIGNED_IN;

  const { error } = await session.db.rpc("clear_my_searches");

  if (error) {
    console.error("[search] clear history failed", error.code, error.message);
    return { status: "error", message: "That did not go through." };
  }

  /* /profile renders the same searches inside Recent activity, so it would keep
     showing rows that no longer exist. */
  revalidatePath("/search");
  revalidatePath("/profile");
  return { status: "success", message: "Search history cleared." };
}

/*
  The form action for one row's remove button.

  removeRecentSearch has the useActionState signature, (previous, formData), which
  a plain form action cannot supply. This is the thin adapter so each row can be a
  real form in a SERVER component: no client state, no hook, and the button works
  with JavaScript disabled. The outcome is not read anywhere, because the row
  disappearing IS the outcome.
*/
export async function removeRecentSearchForm(formData: FormData): Promise<void> {
  await removeRecentSearch({ status: "idle", message: "" }, formData);
}
