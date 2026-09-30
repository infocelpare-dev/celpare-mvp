import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadInterestProfile } from "@/lib/community/intelligence/server/data";
import { loadAffinity } from "@/lib/search/personalization";
import type { CatalogueIndex } from "../catalogue";
import { buildUserContext, emptyUserContext, type ActivityRow, type UserContext } from "../user";

/*
  The viewer, for tools and models (guide 17 section 8, D178).

  READ WITH THE VIEWER'S OWN SESSION. my_tool_model_activity answers for
  auth.uid() only; the interest and affinity loaders are the existing ones, reused
  as they are. There is no way to build this context for someone else.

  Network proof (people you follow who saved an entry) is a count from
  my_explore_network, read only for strategies that show it.

  A failed read degrades to less personalization, never to a failed page: the
  engine's non personal strategies do not need any of this.
*/

export type UserLoad = { user: UserContext; failed: string[]; ms: number };

export async function loadUserContext(viewerId: string | null, index: CatalogueIndex, opts: { network: boolean; now: number }): Promise<UserLoad> {
  const started = Date.now();
  if (!viewerId) return { user: emptyUserContext(null), failed: [], ms: 0 };
  const failed: string[] = [];
  const db = await createClient();

  const toolIds = index.list.filter((e) => e.ref.type === "tool" && !e.fixture).map((e) => e.ref.id);
  const modelIds = index.list.filter((e) => e.ref.type === "model" && !e.fixture).map((e) => e.ref.id);

  const [activity, interests, affinity, toolNet, modelNet] = await Promise.all([
    db.rpc("my_tool_model_activity", { p_days: 60 }).then(
      (r) => {
        if (r.error) {
          console.error("[recommend] activity failed", r.error.code, r.error.message);
          failed.push("activity");
          return [];
        }
        return (r.data as Record<string, unknown>[]) ?? [];
      },
      () => {
        failed.push("activity");
        return [];
      },
    ),
    loadInterestProfile(db, viewerId, opts.now).catch(() => {
      failed.push("interests");
      return null;
    }),
    loadAffinity(db, viewerId).catch(() => {
      failed.push("affinity");
      return null;
    }),
    opts.network && toolIds.length ? db.rpc("my_explore_network", { p_type: "tool", p_ids: toolIds.slice(0, 200) }) : Promise.resolve(null),
    opts.network && modelIds.length ? db.rpc("my_explore_network", { p_type: "model", p_ids: modelIds.slice(0, 200) }) : Promise.resolve(null),
  ]);

  const rows: ActivityRow[] = activity.flatMap((r) => {
    const at = Date.parse(String(r.at));
    if (!Number.isFinite(at)) return [];
    const type = r.entity_type === "tool" || r.entity_type === "model" ? r.entity_type : null;
    return [
      {
        surface: String(r.surface ?? ""),
        event: String(r.event ?? ""),
        entityType: type,
        entityId: type ? ((r.entity_id as string | null) ?? null) : null,
        query: (r.query as string | null) ?? null,
        at,
      },
    ];
  });

  const user = buildUserContext(
    {
      userId: viewerId,
      activity: rows,
      communityLong: interests?.profile.longTerm,
      affinity: affinity ? { categories: affinity.categories, tags: affinity.tags } : null,
      now: opts.now,
    },
    index,
  );

  for (const [net, type] of [
    [toolNet, "tool"],
    [modelNet, "model"],
  ] as const) {
    if (!net) continue;
    if (net.error) {
      failed.push(`${type} network`);
      continue;
    }
    for (const r of (net.data as Record<string, unknown>[]) ?? []) {
      const savers = Number(r.savers) || 0;
      if (savers > 0) user.networkSavers.set(`${type}:${r.entity_id}`, savers);
    }
  }

  return { user, failed, ms: Date.now() - started };
}
