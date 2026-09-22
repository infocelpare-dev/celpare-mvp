import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { EMPTY_VIEWER_STATE, getViewerState } from "@/lib/community/queries";
import { PostCard } from "@/components/community/post-card";
import { RecentList } from "@/components/profile/recent-list";
import { ExploreSection, Grid, Rows, Shelf } from "./section";
import { ExploreItemCard, type ItemViewer } from "./item";
import {
  loadContinueExploring,
  loadDiscussions,
  loadFeatured,
  loadFollowing,
  loadForYou,
  loadNewAndRecent,
  loadPeople,
  loadRecommendedModels,
  loadRecommendedTools,
  loadRising,
  loadSaved,
  loadTopics,
  loadTrending,
  loadVideos,
  type ExploreContext,
} from "@/lib/explore/queries";
import { EXPLORE_SECTIONS, type ExploreSectionId } from "@/lib/explore/sections";
import type { ExploreItem, SectionState } from "@/lib/explore/types";

/*
  The twelve Explore sections.

  EACH ONE LOADS ITS OWN DATA. They are async server components, and the page
  wraps each in its own Suspense boundary, so a slow section streams in on its
  own and a failed section cannot take the page with it. That is sections 28, 30
  and 33 in one decision: the header and the tabs paint immediately, the
  sections arrive as they are ready, and one failure is one failed shelf.

  NONE OF THEM DECIDES WHAT IS WORTH SHOWING. Every ordering on this page comes
  from a provider in lib/explore/queries.ts, and every provider either reuses a
  ranker that already shipped or reports that it has none. Nothing in this file
  sorts, scores or filters, which is what keeps a UI change from becoming a
  ranking change.

  THE EMPTY TEXT IS PER SECTION AND IT STATES SOMETHING TRUE. "No discussions to
  explore yet" is a fact about the community; a shared "Nothing here" would be
  the same sentence in a dozen places carrying no information.
*/

function def(id: ExploreSectionId) {
  const found = EXPLORE_SECTIONS.find((s) => s.id === id);
  /* The registry is the source of the order AND of the titles, so a section
     rendered without an entry in it would be a section nothing can reorder. */
  if (!found) throw new Error(`[explore] no section definition for ${id}`);
  return found;
}

/* ---------------------------------------------------------------------------
   Viewer state for a set of items

   Built per section from the items that section actually loaded, so a shelf of
   eight cards costs at most three small reads of the viewer's OWN rows and a
   section that loaded nothing costs none. Every one of them is scoped to
   auth.uid() by policy, so none of this can return anybody else's saves,
   follows or likes.
   --------------------------------------------------------------------------- */

async function viewerFor(
  items: ExploreItem[],
  ctx: ExploreContext,
): Promise<ItemViewer> {
  const base: ItemViewer = {
    signedIn: ctx.signedIn,
    viewerId: ctx.viewerId,
    savedTools: new Set<string>(),
    savedModels: new Set<string>(),
    following: new Set<string>(),
    posts: EMPTY_VIEWER_STATE,
  };

  if (!ctx.signedIn || !ctx.viewerId || !isSupabaseConfigured()) return base;

  const toolIds = items.filter((i) => i.kind === "tool").map((i) => i.tool.id);
  const modelIds = items.filter((i) => i.kind === "model").map((i) => i.model.id);
  const personIds = items.filter((i) => i.kind === "person").map((i) => i.person.id);
  const postIds = items
    .filter((i) => i.kind === "post" || i.kind === "video")
    .map((i) => i.id);

  const [savedTools, savedModels, following, posts] = await Promise.all([
    loadSaved(ctx.viewerId, "tool", toolIds),
    loadSaved(ctx.viewerId, "model", modelIds),
    loadFollowing(ctx.viewerId, personIds),
    postIds.length > 0
      ? getViewerState(await createClient(), ctx.viewerId, postIds)
      : Promise.resolve(EMPTY_VIEWER_STATE),
  ]);

  return { ...base, savedTools, savedModels, following, posts };
}

/* A shelf of mixed or single kind items, which is what most sections are. */
async function ItemShelf({
  id,
  state,
  ctx,
  emptyText,
}: {
  id: ExploreSectionId;
  state: SectionState;
  ctx: ExploreContext;
  emptyText: string;
}) {
  const d = def(id);
  const viewer = await viewerFor(state.items, ctx);

  return (
    <ExploreSection
      def={d}
      status={state.status}
      reason={state.reason}
      note={state.note}
      emptyText={emptyText}
    >
      <Shelf label={d.title}>
        {state.items.map((item, i) => (
          <ExploreItemCard key={item.id} item={item} viewer={viewer} index={i} />
        ))}
      </Shelf>
    </ExploreSection>
  );
}

/* ---------------------------------------------------------------------------
   The three awaiting the ranking layer
   --------------------------------------------------------------------------- */

export async function ForYouSection({ ctx }: { ctx: ExploreContext }) {
  return (
    <ItemShelf
      id="for-you"
      state={await loadForYou()}
      ctx={ctx}
      emptyText="Nothing to suggest yet."
    />
  );
}

export async function TrendingSection({ ctx }: { ctx: ExploreContext }) {
  return (
    <ItemShelf
      id="trending"
      state={await loadTrending()}
      ctx={ctx}
      emptyText="Nothing is trending yet."
    />
  );
}

export async function RisingSection({ ctx }: { ctx: ExploreContext }) {
  return (
    <ItemShelf
      id="rising"
      state={await loadRising()}
      ctx={ctx}
      emptyText="Nothing is gaining momentum yet."
    />
  );
}

/* ---------------------------------------------------------------------------
   The catalogue
   --------------------------------------------------------------------------- */

