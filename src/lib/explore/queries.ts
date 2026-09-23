import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  POST_SELECT,
  normalisePost,
  readerFor,
  type FeedPost,
  type Topic,
} from "@/lib/community/queries";
import { RANKING, interleaveAuthors, scoreOf } from "@/lib/community/ranking";
import { toVideoPosts, type VideoPost } from "@/lib/community/video";
import { loadRecommendations } from "@/lib/search/recommendations";
import { getFeatured } from "@/lib/platform/settings";
import {
  MODEL_ROW_COLUMNS,
  TOOL_ROW_COLUMNS,
  modelFromRow,
  personFromRow,
  toolFromRow,
} from "@/lib/search/rows";
import type { RecentRow } from "@/lib/profile/queries";
import type { SaveEntity } from "@/lib/collections/types";
import type {
  ExploreTab,
  ExploreItem,
  ExploreItemKind,
  ExploreTopic,
  SectionState,
} from "./types";
import { TAB_KIND, empty, failed, ok, pending } from "./types";

/*
  Every Explore read.

  WHAT THIS FILE IS NOT. It is not a ranker, not a recommender, not a trending
  score and not a personalisation model. Section 24 of the brief rules all of
  those out, and the reason it gives is the right one: a placeholder score
  written now becomes the permanent architecture by accident. So nothing here
  computes a number that decides what is interesting.

  WHAT IT DOES INSTEAD. Retrieval, and only retrieval, against the systems that
  already exist. Recommended tools, models and people are the SHIPPED
  recommendation pass from search, called rather than reimplemented. Discussions
  are the SHIPPED feed ranker from D29, applied to a candidate window the same
  way /community applies it. New and recently added is recency, which is a fact
  about a row rather than a judgement about it. For you, Trending and Rising have
  no provider at all and say so.

  EVERY PROVIDER REPORTS WHETHER IT RAN. "Nothing here" is a claim about the
  platform, and making it at the moment the platform cannot be read is a false
  negative dressed as an answer. That is D99, learned on /search when the
  connection dropped and the page answered 200 with No results. Here it is per
  section rather than per page: a section that fails reports `error` and offers a
  retry, and the ten around it are unaffected.

  IT READS THROUGH readerFor, so a signed out visitor gets exactly what anon's
  policies allow. Explore is public in the same way the feed (D32) and search
  are, and nothing on this surface is widened for it. Privacy is enforced
  underneath: every post and profile select policy already calls
  profile_shares(), so a query written here inherits it and none of these
  re-implements it.
*/

export const EXPLORE = {
  /* How many cards a horizontal shelf holds. Small on purpose: a shelf is a
     sample of a section, not the section. */
  SHELF: 8,
  /* How many posts the Discussions list shows. */
  DISCUSSIONS: 6,
  /* How many rows Continue exploring shows. */
  RECENT: 6,
  /* The candidate window for Discussions, before the feed's own ranker orders
     it. The same window /community uses, so the two cannot disagree about what
     was eligible. */
  DISCUSSION_WINDOW: RANKING.CANDIDATE_WINDOW,
  /* Per type cap inside New and recently added, so one busy table cannot fill a
     mixed shelf. Section 26: the surface must support diversity even though
     nothing ranks for it yet. */
  NEW_PER_KIND: 3,
} as const;

/* How many suggestions to pull before re-sorting them by join date. Wider than
   the cap, because suggested_people orders by follower count and the newest
   account is not usually the most followed one. */
const NEW_PEOPLE_POOL = 20;

/* What the section is when a tab has narrowed it. */
const NEW_SUBTITLE: Record<ExploreItemKind, string> = {
  tool: "The latest tools added to the catalogue.",
  model: "The latest models added to the catalogue.",
  post: "The latest posts from the community.",
  person: "People who joined Celpare recently.",
  topic: "The latest across Celpare.",
  video: "The latest posts from the community.",
};

export type ExploreContext = {
  tab: ExploreTab;
  signedIn: boolean;
  viewerId: string | null;
};

