import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { ExploreHeader } from "@/components/explore/explore-header";
import { ExploreTabs } from "@/components/explore/explore-tabs";
import { SectionSkeleton } from "@/components/explore/skeletons";
import { ExploreEnd } from "@/components/explore/explore-end";
import { CreatePostFab } from "@/components/community/create-post-fab";
import {
  ContinueExploringSection,
  DiscussionsSection,
  FeaturedSection,
  ForYouSection,
  NewAndRecentSection,
  PeopleSection,
  RecommendedModelsSection,
  RecommendedToolsSection,
  RisingSection,
  TopicsSection,
  TrendingSection,
  VideoSection,
} from "@/components/explore/sections";
import { sectionsForTab, type ExploreSectionId } from "@/lib/explore/sections";
import { isExploreTab, type ExploreTab } from "@/lib/explore/types";
import type { ExploreContext } from "@/lib/explore/queries";

/* Reads the session cookie, so it must never be prerendered. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore",
  description:
    "Discover AI tools, models, people, topics and what is happening across Celpare.",
};

/*
  CELPARE EXPLORE. One surface, and the only one.

  WHAT WAS HERE BEFORE. A heading, a featured shelf and ToolsShowcase, which is a
  HARDCODED list of eight categories with example tool names written for the
  marketing page in Phase 2, ending in "The full directory opens with early
  access". There are 53 approved tools and 8 real categories in the database now,
  so the page was showing a static placeholder over a real catalogue and telling
  a signed in person that the product they are using has not opened. All of it is
  replaced.

  THE THREE SURFACES, AND WHY THIS IS NOT THE OTHER TWO.
    Search  "I know what I want."     A query surface. /search.
    Feed    "Show me my people."      Follows and the community. /community.
    Explore "Show me what to find."   This.
  Section 22 and 23 draw those lines and this page respects both: the search
  field at the top is literally search's own component submitting to /search, and
  Discussions deliberately drops the authors the viewer already follows, because
  the feed is already showing them.

  THERE IS NO /trending, /discover, /recommendations, /suggestions OR /new.
  Section 21: they are sections of this page, reachable as tabs on this URL.
  Adding one later would split discovery across five surfaces that each have a
  third of the content.

  EVERY SECTION STREAMS ON ITS OWN. The header and the tabs render immediately,
  the first two sections come with the document, and the rest arrive inside their
  own Suspense boundaries as their queries finish. So a slow shelf delays itself
  and nothing else, which is section 28, and a failed one reports a failure
  rather than claiming the platform is empty, which is section 30 and D99.

  NO RANKING IS IMPLEMENTED HERE OR ANYWHERE UNDER IT. Section 24. For you,
  Trending and Rising are real sections with no provider yet and they say so in a
  sentence. Everything else is either a fact (recency, the taxonomy, your own
  recent activity) or a ranker that already shipped and is being called rather
  than rewritten.
*/

/* The registry gives the order and the titles; this gives the component. Both
   are keyed by the same id, so a section cannot be ordered without being
   renderable or renderable without being ordered. */
const COMPONENTS: Record<
  ExploreSectionId,
  (props: { ctx: ExploreContext }) => Promise<React.ReactElement>
> = {
  "for-you": ForYouSection,
  trending: TrendingSection,
  rising: RisingSection,
  "new-and-recent": NewAndRecentSection,
  featured: FeaturedSection,
  "recommended-tools": RecommendedToolsSection,
  "recommended-models": RecommendedModelsSection,
  people: PeopleSection,
  discussions: DiscussionsSection,
  topics: TopicsSection,
  videos: VideoSection,
  "continue-exploring": ContinueExploringSection,
};

export default async function ExplorePage({
  searchParams,
}: PageProps<"/explore">) {
  const params = await searchParams;
  const requested = typeof params?.tab === "string" ? params.tab : undefined;
  /* An unknown tab is All rather than a 404. A tab is a filter, and a bad one in
     a shared link should land somebody on the page rather than on an error. */
  const tab: ExploreTab = isExploreTab(requested) ? requested : "all";

  let signedIn = false;
  let viewerId: string | null = null;

  if (isSupabaseConfigured()) {
    const user = await getCurrentUser();
    signedIn = Boolean(user);
    viewerId = user?.id ?? null;
  }

  const ctx: ExploreContext = { tab, signedIn, viewerId };
  const sections = sectionsForTab(tab);

  return (
    <AppShell
      banner={<AccountNotices />}
      adminLink={<AdminLink />}
      signedIn={signedIn}
    >
      {/*
        1140px to match Container, with the same 16px minimum gutter. The
        shelves bleed to these edges and put their padding back, so a card can
        sit against the screen edge on a phone.

        overflow-x-clip IS LOAD BEARING AND IT IS NOT overflow-x-hidden.

        A shelf with more cards than fit is a scroll container, and it clips and
        scrolls correctly. Chrome still adds that container's LAYOUT overflow to
        the root's scrollWidth, so the document reported 1845 against a 1265
        viewport and the browser drew a horizontal scrollbar across the bottom of
        the window. It could not scroll anything, which is worse than if it
        could: a control that does nothing. Found in a browser with the shelves
        populated. It does not appear until a shelf actually overflows, which is
        why it was invisible against a catalogue with four cards a row.

        `clip` rather than `hidden` because `hidden` would make this a scroll
        container of its own, which changes what `position: sticky` inside it
        sticks to and gives scroll anchoring somewhere new to land. `clip` cuts
        at the PADDING box, and every shelf bleeds to exactly the padding box
        edge, so nothing is cut.
      */}
      <div className="mx-auto w-full max-w-[1140px] overflow-x-clip px-4 py-4 sm:px-5">
        <ExploreHeader />

        <div className="mt-5">
          <ExploreTabs active={tab} />
        </div>

        {/*
          One busy status for the whole page. Eight per section would announce
          eight times, and the skeletons below are aria-hidden for that reason.
        */}
        <p role="status" className="sr-only">
          Loading Explore
        </p>

        <div>
          {sections.map((s) => {
            const Section = COMPONENTS[s.id];

            /*
              The first sections render with the document and the rest stream.

              A Suspense boundary around an eager section would hand the browser
              a skeleton it immediately replaces, which is a flash rather than a
              loading state. Below the fold it is the opposite: waiting for the
              slowest of eight queries before showing anything would make the
              whole page as slow as its worst shelf.
            */
            if (s.priority === "eager") {
              return <Section key={s.id} ctx={ctx} />;
            }

            return (
              <Suspense
                key={s.id}
                fallback={<SectionSkeleton layout={s.layout} />}
              >
                <Section ctx={ctx} />
              </Suspense>
            );
          })}
        </div>

        {/*
          Explore ends rather than trailing off. A page of twelve shelves that
          simply stops leaves somebody scrolling into blank space wondering
          whether more is still loading.
        */}
        <ExploreEnd tab={tab} signedIn={signedIn} />

        {/* Clears the floating composer, so the end marker can always be
            scrolled out from under it. */}
        <div className="h-24" aria-hidden />
      </div>

      {/*
        The composer, on founder instruction. It is the same single component
        the feed carries, not a second one: /community/new is the one write
        path, and Explore is a signed in home surface where somebody who has
        just found something is as likely to want to say so as somebody at the
        bottom of the feed. Signed out it points at the gate rather than at a
        control that would fail.
      */}
      <CreatePostFab signedIn={signedIn} />
    </AppShell>
  );
}