export async function NewAndRecentSection({ ctx }: { ctx: ExploreContext }) {
  return (
    <ItemShelf
      id="new-and-recent"
      state={await loadNewAndRecent(ctx)}
      ctx={ctx}
      emptyText="Nothing new has been added recently."
    />
  );
}

/*
  Featured.

  Renders nothing but its heading and one line when nobody has featured
  anything, which is the honest state of an optional editorial shelf rather than
  a defect. The section still appears, so the admin dashboard's Feature control
  has a visible destination whether or not it has been used.
*/
export async function FeaturedSection({ ctx }: { ctx: ExploreContext }) {
  return (
    <ItemShelf
      id="featured"
      state={await loadFeatured(ctx)}
      ctx={ctx}
      emptyText="Nothing is featured right now."
    />
  );
}

export async function RecommendedToolsSection({ ctx }: { ctx: ExploreContext }) {
  return (
    <ItemShelf
      id="recommended-tools"
      state={await loadRecommendedTools(ctx)}
      ctx={ctx}
      emptyText="No tools in the catalogue yet."
    />
  );
}

/*
  Models.

  The catalogue holds no models at all today, so this renders its empty state
  rather than a heading over a blank strip. That is the honest state of the
  catalogue and not a defect in this section: the moment a model is approved, the
  same component fills.
*/
export async function RecommendedModelsSection({ ctx }: { ctx: ExploreContext }) {
  return (
    <ItemShelf
      id="recommended-models"
      state={await loadRecommendedModels(ctx)}
      ctx={ctx}
      emptyText="No models in the catalogue yet. They arrive with the directory."
    />
  );
}

/* ---------------------------------------------------------------------------
   People
   --------------------------------------------------------------------------- */

export async function PeopleSection({ ctx }: { ctx: ExploreContext }) {
  return (
    <ItemShelf
      id="people"
      state={await loadPeople(ctx)}
      ctx={ctx}
      /* Empty means everybody eligible is already followed, or there is nobody
         else yet. Both are true statements and the sentence covers both without
         claiming which. */
      emptyText="Nobody new to suggest right now."
    />
  );
}

/* ---------------------------------------------------------------------------
   Discussions
   --------------------------------------------------------------------------- */

/*
  Posts are FULL WIDTH, not a shelf.

  A discussion is something you read, so a horizontal row of 264px columns would
  be the wrong shape for the one section on this page made of sentences. It is
  also the section where Explore is closest to being the feed, and rendering it
  as a bounded list under its own heading is what keeps the difference visible.
*/
export async function DiscussionsSection({ ctx }: { ctx: ExploreContext }) {
  const d = def("discussions");
  const state = await loadDiscussions(ctx);
  const viewer = await viewerFor(state.items, ctx);

  return (
    <ExploreSection
      def={d}
      status={state.status}
      reason={state.reason}
      note={state.note}
      emptyText="No discussions to explore yet. The community is new."
    >
      <Rows
        label={d.title}
        className="overflow-hidden rounded-2xl border border-border"
      >
        {state.items.map((item) =>
          item.kind === "post" ? (
            <li key={item.id} className="last:[&>article]:border-b-0">
              <PostCard
                post={item.post}
                viewer={viewer.posts}
                signedIn={ctx.signedIn}
              />
            </li>
          ) : null,
        )}
      </Rows>
    </ExploreSection>
  );
}

/* ---------------------------------------------------------------------------
   Topics
   --------------------------------------------------------------------------- */

export async function TopicsSection({ ctx }: { ctx: ExploreContext }) {
  const d = def("topics");
  const state = await loadTopics(ctx);

  return (
    <ExploreSection
      def={d}
      status={state.status}
      reason={state.reason}
      note={state.note}
      emptyText="No topics yet."
    >
      <Grid label={d.title}>
        {state.items.map((item) =>
          item.kind === "topic" ? (
            <ExploreItemCard
              key={item.id}
              item={item}
              index={0}
              viewer={{
                signedIn: ctx.signedIn,
                viewerId: ctx.viewerId,
                savedTools: new Set<string>(),
                savedModels: new Set<string>(),
                following: new Set<string>(),
                posts: EMPTY_VIEWER_STATE,
              }}
            />
          ) : null,
        )}
      </Grid>
    </ExploreSection>
  );
}

/* ---------------------------------------------------------------------------
   Videos
   --------------------------------------------------------------------------- */

export async function VideoSection({ ctx }: { ctx: ExploreContext }) {
  return (
    <ItemShelf
      id="videos"
      state={await loadVideos(ctx)}
      ctx={ctx}
      emptyText="No videos have been posted yet."
    />
  );
}

/* ---------------------------------------------------------------------------
   Continue exploring
   --------------------------------------------------------------------------- */

/*
  The one section that is about you rather than about Celpare, which is why it is
  last and why it says so under its heading.

  It renders RecentList, the same component /profile and the developer dashboard
  use. my_recent_activity answers only for auth.uid(), so a signed out visitor
  gets an empty state and there is no id anywhere in this path that could ask for
  somebody else's history. D85.
*/
export async function ContinueExploringSection({ ctx }: { ctx: ExploreContext }) {
  const d = def("continue-exploring");
  const state = await loadContinueExploring(ctx);

  return (
    <ExploreSection
      def={d}
      status={state.status}
      reason={state.reason}
      note={state.note}
      emptyText={
        ctx.signedIn
          ? "Nothing yet. Searches you run and tools you open show up here, for you alone."
          : "Sign in and the searches you run and the tools you open show up here, for you alone."
      }
    >
      <RecentList rows={state.items} />
    </ExploreSection>
  );
}
