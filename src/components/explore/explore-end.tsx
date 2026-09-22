import { ArrowUp, PenLine, Search } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EndOfList } from "@/components/ui/end-of-list";
import { SparkIcon } from "@/components/ui/spark-icon";
import { EXPLORE_TABS, TAB_LABELS, type ExploreTab } from "@/lib/explore/types";

/*
  The bottom of Explore.

  EXPLORE ENDS DIFFERENTLY FROM THE FEED, and the copy has to reflect that
  rather than borrowing the feed's sentence. The feed is a stream with more
  arriving, so its end is "you are caught up". Explore is a fixed set of shelves,
  so its end is "that is what there is to browse", and the useful thing to offer
  is the surface that does NOT stop: a query, or a question.

  IT NEVER SAYS "YOU HAVE SEEN EVERYTHING". Each shelf shows a sample, not the
  whole section, so claiming the page is exhaustive would be false the moment
  somebody wonders why a tool they know is missing. It says browsing is finished
  and searching is the way to go deeper, which is true and is also the line
  between the two surfaces.

  THE COMPOSER IS HERE TOO, on founder instruction, for the same reason it is at
  the end of the feed: this is where somebody has run out of things to read.

  The other tabs are offered as the cheapest next move. The tab you are already
  on is left out, because a link to where you are is a control that does nothing.
*/
export function ExploreEnd({
  tab,
  signedIn,
}: {
  tab: ExploreTab;
  signedIn: boolean;
}) {
  const others = EXPLORE_TABS.filter((t) => t !== tab);

  return (
    <EndOfList
      icon={<SparkIcon className="size-5" />}
      title="That is the end of Explore"
      body={
        tab === "all"
          ? "You have been through every shelf. Explore shows a sample of each one, so if you are after something specific, search is the surface that goes deeper."
          : `That is everything under ${TAB_LABELS[tab]}. Explore shows a sample of each shelf, so search is the surface that goes deeper.`
      }
    >
      <ButtonLink href="/search">
        <Search className="size-4" aria-hidden />
        Search Celpare
      </ButtonLink>

      <ButtonLink href="/ask" variant="outline">
        <SparkIcon className="size-4" />
        Ask Celpare
      </ButtonLink>

      <ButtonLink
        href={signedIn ? "/community/new" : "/get-started"}
        variant="outline"
      >
        <PenLine className="size-4" aria-hidden />
        {signedIn ? "Write a post" : "Sign in to post"}
      </ButtonLink>

      {/*
        The remaining tabs, as plain links rather than buttons. They are a
        continuation of browsing, and three primary looking controls plus seven
        more would turn a terminus into a menu.
      */}
      <p className="w-full pt-2 text-[13px] leading-relaxed text-muted">
        Or keep browsing:{" "}
        {others.map((t, i) => (
          <span key={t}>
            <ButtonLink
              href={t === "all" ? "/explore" : `/explore?tab=${t}`}
              variant="ghost"
              size="sm"
              className="h-auto px-0 text-[13px] text-foreground underline underline-offset-4"
              scroll
            >
              {TAB_LABELS[t]}
            </ButtonLink>
            {i < others.length - 1 ? <span aria-hidden>, </span> : null}
          </span>
        ))}
      </p>

      <ButtonLink href="#top" variant="ghost" size="sm" scroll className="w-full">
        <ArrowUp className="size-4" aria-hidden />
        Back to top
      </ButtonLink>
    </EndOfList>
  );
}
