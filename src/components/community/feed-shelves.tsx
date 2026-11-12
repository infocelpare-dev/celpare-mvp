import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Shelf } from "@/components/explore/section";
import { ExploreItemCard } from "@/components/explore/item";
import { viewerFor } from "@/components/explore/sections";
import {
  loadNewestTools,
  loadPeople,
  loadTrending,
  type ExploreContext,
} from "@/lib/explore/queries";
import type { ExploreItem, ExploreTab, SectionState } from "@/lib/explore/types";

/*
  Shelves inside the feed (founder, 2026-11-12, D268): trending tools, people
  to follow, what is trending in the community and new tools, placed between
  posts the way posts, videos and images are, at every width.

  NOTHING HERE RANKS. Each shelf is an Explore section (explore_v1, guide 15)
  read through the same loader Explore uses, narrowed by Explore's own tab, and
  drawn with Explore's own cards. So "trending" means exactly what it means on
  /explore, and the feed's own ranking (feed_v1) is untouched: these are not
  posts and never enter its list.

  A SHELF WITH NOTHING REAL TO SHOW IS NOT DRAWN. Unlike /explore, where an
  empty section says so under its heading, the feed is a stream: a heading
  followed by "nothing yet" between two posts is noise. A failed load is also
  not drawn here (D99 is about never claiming "empty" for a failure, and an
  absent shelf claims nothing); /explore still shows the failure.

  NO TELEMETRY. There is no Explore tracker on the feed, so these cards record
  no impressions, and nothing here writes feed_events (D129). Opening a card is
  an ordinary page view of a tool or a profile.
*/

export type FeedShelfKind = "trending-tools" | "people" | "trending-posts" | "new-tools";

const SHELVES: Record<
  FeedShelfKind,
  {
    title: string;
    subtitle: string;
    tab: ExploreTab;
    load: (ctx: ExploreContext) => Promise<SectionState>;
    keep: (item: ExploreItem) => boolean;
    href: string;
    more: string;
  }
> = {
  "trending-tools": {
    title: "Trending tools",
    subtitle: "Tools people are opening, saving and comparing this week.",
    tab: "tools",
    load: loadTrending,
    keep: (i) => i.kind === "tool",
    href: "/explore?tab=tools",
    more: "Explore tools",
  },
  people: {
    title: "People to follow",
    subtitle: "People posting on Celpare that you do not follow yet.",
    tab: "all",
    load: loadPeople,
    keep: (i) => i.kind === "person",
    href: "/explore?tab=people",
    more: "More people",
  },
  "trending-posts": {
    title: "Trending in the community",
    subtitle: "Posts gaining attention right now.",
    tab: "posts",
    load: loadTrending,
    keep: (i) => i.kind === "post" || i.kind === "video",
    href: "/explore?tab=posts",
    more: "More in Explore",
  },
  "new-tools": {
    title: "New in Celpare",
    subtitle: "Tools added to the catalogue in the last two weeks.",
    tab: "tools",
    load: loadNewestTools,
    keep: (i) => i.kind === "tool",
    href: "/explore?tab=tools",
    more: "See the catalogue",
  },
};

/* Fewer than this and a row reads as a gap rather than a shelf. */
const MIN_ITEMS = 2;
const MAX_ITEMS = 8;

export async function FeedShelf({
  kind,
  signedIn,
  viewerId,
}: {
  kind: FeedShelfKind;
  signedIn: boolean;
  viewerId: string | null;
}) {
  const s = SHELVES[kind];
  const ctx: ExploreContext = { tab: s.tab, signedIn, viewerId };

  let items: ExploreItem[];
  try {
    const state = await s.load(ctx);
    if (state.status !== "ok") return null;
    items = state.items.filter(s.keep).slice(0, MAX_ITEMS);
  } catch (err) {
    console.error(`[feed] shelf ${kind} failed`, err);
    return null;
  }
  if (items.length < MIN_ITEMS) return null;

  const viewer = await viewerFor(items, ctx);
  const headingId = `feed-shelf-${kind}`;

  return (
    <section aria-labelledby={headingId} className="border-b border-border px-4 py-5 sm:px-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={headingId} className="font-display text-[16px] font-semibold">
          {s.title}
        </h2>
        <Link
          href={s.href}
          className="inline-flex shrink-0 items-center gap-1 text-[13px] text-muted underline-offset-2 transition-colors duration-200 hover:text-foreground hover:underline"
        >
          {s.more}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <p className="mt-0.5 text-[13px] text-muted">{s.subtitle}</p>
      <div className="mt-3">
        <Shelf label={s.title}>
          {items.map((item, i) => (
            /* No Explore slot around it (that is the tracker's list item), so
               the card is the list item itself, 264px, as on Explore. */
            <ExploreItemCard key={item.id} item={item} viewer={viewer} index={i} />
          ))}
        </Shelf>
      </div>
    </section>
  );
}

/*
  Where each shelf goes: after this many posts. Spread out so the feed stays
  mostly posts. With fewer posts than a slot needs, the shelves left over are
  drawn after the last post, in this order, so a short feed still shows them.
*/
export const FEED_SHELF_SLOTS: { after: number; kind: FeedShelfKind }[] = [
  { after: 3, kind: "trending-tools" },
  { after: 7, kind: "people" },
  { after: 11, kind: "trending-posts" },
  { after: 15, kind: "new-tools" },
];
