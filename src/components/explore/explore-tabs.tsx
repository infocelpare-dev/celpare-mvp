import Link from "next/link";
import { cn } from "@/lib/utils";
import { EXPLORE_TABS, TAB_LABELS, type ExploreTab } from "@/lib/explore/types";

/*
  All, Tools, Models, Posts, People, Topics, Videos.

  THEY ARE FILTERS OVER ONE SURFACE. Section 3 and section 21 both insist on it:
  there is no /trending, no /discover and no /recommendations, and these are
  query parameters on /explore rather than routes, so the whole of discovery
  stays one place.

  EVERY TAB IS ALWAYS SHOWN, WHICH IS THE OPPOSITE OF WHAT SEARCH DOES. Search
  hides a tab with no results, because there "irrelevant" changes with every
  query and an empty tab is a dead end. These seven are a permanent description
  of what Celpare contains: Models is empty today because nothing has been added
  to the catalogue yet, and hiding it would say Celpare has no models rather than
  that it has none yet. An empty tab here says so in a sentence, which is the
  honest version of the same information.

  REAL LINKS, SO A TAB IS A PLACE. Reloadable, shareable, and the back button
  returns to the tab you came from. Because they are anchors the keyboard works
  without any script: Tab reaches each one and Enter follows it.

  A ROVING TABINDEX WOULD BE WRONG HERE. The profile tab strip uses one, because
  it is a client component that also handles arrow keys. This is a server
  component with no script at all, and taking six of the seven out of the tab
  order without providing the arrow key navigation that replaces it would leave
  a keyboard user unable to reach them. All seven stay reachable.
*/
export function ExploreTabs({ active }: { active: ExploreTab }) {
  return (
    <div
      role="tablist"
      aria-label="Explore filters"
      /* Scrolls sideways below sm, where seven pills do not fit 358px. The
         scrollbar is hidden and the last pill is deliberately not flush to the
         edge, so there is a visible hint that the row continues. */
      className="-mx-4 flex gap-1.5 overflow-x-auto border-b border-border px-4 pb-3 sm:-mx-5 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {EXPLORE_TABS.map((tab) => {
        const selected = tab === active;
        const href = tab === "all" ? "/explore" : `/explore?tab=${tab}`;

        return (
          <Link
            key={tab}
            href={href}
            role="tab"
            aria-selected={selected}
            scroll={false}
            className={cn(
              /* 40px tall, which clears the WCAG target size for web and lines
                 up beside the 44px controls elsewhere on the page. */
              "inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-[14px]",
              "transition-colors duration-200 ease-out",
              selected
                ? "border-foreground bg-surface font-medium text-foreground"
                : "border-border text-muted hover:border-foreground hover:text-foreground",
            )}
          >
            {TAB_LABELS[tab]}
          </Link>
        );
      })}
    </div>
  );
}
