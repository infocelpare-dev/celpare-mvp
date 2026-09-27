import "server-only";
import { cache } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { readerFor } from "@/lib/community/queries";
import { toVideoPosts } from "@/lib/community/video";
import { getFeatured } from "@/lib/platform/settings";
import {
  MODEL_ROW_COLUMNS,
  TOOL_ROW_COLUMNS,
  modelFromRow,
  toolFromRow,
} from "@/lib/search/rows";
import type { RecentRow } from "@/lib/profile/queries";
import type { SaveEntity } from "@/lib/collections/types";
import { SECTION_TYPES } from "./intelligence/config";
import { explainExploreReason } from "./intelligence/reasons";
import { getExplore, type ExploreResult } from "./intelligence/server/engine";
import type { ExploreScored, ExploreSectionId as RankedSectionId } from "./intelligence/types";
import type { ExploreTab, ExploreItem, ExploreTopic, SectionState } from "./types";
import { TAB_KIND, empty, failed, ok } from "./types";

/*
  Every Explore read.

  THE RANKED SHELVES COME FROM explore_v1 (4BI, D150). For you, Trending,
  Rising, New, Tools, Models, People, Topics, Discussions, Videos and Continue
  exploring are all sections of ONE ranking run over ONE candidate pool per
  request (lib/explore/intelligence). This file only maps what it ranked back
  onto the shapes the cards already draw, so no card changed to accept it.

  WHAT IS NOT RANKED. Featured is an editorial pick and stays in the order the
  administrator chose (D158). Continue exploring falls back to the person's own
  recent activity list when they have explored nothing yet.

  EVERY PROVIDER REPORTS WHETHER IT RAN. "Nothing here" is a claim about the
  platform, and making it at the moment the platform cannot be read is a false
  negative dressed as an answer (D99). When the pool could not be built, or
  every entity type a shelf holds failed to load, the shelf reports an error
  and offers a retry; the rest of the page is unaffected (D109).

  PRIVACY IS ENFORCED UNDERNEATH. The pool is read through the viewer's own
  client, so every post and profile policy (profile_shares) applies; history
  comes from functions that answer for auth.uid() only; social proof is counts
  only (D155). A reason is shown only when the ranking feature behind it
  crossed its threshold.
*/

export const EXPLORE = {
  /* How many rows Continue exploring shows when it falls back to history. */
  RECENT: 6,
} as const;

export type ExploreContext = {
  tab: ExploreTab;
  signedIn: boolean;
  viewerId: string | null;
};

/* Which entity types a tab narrows every shelf to. Topics are topics and
   categories, the two real taxonomies. */
const TAB_TYPES: Record<ExploreTab, string | null> = {
  all: null,
  tools: "tool",
  models: "model",
  posts: "post",
  people: "person",
  topics: "topic,category",
  videos: "video",
};

export function exploreFor(ctx: ExploreContext): Promise<ExploreResult | null> {
  return getExplore(ctx.signedIn, ctx.viewerId, TAB_TYPES[ctx.tab]);
}

const reader = cache(async (signedIn: boolean) => readerFor(signedIn));

/* ---------------------------------------------------------------------------
   explore_v1 to the page's shapes
   --------------------------------------------------------------------------- */

function topicOf(result: ExploreResult, s: ExploreScored): ExploreTopic | null {
  const c = s.candidate;
  if (c.entityType === "topic") {
    const t = result.pool.topics.get(c.refId);
    if (!t) return null;
    return {
      taxonomy: "topic",
      slug: t.slug,
      name: t.name,
      description: t.description,
      count: result.pool.topicPostCounts.get(t.id) ?? 0,
      countNoun: "posts",
      href: `/community/topic/${t.slug}`,
    };
  }
  const cat = result.pool.categories.get(c.refId);
  if (!cat) return null;
  return {
    taxonomy: "category",
    slug: cat.slug,
    name: cat.name,
    description: cat.description,
    /* Not shown: tool_categories also links tools still in review, so a count
       here could claim more than anybody can open. Null, never a wrong number. */
    count: null,
    countNoun: null,
    href: `/search?q=${encodeURIComponent(cat.name)}`,
  };
}