/* ---------------------------------------------------------------------------
   Shared reads, deduplicated across sections.

   Three sections read the recommendation pass and two read a Supabase client.
   React's cache() collapses those to one call each per render, which is what
   keeps a dozen independently streamed sections from becoming a dozen times the
   queries. It is per request, so nothing is shared between two people.
   --------------------------------------------------------------------------- */

const recommendations = cache(
  async (signedIn: boolean, viewerId: string | null) =>
    loadRecommendations({ signedIn, viewerId }),
);

const reader = cache(async (signedIn: boolean) => readerFor(signedIn));

/* ---------------------------------------------------------------------------
   The three that have no provider yet.

   They are REAL SECTIONS with a real place in the order and no contents, not
   stubs to be deleted. The day a ranker exists, each one's body is replaced and
   nothing above or below it changes. Rendering them rather than hiding them is
   deliberate: hiding would leave the page silently missing the three things the
   brief puts first, and there would be no way to see that the seam is there.
   --------------------------------------------------------------------------- */

export async function loadForYou(): Promise<SectionState> {
  return pending(
    "Celpare is still learning what you might like. This fills in once the Explore ranking layer is built.",
  );
}

export async function loadTrending(): Promise<SectionState> {
  return pending(
    "Nothing is trending yet. Trending needs a momentum score across likes, saves and views, which is not built.",
  );
}

export async function loadRising(): Promise<SectionState> {
  return pending(
    "Nothing is rising yet. Rising measures acceleration rather than totals, and that needs the same ranking layer.",
  );
}

/* ---------------------------------------------------------------------------
   New and recently added
   --------------------------------------------------------------------------- */

/*
  Recency is a FACT about a row, which is why this one can be built now and
  Trending cannot: newest is not a judgement about what is worth seeing.

  It is not a dump of the newest rows either, which section 8 explicitly warns
  against. Four tables are read in parallel, each capped, and the survivors are
  merged by their own timestamps. So a week where somebody added twenty tools
  still leaves room for the new model, the new person and the new post.

  A TOOL IS DATED BY published_at, NOT created_at. A submission sits in review
  for days, so the row is old by the time anybody can see it, and dating it by
  when it was written would file a brand new listing behind things people have
  already seen. Falls back to created_at for the seeded rows, which have no
  publication date because nothing published them.
*/
export async function loadNewAndRecent(ctx: ExploreContext): Promise<SectionState> {
  const kind = TAB_KIND[ctx.tab];

  try {
    const db = await reader(ctx.signedIn);

    const wants = (k: string) => kind === null || kind === k;
    const cap = EXPLORE.NEW_PER_KIND;

    const [tools, models, posts, people] = await Promise.all([
      wants("tool")
        ? db
            .from("tools")
            .select(TOOL_ROW_COLUMNS)
            .eq("status", "approved")
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(cap)
        : null,
      wants("model")
        ? db
            .from("models")
            .select(MODEL_ROW_COLUMNS)
            .eq("status", "approved")
            .order("created_at", { ascending: false })
            .limit(cap)
        : null,
      wants("post") || wants("video")
        ? db
            .from("posts")
            .select(POST_SELECT)
            .eq("status", "visible")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(cap)
        : null,
      /*
        PEOPLE COME THROUGH suggested_people, NOT OFF THE profiles TABLE.

        The first version of this read profiles directly and filtered
        account_status = 'active'. It returned NOTHING for a signed out visitor
        and nobody noticed, because `account_status` IS NOT IN THE anon SELECT
        GRANT: the filter referenced a column anon cannot see, PostgREST refused
        the request, and a refused arm contributes an empty list exactly like an
        arm with no rows. Found by running the page as anon and seeing the one
        populated shelf come back empty on the People tab.

        It could not be fixed by dropping the filter either. profiles_select_public
        is `true` for both roles, so RLS does not hide a suspended account: the
        status column being ungranted is the ONLY thing keeping it out of anon's
        reach, and a query that cannot read the column cannot exclude the account.
        Dropping the filter would have published suspended accounts on a
        discovery shelf.

        suggested_people is SECURITY DEFINER, already excludes suspended accounts
        and accounts with nothing to show, and already excludes the caller and
        anybody they follow. It orders by follower count, so the newest are taken
        from a wider window and re-sorted by the caller. One existing function
        rather than a new one, and the suspension rule stays in the single place
        that owns it.
      */
      wants("person")
        ? db.rpc("suggested_people", { p_limit: NEW_PEOPLE_POOL })
        : null,
    ]);

    const dated: { at: string; item: ExploreItem }[] = [];

    for (const r of rowsOf(tools)) {
      const tool = toolFromRow(r, "new");
      dated.push({
        at: tool.publishedAt ?? tool.createdAt,
        item: { kind: "tool", id: tool.id, tool, reason: null },
      });
    }

    for (const r of rowsOf(models)) {
      const model = modelFromRow(r, "new");
      dated.push({
        at: model.createdAt,
        item: { kind: "model", id: model.id, model, reason: null },
      });
    }

    for (const row of postRowsOf(posts)) {
      const post = normalisePost(row);
      dated.push({
        at: post.created_at,
        item: { kind: "post", id: post.id, post, reason: null },
      });
    }

    /* Newest first, then capped, because suggested_people orders by follower
       count and this section is about recency. */
    const newPeople = rowsOf(people)
      .map((r) => personFromRow(r, "new"))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, cap);

    for (const person of newPeople) {
      dated.push({
        at: person.createdAt,
        item: { kind: "person", id: person.id, person, reason: null },
      });
    }

    dated.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    /*
      The heading's subtitle has to follow the tab or it states something false.
      On the Tools tab this section holds only tools, and the registry's
      "The latest across tools, models, people and posts" would then be a
      sentence about a shelf that is not there. Seen in the rendered HTML.
    */
    return ok(
      dated.slice(0, EXPLORE.SHELF).map((d) => d.item),
      { reason: kind === null ? null : NEW_SUBTITLE[kind] },
    );
  } catch (error) {
    console.error("[explore] new and recent failed", error);
    return failed();
  }
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

