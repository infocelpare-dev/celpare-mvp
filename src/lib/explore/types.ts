/*
  The shapes the Explore surface passes between its stages.

  Deliberately free of any server import, so the pieces that run in the browser
  (the tab strip, the retry control) share the same types as the pieces that run
  on the server. Same rule, and the same reason, as lib/search/types.ts.

  THIS FILE IS THE CONTRACT THE FUTURE RANKING LAYER FILLS. Nothing here scores
  anything, orders anything or decides what is trending. A provider hands back a
  SectionState and the UI draws it, so replacing a provider with a ranked one
  later changes nothing below this line. Section 20 of the brief asks for exactly
  that, and section 24 rules out building the ranker now.

  THE ENTITY TYPES ARE THE EXISTING ONES. ToolCandidate, ModelCandidate and
  PersonCandidate come from search, FeedPost and VideoPost from community. There
  is no second description of a tool anywhere in here, which is what stops the
  two surfaces drifting apart.
*/

import type {
  ModelCandidate,
  PersonCandidate,
  ToolCandidate,
} from "@/lib/search/types";
import type { FeedPost } from "@/lib/community/queries";
import type { VideoPost } from "@/lib/community/video";
import type { RecentRow } from "@/lib/profile/queries";

/* ---------------------------------------------------------------------------
   Tabs
   --------------------------------------------------------------------------- */

/*
  The filters across the top. THEY ARE FILTERS OVER ONE SURFACE, NOT SEPARATE
  PRODUCTS: section 3 and section 21 of the brief both say so, and they are query
  parameters on /explore rather than routes for that reason.
*/
export type ExploreTab =
  | "all"
  | "tools"
  | "models"
  | "posts"
  | "people"
  | "topics"
  | "videos";

export const EXPLORE_TABS: ExploreTab[] = [
  "all",
  "tools",
  "models",
  "posts",
  "people",
  "topics",
  "videos",
];

export const TAB_LABELS: Record<ExploreTab, string> = {
  all: "All",
  tools: "Tools",
  models: "Models",
  posts: "Posts",
  people: "People",
  topics: "Topics",
  videos: "Videos",
};

export function isExploreTab(value: string | undefined): value is ExploreTab {
  return typeof value === "string" && (EXPLORE_TABS as string[]).includes(value);
}

/* ---------------------------------------------------------------------------
   Items
   --------------------------------------------------------------------------- */

export type ExploreItemKind =
  | "tool"
  | "model"
  | "post"
  | "person"
  | "topic"
  | "video";

/* Which kind of thing a tab is asking for. "all" asks for no particular one. */
export const TAB_KIND: Record<ExploreTab, ExploreItemKind | null> = {
  all: null,
  tools: "tool",
  models: "model",
  posts: "post",
  people: "person",
  topics: "topic",
  videos: "video",
};

/*
  A topic or a category, flattened to one shape.

  CELPARE HAS TWO REAL TAXONOMIES AND THIS DOES NOT INVENT A THIRD. `topics` are
  what a post is filed under and `categories` are what a tool is filed under, and
  section 12 says to reuse what exists rather than build a second system. They
  differ in what they count and where they lead, so both are carried explicitly
  rather than being blurred into one list that lies about half its rows.

  `count` is null when nothing counts it, never zero standing in for unknown.
*/
export type ExploreTopic = {
  taxonomy: "topic" | "category";
  slug: string;
  name: string;
  description: string | null;
  count: number | null;
  /* "posts" or "tools", so the number is never a bare figure with no unit. */
  countNoun: string | null;
  href: string;
};

/*
  One discovery object.

  Section 18: every result can be a discovery object, and each one is drawn by
  the renderer that suits it rather than forced into a single visual card.

  `reason` IS WHAT THE PROVIDER SAID, NOT WHAT THE UI GUESSED. Section 27 is
  explicit: do not invent reasons in the UI when the backend does not supply one.
  Every provider in this build leaves it null, because nothing yet computes a
  personalisation reason, and the cards render nothing where it would go.
*/
export type ExploreItem =
  | { kind: "tool"; id: string; tool: ToolCandidate; reason: string | null }
  | { kind: "model"; id: string; model: ModelCandidate; reason: string | null }
  | { kind: "person"; id: string; person: PersonCandidate; reason: string | null }
  | { kind: "post"; id: string; post: FeedPost; reason: string | null }
  | { kind: "video"; id: string; post: VideoPost; reason: string | null }
  | { kind: "topic"; id: string; topic: ExploreTopic; reason: string | null };

/* ---------------------------------------------------------------------------
   Section state
   --------------------------------------------------------------------------- */

/*
  FOUR STATES, AND THE DIFFERENCE BETWEEN THEM IS THE POINT.

  ok       there is something to show.
  empty    the provider ran and there is genuinely nothing. A true statement
           about the platform: no videos have been posted, no discussions yet.
  pending  THE PROVIDER DOES NOT EXIST YET. For you, Trending and Rising each
           need the ranking layer that section 24 rules out building here, so
           they say so rather than being filled with a stand-in that would
           quietly become the permanent architecture.
  error    the read failed. D99 in miniature: "nothing here" is a claim about the
           platform, and making it at the moment the platform cannot be read is a
           false negative dressed as an answer. A failed section says it failed
           and offers to try again, and the rest of the page is unaffected.
*/
export type SectionStatus = "ok" | "empty" | "pending" | "error";

export type SectionState<T = ExploreItem> = {
  status: SectionStatus;
  items: T[];
  /* Shown under the heading when the provider supplies one. Section 27. */
  reason?: string | null;
  /* Why it is pending or what failed, in one sentence, for the person reading
     the page. Never a stack trace and never a digest. */
  note?: string | null;
};

export function ok<T>(items: T[], extra?: { reason?: string | null }): SectionState<T> {
  return {
    status: items.length > 0 ? "ok" : "empty",
    items,
    reason: extra?.reason ?? null,
  };
}

export function empty<T>(): SectionState<T> {
  return { status: "empty", items: [] };
}

export function pending<T>(note: string): SectionState<T> {
  return { status: "pending", items: [], note };
}

export function failed<T>(): SectionState<T> {
  return { status: "error", items: [] };
}

/* ---------------------------------------------------------------------------
   The whole surface
   --------------------------------------------------------------------------- */

/*
  What a future Explore retrieval and ranking layer would hand the page, in one
  object. Section 20.

  NOTHING IN THIS BUILD CONSTRUCTS ONE, and that is deliberate rather than an
  omission: each section is loaded and streamed on its own so a slow or failed
  one cannot hold up the rest (sections 28, 30 and 33). The type is here as the
  contract, so the day a single ranked call replaces the providers, the shape
  it has to return is already written down.
*/
export type ExploreData = {
  forYou: SectionState;
  trending: SectionState;
  rising: SectionState;
  newAndRecent: SectionState;
  featured: SectionState;
  recommendedTools: SectionState;
  recommendedModels: SectionState;
  recommendedPeople: SectionState;
  recommendedTopics: SectionState;
  discussions: SectionState;
  videos: SectionState;
  continueExploring: SectionState<RecentRow>;
};
