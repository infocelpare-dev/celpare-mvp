import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_AFFINITY, type Affinity } from "./ranking";

/*
  What this account tends to care about, read from what it has actually done.

  READ WITH THE CALLER'S OWN SESSION CLIENT, ALWAYS. Every source here is either
  the caller's own rows under an "own rows only" policy, or a SECURITY DEFINER
  function that takes no id and answers for auth.uid(). There is deliberately no
  way to ask this question about somebody else: a preference profile of another
  person is surveillance, not personalization, and D85 already drew that line for
  recent activity.

  NOTHING HERE IS INVENTED. An account with no saves, no likes and no views gets
  an empty affinity and the ranker behaves as it does for a signed out visitor.
  That is the correct answer at launch and it needs no special casing, because
  every personalization weight multiplies a zero.
*/
export async function loadAffinity(
  db: SupabaseClient,
  viewerId: string | null,
): Promise<Affinity> {
  if (!viewerId) return NO_AFFINITY;

  const [affinityRows, followRows, recentRows] = await Promise.all([
    /* Categories and tags, weighted by what the action cost: a save is worth
       more than a like, a like more than a view. The weighting lives in the
       function because the view rows it reads are closed to this client. */
    db.rpc("my_search_affinity"),
    db.from("follows").select("following_id").eq("follower_id", viewerId).limit(500),
    db.rpc("my_recent_searches", { p_limit: 20 }),
  ]);

  const categories = new Map<string, number>();
  const tags = new Map<string, number>();

  if (affinityRows.error) {
    console.error(
      "[search] affinity failed",
      affinityRows.error.code,
      affinityRows.error.message,
    );
  } else {
    for (const row of (affinityRows.data as
      | { kind: string; value: string; weight: number }[]
      | null) ?? []) {
      const key = String(row.value ?? "").toLowerCase();
      if (!key) continue;
      const bucket = row.kind === "category" ? categories : tags;
      bucket.set(key, Math.max(bucket.get(key) ?? 0, Number(row.weight) || 0));
    }
  }

  const following = new Set<string>();
  if (followRows.error) {
    console.error("[search] follows failed", followRows.error.code, followRows.error.message);
  } else {
    for (const row of (followRows.data as { following_id: string }[] | null) ?? []) {
      following.add(row.following_id);
    }
  }

  const recent: string[] = [];
  if (!recentRows.error) {
    for (const row of (recentRows.data as { normalized: string }[] | null) ?? []) {
      if (row.normalized) recent.push(row.normalized);
    }
  }

  return { categories, tags, following, recent };
}
