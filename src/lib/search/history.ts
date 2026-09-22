import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RecentSearch } from "./types";

/*
  Recent searches.

  ONLY YOUR OWN, AND THERE IS NO WAY TO ASK FOR ANYBODY ELSE'S. my_recent_searches
  takes a limit and nothing else: it reads auth.uid() itself, so there is no id
  parameter to tamper with. Same shape as my_recent_activity and the same reason,
  D85: a search history is the single most revealing thing this product stores
  about a person, and no setting publishes it.

  A signed out visitor gets nothing from here. Their history, if the browser keeps
  one, is kept by the browser: section 15 allows local storage for anonymous
  visitors and that is where it stays, never uploaded to be joined to anything.
*/
/*
  Ten, founder instruction 2026-09-21: do not hide from somebody what they
  searched for. It was eight, which was a number picked to keep the empty page
  short and had nothing behind it.

  One place rather than a literal at the call site, because the page, the
  function's default and any future surface that lists them have to agree on what
  "recent" means.
*/
export const RECENT_SEARCHES_SHOWN = 10;

export async function loadRecentSearches(
  viewerId: string | null,
  limit = RECENT_SEARCHES_SHOWN,
): Promise<RecentSearch[]> {
  if (!viewerId) return [];

  const db = await createClient();
  const { data, error } = await db.rpc("my_recent_searches", { p_limit: limit });

  if (error) {
    console.error("[search] recent searches failed", error.code, error.message);
    return [];
  }

  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    query: String(r.query ?? ""),
    normalized: String(r.normalized ?? ""),
    searchedAt: String(r.searched_at ?? ""),
    resultCount: Number(r.result_count ?? 0),
  }));
}
