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

  Since explore_v1 (4BI) this is the order of the TABS and of a cold start. On
  the All tab for a viewer with a profile, the shelves between For you and
  Continue exploring are reordered per viewer by lib/explore/intelligence/
  sections.ts (D156), and Featured keeps its place from this list (D158).
*/
export const EXPLORE_SECTIONS: ExploreSectionDef[] = [
  {
    id: "for-you",
    title: "For you",
    subtitle: "Discoveries picked for you, with a few things you have not tried yet.",
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
    subtitle: "Picked for what you explore, weighed by quality, reviews and what is new to you.",
    kinds: ["tool"],
    layout: "shelf",
    priority: "deferred",
  },
  {
    id: "recommended-models",
    title: "Models to explore",
    subtitle: "Matched to what you explore, with recorded evaluations as evidence.",
    kinds: ["model"],
    layout: "shelf",
    priority: "deferred",
  },
  {
    id: "people",
    title: "People you may know",
    subtitle: "Mutual follows and shared interests, never follower counts.",
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

/*
  The All tab order for one viewer (D156): explore_v1's order for the ranked
  shelves, with Featured kept at its registry position. A null order (ranking
  failed) is the registry order.
*/
export function orderedSections(ranked: string[] | null): ExploreSectionDef[] {
  if (!ranked) return EXPLORE_SECTIONS;
  const byId = new Map(EXPLORE_SECTIONS.map((s) => [s.id, s]));
  const out: ExploreSectionDef[] = [];
  for (const id of ranked) {
    const d = byId.get(id as ExploreSectionId);
    if (d) out.push(d);
  }
  const featuredAt = EXPLORE_SECTIONS.findIndex((s) => s.id === "featured");
  const featured = byId.get("featured");
  if (featured) out.splice(Math.min(featuredAt, out.length), 0, featured);
  /* The first two render with the document; the rest stream. */
  return out.map((d, i) => ({ ...d, priority: i < 2 ? "eager" : "deferred" }));
}