/* ---------------------------------------------------------------------------
   Recommendations, from the pass search already ships
   --------------------------------------------------------------------------- */

export async function loadRecommendedTools(ctx: ExploreContext): Promise<SectionState> {
  try {
    const { tools } = await recommendations(ctx.signedIn, ctx.viewerId);
    return ok(
      tools.map((s) => ({
        kind: "tool" as const,
        id: s.candidate.id,
        tool: s.candidate,
        /* The ranker's own reason, when it produced one. Never written here:
           section 27 forbids the UI inventing a reason the backend did not
           give. */
        reason: s.reason,
      })),
    );
  } catch (error) {
    console.error("[explore] recommended tools failed", error);
    return failed();
  }
}

export async function loadRecommendedModels(ctx: ExploreContext): Promise<SectionState> {
  try {
    const { models } = await recommendations(ctx.signedIn, ctx.viewerId);
    return ok(
      models.map((s) => ({
        kind: "model" as const,
        id: s.candidate.id,
        model: s.candidate,
        reason: s.reason,
      })),
    );
  } catch (error) {
    console.error("[explore] recommended models failed", error);
    return failed();
  }
}

/*
  People.

  suggested_people already excludes the caller and anybody they follow, so every
  row here is somebody they do not: a suggestion you have already acted on is a
  wasted row. It is SECURITY DEFINER and answers for auth.uid(), so a signed out
  visitor gets the same public list with no personalisation.
*/
export async function loadPeople(ctx: ExploreContext): Promise<SectionState> {
  try {
    const { people } = await recommendations(ctx.signedIn, ctx.viewerId);
    return ok(
      people.map((person) => ({
        kind: "person" as const,
        id: person.id,
        person,
        reason: null,
      })),
    );
  } catch (error) {
    console.error("[explore] people failed", error);
    return failed();
  }
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
   Discussions
   --------------------------------------------------------------------------- */

/*
  The community's own conversations, ordered by the feed's OWN ranker.

  D29 is time decayed engagement with the weights in one file, and this imports
  that file rather than forming a second opinion about what a popular post is.

  Section 23 is the constraint that shapes the rest: Explore must not simply be
  the feed. So this takes the ranked window and drops the authors the viewer
  already follows, because those posts are what /community shows them. What is
  left is the part of the community they are not already seeing, which is what
  discovery means.
*/
export async function loadDiscussions(ctx: ExploreContext): Promise<SectionState> {
  try {
    const db = await reader(ctx.signedIn);

    const [result, followed] = await Promise.all([
      db
        .from("posts")
        .select(POST_SELECT)
        .eq("status", "visible")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(EXPLORE.DISCUSSION_WINDOW),
      followedAuthors(ctx.viewerId),
    ]);

    if (result.error) {
      console.error(
        "[explore] discussions failed",
        result.error.code,
        result.error.message,
      );
      return failed();
    }

    const rows = postRowsOf(result).map(normalisePost);

    /*
      Somebody you follow is not a discovery, so their posts come out. Dropped
      rather than pushed down, because the feed already shows them and a
      duplicate is worse than a shorter shelf.

      UNLESS THAT EMPTIES IT. With two accounts, following the only other person
      would leave this permanently blank while visible posts exist, which is a
      false statement about the community. So the filter applies only when
      something survives it.
    */
    const discovery = rows.filter((p) => !followed.has(p.author_id));
    const pool = discovery.length > 0 ? discovery : rows;

    const now = Date.now();
    const ranked = [...pool].sort((a, b) => scoreOf(b, now) - scoreOf(a, now));

    return ok(
      interleaveAuthors(ranked)
        .slice(0, EXPLORE.DISCUSSIONS)
        .map((post) => ({
          kind: "post" as const,
          id: post.id,
          post,
          reason: null,
        })),
    );
  } catch (error) {
    console.error("[explore] discussions failed", error);
    return failed();
  }
}

async function followedAuthors(viewerId: string | null): Promise<Set<string>> {
  if (!viewerId || !isSupabaseConfigured()) return new Set<string>();

  try {
    const db = await createClient();
    const { data, error } = await db
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerId);

    if (error) return new Set<string>();
    return new Set(
      (data ?? []).map((r) => (r as { following_id: string }).following_id),
    );
  } catch {
    return new Set<string>();
  }
}