export function toExploreItem(
  result: ExploreResult,
  s: ExploreScored,
  section: RankedSectionId,
  position: number,
): ExploreItem | null {
  const c = s.candidate;
  const reason = s.reason ? explainExploreReason(s.reason) : null;
  const meta = {
    key: c.key,
    entityType: c.entityType,
    entityId: c.refId,
    section,
    position,
    reasonCode: s.reason?.code ?? null,
    source: s.primarySource,
  };
  switch (c.entityType) {
    case "tool": {
      const tool = result.pool.tools.get(c.refId);
      return tool ? { kind: "tool", id: tool.id, tool, reason, meta } : null;
    }
    case "model": {
      const model = result.pool.models.get(c.refId);
      return model ? { kind: "model", id: model.id, model, reason, meta } : null;
    }
    case "person": {
      const person = result.pool.people.get(c.refId);
      return person ? { kind: "person", id: person.id, person, reason, meta } : null;
    }
    case "post": {
      const post = result.pool.posts.get(c.refId);
      return post ? { kind: "post", id: post.id, post, reason, meta } : null;
    }
    case "video": {
      const post = result.pool.posts.get(c.refId);
      const video = post ? toVideoPosts([post])[0] : undefined;
      return video ? { kind: "video", id: video.id, post: video, reason, meta } : null;
    }
    case "topic":
    case "category": {
      const topic = topicOf(result, s);
      return topic ? { kind: "topic", id: `${topic.taxonomy}-${topic.slug}`, topic, reason, meta } : null;
    }
  }
}

async function rankedSection(ctx: ExploreContext, id: RankedSectionId): Promise<SectionState> {
  const result = await exploreFor(ctx);
  if (!result) return failed();
  const ranking = result.rankings.get(id);
  if (!ranking) return failed();

  /* Every type this shelf could hold failed to load: an error, not "empty". */
  const kind = TAB_KIND[ctx.tab];
  const types = SECTION_TYPES[id].filter((t) => {
    if (kind === null) return true;
    return kind === "topic" ? t === "topic" || t === "category" : t === kind;
  });
  if (types.length > 0 && types.every((t) => result.pool.failed.has(t))) return failed();

  const items = ranking.items
    .map((s, i) => toExploreItem(result, s, id, i))
    .filter((x): x is ExploreItem => x !== null);
  if (items.length === 0) return { ...empty(), note: ranking.note };
  /* The heading's subtitle has to follow the tab or it states something false:
     on the Tools tab, New holds only tools. */
  return ok(items, { reason: id === "new-and-recent" && kind !== null ? NEW_SUBTITLE[kind] : null });
}

const NEW_SUBTITLE: Record<NonNullable<(typeof TAB_KIND)[ExploreTab]>, string> = {
  tool: "The latest tools added to the catalogue.",
  model: "The latest models added to the catalogue.",
  post: "The latest posts from the community.",
  person: "People who joined Celpare recently.",
  topic: "The latest across Celpare.",
  video: "The latest videos from the community.",
};

export const loadForYou = (ctx: ExploreContext) => rankedSection(ctx, "for-you");
export const loadTrending = (ctx: ExploreContext) => rankedSection(ctx, "trending");
export const loadRising = (ctx: ExploreContext) => rankedSection(ctx, "rising");
export const loadNewAndRecent = (ctx: ExploreContext) => rankedSection(ctx, "new-and-recent");
export const loadRecommendedTools = (ctx: ExploreContext) => rankedSection(ctx, "recommended-tools");
export const loadRecommendedModels = (ctx: ExploreContext) => rankedSection(ctx, "recommended-models");
export const loadPeople = (ctx: ExploreContext) => rankedSection(ctx, "people");
export const loadDiscussions = (ctx: ExploreContext) => rankedSection(ctx, "discussions");
export const loadVideos = (ctx: ExploreContext) => rankedSection(ctx, "videos");
export const loadTopics = (ctx: ExploreContext) => rankedSection(ctx, "topics");

/* The shelf order for the All tab (D156). Registry order when ranking failed. */
export async function loadSectionOrder(ctx: ExploreContext): Promise<RankedSectionId[] | null> {
  const result = await exploreFor(ctx);
  return result ? result.order : null;
}

/* ---------------------------------------------------------------------------
   Featured
   --------------------------------------------------------------------------- */

