import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/format";
import type { SearchResults, SearchTab } from "@/lib/search/types";

/*
  All, Tools, Models, People, Posts.

  THESE ARE NOT THE PROFILE TABS, AND THAT IS DELIBERATE. D90 made profile and
  workspace tabs icon pills that open only on the selected one, which works there
  because those ten sections are a permanent navigation you learn by shape. These
  five are FILTERS OVER A RESULT SET: which one has results changes with every
  query, so every label and every count has to be readable at a glance without
  being selected first. Using the icon pill component here would hide four of the
  five names behind icons and hide the counts with them.

  A TAB WITH NO RESULTS IS NOT RENDERED. Section 3 of the brief: do not show
  irrelevant categories. "Irrelevant" is decided by the count rather than by a
  guess at intent, so a query that finds no people simply has no People tab
  instead of a tab that opens onto an empty state.

  Real links, so a tab is a place: reloadable, linkable, and the back button
  returns to the previous tab rather than to the previous page.
*/

const LABELS: Record<SearchTab, string> = {
  all: "All",
  tools: "Tools",
  models: "Models",
  people: "People",
  posts: "Posts",
};

export function ResultTabs({
  results,
  query,
}: {
  results: SearchResults;
  query: string;
}) {
  const { counts, total, tab } = results;

  const items: { key: SearchTab; count: number | null }[] = [
    { key: "all", count: total },
    { key: "tools", count: counts.tools },
    { key: "models", count: counts.models },
    { key: "people", count: counts.people },
    { key: "posts", count: counts.posts },
  ].filter(
    (item) =>
      item.key === "all" ||
      item.count > 0 ||
      /* The tab you are on stays visible even at zero, or landing on
         /search?tab=models with no models would silently move you elsewhere and
         look like the link was wrong. */
      item.key === tab,
  ) as { key: SearchTab; count: number | null }[];

  if (items.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label="Result types"
      /* Scrolls sideways only below sm, where five pills do not fit 358px. The
         scrollbar is hidden and the last pill is deliberately not flush to the
         edge, so there is a visible hint that the row continues. */
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => {
        const selected = item.key === tab;
        const href =
          item.key === "all"
            ? `/search?q=${encodeURIComponent(query)}`
            : `/search?q=${encodeURIComponent(query)}&tab=${item.key}`;

        return (
          <Link
            key={item.key}
            href={href}
            role="tab"
            aria-selected={selected}
            scroll={false}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px]",
              "transition-colors duration-200 ease-out",
              selected
                ? "border-foreground bg-surface font-medium text-foreground"
                : "border-border text-muted hover:border-foreground hover:text-foreground",
            )}
          >
            {LABELS[item.key]}
            {item.count !== null && item.count > 0 ? (
              <span className="tabular-nums text-muted">
                {formatCount(item.count)}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