/* ---------------------------------------------------------------------------
   Videos
   --------------------------------------------------------------------------- */

/*
  The list only. The viewer, the player, the analytics and every action on a
  video are the ones Phase 4AO built, reached at /community/video/[id], and
  section 14 is explicit that Explore decides the entry and nothing else.

  An inner join on post_media, so a post with four images never crosses the wire
  to be discarded here. The same query shape as lib/community/video.ts, which is
  the file that owns this idea, built from the same POST_SELECT so the two
  cannot disagree about which columns a post has.
*/
export async function loadVideos(ctx: ExploreContext): Promise<SectionState> {
  try {
    const db = await reader(ctx.signedIn);

    const { data, error } = await db
      .from("posts")
      .select(POST_SELECT.replace("media:post_media(", "media:post_media!inner("))
      .eq("status", "visible")
      .is("deleted_at", null)
      .eq("post_media.media_kind", "video")
      .order("created_at", { ascending: false })
      .limit(EXPLORE.SHELF);

    if (error) {
      console.error("[explore] videos failed", error.code, error.message);
      return failed();
    }

    const videos: VideoPost[] = toVideoPosts(
      ((data as unknown as FeedPost[]) ?? []).map(normalisePost),
    );

    return ok(
      videos.map((post) => ({
        kind: "video" as const,
        id: post.id,
        post,
        reason: null,
      })),
    );
  } catch (error) {
    console.error("[explore] videos failed", error);
    return failed();
  }
}