/*
  What an administrator put in content.featured_tools and content.featured_models.

  THIS SECTION EXISTS BECAUSE REMOVING IT WOULD HAVE BEEN A REGRESSION. Those two
  settings sat unread through the whole of Phase 4P, so featuring a tool featured
  it nowhere, and 4P gave them a surface on the old /explore. Replacing that page
  without carrying this over would have put the setting straight back to meaning
  nothing, and nothing in the admin dashboard would have said so.

  IT IS THE ONE SHELF ON THIS PAGE THAT IS NOT DERIVED FROM DATA. Every other
  section comes from a count, a date or a ranker; this one is an editorial pick,
  and the subtitle says exactly that rather than letting it read as a ranking.

  Slugs resolve against approved rows only, so featuring something and then
  suspending it removes it from here with no second action. Nothing is rendered
  when nobody has featured anything, which is the same choice the shelf it
  replaces made: a heading over an empty strip implies there should be something
  on it, and D30 rules out inventing a filler row.
*/
export async function loadFeatured(ctx: ExploreContext): Promise<SectionState> {
  const kind = TAB_KIND[ctx.tab];

  try {
    const db = await reader(ctx.signedIn);

    const [toolSlugs, modelSlugs] = await Promise.all([
      kind === null || kind === "tool" ? getFeatured("tools") : Promise.resolve([]),
      kind === null || kind === "model" ? getFeatured("models") : Promise.resolve([]),
    ]);

    if (toolSlugs.length === 0 && modelSlugs.length === 0) return empty();

    const [toolRows, modelRows] = await Promise.all([
      toolSlugs.length > 0
        ? db
            .from("tools")
            .select(TOOL_ROW_COLUMNS)
            .in("slug", toolSlugs)
            .eq("status", "approved")
        : null,
      modelSlugs.length > 0
        ? db
            .from("models")
            .select(MODEL_ROW_COLUMNS)
            .in("slug", modelSlugs)
            .eq("status", "approved")
        : null,
    ]);

    const items: ExploreItem[] = [];

    /* Back into the order the administrator chose. `in` does not preserve it,
       and the order is the point of an ordered list. */
    const toolAt = position(toolSlugs);
    for (const tool of rowsOf(toolRows)
      .map((r) => toolFromRow(r, "featured"))
      .sort((a, b) => toolAt(a.slug) - toolAt(b.slug))) {
      items.push({ kind: "tool", id: tool.id, tool, reason: null });
    }

    const modelAt = position(modelSlugs);
    for (const model of rowsOf(modelRows)
      .map((r) => modelFromRow(r, "featured"))
      .sort((a, b) => modelAt(a.slug) - modelAt(b.slug))) {
      items.push({ kind: "model", id: model.id, model, reason: null });
    }

    return ok(items);
  } catch (error) {
    console.error("[explore] featured failed", error);
    return failed();
  }
}

function position(slugs: string[]): (slug: string) => number {
  const at = new Map(slugs.map((slug, i) => [slug.toLowerCase(), i]));
  return (slug: string) => at.get(slug.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
}

/*
  Which of these people follow the VIEWER (4BA), for Follow back and Friends.
  Through my_follow_state, which answers only about edges touching the caller.
*/
export async function loadFollowsMe(
  viewerId: string | null,
  personIds: string[],
): Promise<Set<string>> {
  if (!viewerId || personIds.length === 0 || !isSupabaseConfigured()) {
    return new Set<string>();
  }
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("my_follow_state", { p_ids: personIds });
    if (error) {
      console.error("[explore] follows me failed", error.code, error.message);
      return new Set<string>();
    }
    return new Set(
      ((data ?? []) as { id: string; follows_me: boolean }[])
        .filter((r) => r.follows_me)
        .map((r) => r.id),
    );
  } catch {
    return new Set<string>();
  }
}

