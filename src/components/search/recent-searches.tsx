import Link from "next/link";
import { Search, X } from "lucide-react";
import { removeRecentSearchForm } from "@/app/actions/search";
import { ClearSearchHistory } from "./clear-search-history";
import type { RecentSearch } from "@/lib/search/types";

/*
  Your recent searches.

  A SERVER COMPONENT WITH REAL FORMS. Each remove is a form whose action is a
  server action, so it works with JavaScript disabled and needs no client state:
  the row is gone because the page re-rendered, not because a hook said so. Only
  Clear all is a client component, because deleting everything is armed in two
  steps and that IS local state.

  TAP TO SEARCH AGAIN, and the whole row is the link. The remove button sits
  beside it as its own target rather than inside it, because a 44px row that both
  navigates and deletes is how somebody deletes a search they meant to run.

  ONLY EVER YOUR OWN. my_recent_searches reads auth.uid() and takes no id, so
  there is no version of this list that could show anybody else's searches. D85.
*/
export function RecentSearches({ searches }: { searches: RecentSearch[] }) {
  if (searches.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Recent searches</h2>
        <ClearSearchHistory />
      </div>

      <ul className="mt-2 border-t border-border">
        {searches.map((item) => (
          <li
            key={item.normalized}
            className="flex items-center gap-1 border-b border-border"
          >
            <Link
              href={`/search?q=${encodeURIComponent(item.query)}`}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-2.5 transition-colors duration-200 ease-out hover:bg-surface"
            >
              <Search className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[15px]">
                {item.query}
              </span>
            </Link>

            <form action={removeRecentSearchForm}>
              <input type="hidden" name="query" value={item.query} />
              <button
                type="submit"
                className="inline-flex size-11 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
                {/* Names which one. Eleven buttons all called "Remove" is a
                    screen reader reading the same word eleven times. */}
                <span className="sr-only">Remove {item.query} from recent searches</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