/* ---------------------------------------------------------------------------
   Topics and categories
   --------------------------------------------------------------------------- */

/*
  BOTH REAL TAXONOMIES, AND NO THIRD ONE.

  Section 12 lists example topics and says to reuse the existing taxonomy. There
  are two: `topics`, which is what a post is filed under, and `categories`, which
  is what a tool is filed under. They are not the same list, and merging them
  would invent a taxonomy that matches neither table, so both are shown, each
  with its own count and its own destination.

  A topic goes to /community/topic/[slug], which exists. A category goes to a
  search for its name, which is what the search empty state already does, because
  there is no browse-by-category route to send it to and a link that goes nowhere
  is defect F4.

  THE COUNTS ARE REAL COUNTS. A head count per topic, never an estimate. A topic
  with no posts shows zero, which is true, and it is still listed, because the
  topic exists whether or not anybody has used it yet.
*/
export async function loadTopics(ctx: ExploreContext): Promise<SectionState> {
  try {
    const db = await reader(ctx.signedIn);

    const [topicRows, categoryRows] = await Promise.all([
      db
        .from("topics")
        .select("id, slug, name, description")
        .order("sort_order", { ascending: true }),
      db
        .from("categories")
        .select("slug, name, description")
        .order("sort_order", { ascending: true }),
    ]);

    /* Both arms down is a failure. One arm down is a shorter list, which is the
       trade every multi source read on this project makes. */
    if (topicRows.error && categoryRows.error) {
      console.error(
        "[explore] topics failed",
        topicRows.error.code,
        topicRows.error.message,
      );
      return failed();
    }

    const topics = (topicRows.data as Topic[] | null) ?? [];
    const categories =
      (categoryRows.data as
        | { slug: string; name: string; description: string | null }[]
        | null) ?? [];

    const counts = await topicPostCounts(
      db,
      topics.map((t) => t.id),
    );

    const items: ExploreItem[] = [];

    for (const t of topics) {
      const topic: ExploreTopic = {
        taxonomy: "topic",
        slug: t.slug,
        name: t.name,
        description: t.description,
        count: counts.get(t.id) ?? 0,
        countNoun: "posts",
        href: `/community/topic/${t.slug}`,
      };
      items.push({ kind: "topic", id: `topic-${t.slug}`, topic, reason: null });
    }

    for (const c of categories) {
      const topic: ExploreTopic = {
        taxonomy: "category",
        slug: c.slug,
        name: c.name,
        description: c.description,
        /* Not counted. A count per category needs a join per row, and the number
           is not what somebody is deciding on here. Null rather than 0, because
           0 would be a false statement about a category that has tools in it. */
        count: null,
        countNoun: null,
        href: `/search?q=${encodeURIComponent(c.name)}`,
      };
      items.push({ kind: "topic", id: `category-${c.slug}`, topic, reason: null });
    }

    return ok(items);
  } catch (error) {
    console.error("[explore] topics failed", error);
    return failed();
  }
}

/*
  How many visible posts each topic has.

  One head count per topic. Eleven small counts rather than one grouped query,
  because PostgREST has no group by and the alternative is an RPC, which is a
  database change this task does not need. They run in parallel and none of them
  returns a row.
*/
async function topicPostCounts(
  db: SupabaseClient,
  topicIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (topicIds.length === 0) return out;

  const results = await Promise.all(
    topicIds.map((id) =>
      db
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("topic_id", id)
        .eq("status", "visible")
        .is("deleted_at", null),
    ),
  );

  topicIds.forEach((id, i) => {
    const r = results[i];
    if (r && !r.error) out.set(id, r.count ?? 0);
  });

  return out;
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
export async function loadContinueExploring(
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

function postRowsOf(result: Result | null): FeedPost[] {
  if (!result || result.error) return [];
  return (result.data as unknown as FeedPost[] | null) ?? [];
}