/*
  Which of these people the viewer already follows, so a Follow button renders
  the right way round on arrival rather than flickering after hydration.

  The viewer's OWN follow rows and nobody else's: follows_select_all lets a
  person read rows where they are the follower, so this is their data by
  construction. Empty when signed out, which is also what the policy returns.
*/
export async function loadFollowing(
  viewerId: string | null,
  personIds: string[],
): Promise<Set<string>> {
  if (!viewerId || personIds.length === 0 || !isSupabaseConfigured()) {
    return new Set<string>();
  }

  try {
    const db = await createClient();
    const { data, error } = await db
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId)
      .in("following_id", personIds);

    if (error) {
      console.error("[explore] following failed", error.code, error.message);
      return new Set<string>();
    }
    return new Set(
      (data ?? []).map((r) => (r as { following_id: string }).following_id),
    );
  } catch (error) {
    console.error("[explore] following failed", error);
    return new Set<string>();
  }
}

/*
  Which of the things on screen the viewer has already filed into a collection,
  so a bookmark renders filled on arrival rather than flipping after hydration.

  THE VIEWER'S OWN ROWS AND NOBODY ELSE'S. `saves` has no cross user select
  policy at all, so the only rows that can come back are theirs, and asking for
  them by id keeps that explicit rather than relying on the policy to trim a
  wider request. getViewerState makes the same call for posts and this is the
  same read for tools and models, which is why it is a read and not a second
  save system: saving still happens in one place, the collection picker.
*/
export async function loadSaved(
  viewerId: string | null,
  entityType: SaveEntity,
  ids: string[],
): Promise<Set<string>> {
  if (!viewerId || ids.length === 0 || !isSupabaseConfigured()) {
    return new Set<string>();
  }

  try {
    const db = await createClient();
    const { data, error } = await db
      .from("saves")
      .select("entity_id")
      .eq("user_id", viewerId)
      .eq("entity_type", entityType)
      .in("entity_id", ids);

    if (error) {
      console.error("[explore] saves failed", error.code, error.message);
      return new Set<string>();
    }
    return new Set(
      (data ?? []).map((r) => (r as { entity_id: string }).entity_id),
    );
  } catch (error) {
    console.error("[explore] saves failed", error);
    return new Set<string>();
  }
}

/* ---------------------------------------------------------------------------
   Continue exploring
   --------------------------------------------------------------------------- */

/*
  Where you were: the searches you ran and the tools you opened.

  my_recent_activity is SECURITY DEFINER, takes no id and answers only for
  auth.uid(), so there is no way to ask it for somebody else's history and no
  setting anywhere publishes it. D85 made recent activity private permanently,
  and putting it on a public surface does not change that: a signed out visitor
  gets nothing, because the function returns nothing for them.

  It is the last section on the page for the same reason: it is the only one that
  is about you rather than about Celpare.
*/
async function loadRecentActivity(
  ctx: ExploreContext,
): Promise<SectionState<RecentRow>> {
  if (!ctx.signedIn || !ctx.viewerId || !isSupabaseConfigured()) {
    return empty<RecentRow>();
  }

  try {
    const db = await createClient();
    const { data, error } = await db.rpc("my_recent_activity", {
      p_limit: EXPLORE.RECENT,
    });

    if (error) {
      console.error("[explore] recent failed", error.code, error.message);
      return failed<RecentRow>();
    }

    return ok<RecentRow>((data as RecentRow[] | null) ?? []);
  } catch (error) {
    console.error("[explore] recent failed", error);
    return failed<RecentRow>();
  }
}

/*
  Continue exploring (brief section 28): the discovery journey when there is
  one, from explore_v1's seeds (what this person opened on Explore in this
  sitting, or this week). With nothing explored yet it is the recent activity
  list above, which is what this section showed before explore_v1.
*/
export type ContinueState =
  | { mode: "journey"; state: SectionState }
  | { mode: "recent"; state: SectionState<RecentRow> };

export async function loadContinueExploring(ctx: ExploreContext): Promise<ContinueState> {
  if (ctx.signedIn && ctx.viewerId) {
    const journey = await rankedSection(ctx, "continue-exploring");
    if (journey.status === "ok") return { mode: "journey", state: journey };
  }
  return { mode: "recent", state: await loadRecentActivity(ctx) };
}

/* ---------------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------------- */

type Result = { data: unknown; error: { code?: string; message?: string } | null };

/* An arm that was skipped for this tab, or that failed, contributes nothing.
   One table being unreadable shortens a mixed shelf rather than emptying it. */
function rowsOf(result: Result | null): Record<string, unknown>[] {
  if (!result || result.error) return [];
  return (result.data as Record<string, unknown>[] | null) ?? [];
}
