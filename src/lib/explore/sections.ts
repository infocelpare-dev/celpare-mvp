/*
  The section registry: what Explore is made of, in what order, and which tabs
  each section belongs to.

  THIS FILE IS THE ORDER. Section 19 asks that sections be reorderable later
  without rewriting Explore, and section 4 that the ordering eventually come from
  the ranking system. Both are the same requirement: the page must not know the
  order. It maps over this array, so moving Rising above Trending is moving one
  line here, and handing the array to a ranker later is replacing one export.

  A SECTION DECLARES WHAT IT CAN CONTAIN. `kinds` is how a tab decides whether to
  render it: the Models tab shows every section that can produce a model and none
  of the others, so a tab is a filter over one surface rather than a different
  page. Sections that can produce anything carry every kind and receive the tab,
  so they narrow themselves.
*/

import type { ExploreItemKind, ExploreTab } from "./types";
import { TAB_KIND } from "./types";

export type ExploreSectionId =
  | "for-you"
  | "trending"
  | "rising"
  | "new-and-recent"
  | "featured"
  | "recommended-tools"
  | "recommended-models"
  | "people"
  | "discussions"
  | "topics"
  | "videos"
  | "continue-exploring";

export type ExploreSectionDef = {
  id: ExploreSectionId;
  title: string;
  /* One line under the heading. Describes what the section IS, never what is in
     it, because what is in it changes and a subtitle that counts things would be
     a metric nobody maintains. */
  subtitle: string;
  kinds: ExploreItemKind[];
  /*
    How the shelf is drawn.

    shelf  a horizontal row of cards that scrolls inside its own container.
    grid   a responsive grid, for topics and categories.
    list   full width rows, for posts and for the recent list.
  */
  layout: "shelf" | "grid" | "list";
  /*
    Whether this section is worth the first paint.

    The first two are rendered eagerly and everything below is streamed, which is
    what section 33 asks for: the header, the tabs and the top of the page arrive
    immediately and the rest fills in.
  */
  priority: "eager" | "deferred";
};

/* Every kind, for the sections that can carry anything. */
const ANY: ExploreItemKind[] = [
  "tool",
  "model",
  "post",
  "person",
  "topic",
  "video",
];

/*
  THE ORDER, and it is the founder's conceptual order from section 4 rather than
  a reordering of it by what happens to be populated today.

  For you, Trending and Rising sit at the top and are currently pending, because
  the ranking layer that fills them is explicitly out of scope (section 24). They
  render one honest line each rather than being hidden, for two reasons: hiding
  them would leave the page silently missing the three things the brief puts
  first, and the day a ranker exists they fill in with no layout change.
*/
export const EXPLORE_SECTIONS: ExploreSectionDef[] = [
  {
    id: "for-you",
    title: "For you",
    subtitle: "Personalised discoveries.",
    kinds: ANY,
    layout: "shelf",
    priority: "eager",
  },
  {
    id: "trending",
    title: "Trending now",
    subtitle: "What is getting attention.",
    kinds: ANY,
    layout: "shelf",
    priority: "eager",
  },
  {
    id: "rising",
    title: "Rising",
    subtitle: "Gaining momentum, not yet everywhere.",
    kinds: ANY,
    layout: "shelf",
    priority: "deferred",
  },
  {
    id: "new-and-recent",
    title: "New and recently added",
    subtitle: "The latest across tools, models, people and posts.",
    kinds: ANY,
    layout: "shelf",
    priority: "deferred",
  },
  {
    id: "featured",
    title: "Featured",
    subtitle: "Chosen by the Celpare team, not ranked by a score.",
    kinds: ["tool", "model"],
    layout: "shelf",
    priority: "deferred",
  },
  {
    id: "recommended-tools",
    title: "Tools worth a look",
    subtitle: "Chosen by rating, how complete the listing is and recent interest.",
    kinds: ["tool"],
    layout: "shelf",
    priority: "deferred",
  },
  {
    id: "recommended-models",
    title: "Models to explore",
    subtitle: "What the catalogue holds, with nothing inferred about performance.",
    kinds: ["model"],
    layout: "shelf",
    priority: "deferred",
  },
  {
    id: "people",
    title: "People you may know",
    subtitle: "Developers, builders and creators on Celpare.",
    kinds: ["person"],
    layout: "shelf",
    priority: "deferred",
  },
  {
    id: "discussions",
    title: "Discussions",
    subtitle: "Conversations across the community.",
    kinds: ["post"],
    layout: "list",
    priority: "deferred",
  },
  {
    id: "topics",
    title: "Topics and categories",
    subtitle: "The subjects people post about, and how the catalogue is filed.",
    kinds: ["topic"],
    layout: "grid",
    priority: "deferred",
  },
  {
    id: "videos",
    title: "Videos",
    subtitle: "Opens in the vertical viewer.",
    kinds: ["video"],
    layout: "shelf",
    priority: "deferred",
  },
  {
    id: "continue-exploring",
    title: "Continue exploring",
    subtitle: "Where you were. Only you can see this.",
    kinds: ANY,
    layout: "list",
    priority: "deferred",
  },
];

/*
  The sections a tab shows.

  A tab keeps a section when the section can produce that tab's kind. The All tab
  keeps everything. The mixed sections carry every kind, so they survive every
  tab and narrow their own contents to it.
*/
export function sectionsForTab(tab: ExploreTab): ExploreSectionDef[] {
  const kind = TAB_KIND[tab];
  if (kind === null) return EXPLORE_SECTIONS;
  return EXPLORE_SECTIONS.filter((s) => s.kinds.includes(kind));
}
