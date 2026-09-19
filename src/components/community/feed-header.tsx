import Link from "next/link";
import { cn } from "@/lib/utils";
import { FeedTabs } from "./feed-tabs";
import { RANKING, type Sort } from "@/lib/community/ranking";
import type { FeedScope, Topic } from "@/lib/community/queries";

/*
  The top of the feed: which feed you are reading, and the global actions.

  WHAT IS NOT HERE, AND WHY.

  THE TOPICS LIVE INSIDE THE For you CONTROL, not in a row under it. Founder
  instruction 2026-09-19 from a screen recording: the active tab carries a
  chevron and the topics open from it. See feed-tabs.tsx for why that is also
  the better shape.

  Search and Ask Celpare MOVED OUT the same day, into the top bar that every
  page carries. Sitting here they read as feed controls, and neither is one:
  search is across the whole of Celpare and Ask is its own surface. The bar is
  also where they sit on the directory, a tool page and a profile, so they are
  now in one place rather than one place on one page.

  MESSAGES IS REAL NOW. It was left out of the first version because nothing
  existed behind it, then built on 2026-09-19 when the founder asked for it a
  third time: its own tables, its own private bucket, text, link, voice and
  video. The tab is in feed-tabs.tsx and the unread dot beside it is the only
  thing anywhere that says a message arrived, because D28 still defers
  notifications.

  NOTIFICATIONS ARE STILL NOT HERE. No route, no table, and the brief's own
  wording was "if one already exists". It does not, so leaving it out is
  following the brief rather than departing from it.

  Search goes to /explore, which is the discovery surface that exists today. A
  dedicated global search page does not exist yet, and pointing an icon at a
  route that is not built would be the same mistake in a smaller box.

  Both of these are server rendered links, so the tab bar needs no JavaScript
  and a feed tab survives a reload and can be linked, the same reasoning that
  made the profile tabs real anchors.
*/

export function FeedHeader({
  scope,
  sort,
  visiblePostCount,
  topics,
  unreadMessages,
  topicSlug,
}: {
  scope: FeedScope;
  sort: Sort;
  visiblePostCount: number;
  /* Rendered inside the For you control, never as a row beside it. */
  topics: Topic[];
  unreadMessages?: number;
  /* Set on /community/topic/[slug], where the tabs are not the control and
     the header collapses to the actions alone. */
  topicSlug?: string;
}) {
  /*
    The sort control appears only once ranking can differ from recency.

    Below the threshold, Top and New return the same posts in nearly the same
    order, because the gravity term dominates when everything has a handful of
    likes at most. Offering the choice then is a control that does nothing,
    which is worse than no control. It arrives on its own once there is enough
    content, which is the runtime check D29 asked for rather than a switch
    somebody has to remember to flip.
  */
  const showSort = visiblePostCount >= RANKING.TOP_NEEDS_POSTS;

  return (
    /*
      Sticky, and the top offset is 0 because AppShell's own bar is outside the
      scroll container: main scrolls, the bar does not. The ux guidance about a
      fixed nav obscuring content does not bite here for the same reason.
    */
    <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:-mx-5 sm:px-5">
      {/*
        CENTRED, founder instruction 2026-09-19. The tabs used to sit hard left
        with the action icons opposite them. Those icons moved up into the app
        bar, so justify-between had one child and simply pinned it left. The
        feed column is 640px at most, so a centred pair reads as the heading of
        the column rather than as something clinging to its edge.
      */}
      <div className="flex h-14 items-center justify-center gap-2">
        {topicSlug ? (
          <p className="truncate text-[14px] font-medium">Topic</p>
        ) : (
          <FeedTabs scope={scope} topics={topics} unreadMessages={unreadMessages} />
        )}
      </div>

      {showSort && !topicSlug ? (
        <div className="flex items-center gap-1 pb-2">
          <SortLink current={sort} value="top" scope={scope} label="Top" />
          <SortLink current={sort} value="new" scope={scope} label="Latest" />
        </div>
      ) : null}
    </div>
  );
}

function SortLink({
  current,
  value,
  scope,
  label,
}: {
  current: Sort;
  value: Sort;
  scope: FeedScope;
  label: string;
}) {
  const params = new URLSearchParams();
  if (scope === "following") params.set("feed", "following");
  params.set("sort", value);

  const selected = current === value;

  return (
    <Link
      href={`/community?${params.toString()}`}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors duration-200 ease-out",
        selected
          ? "border-foreground font-medium text-foreground"
          : "border-border text-muted hover:border-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
