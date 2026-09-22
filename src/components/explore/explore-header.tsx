import { SearchInput } from "@/components/search/search-input";

/*
  The top of Explore.

  IT SAYS WHAT IT IS IN ONE WORD. Section 2 asks that Explore read as a major
  Celpare destination rather than an auxiliary page, and the way a destination
  says that is a plain h1 and one line under it, not a hero. D11 rules out the
  gradient panel this kind of page usually grows.

  THE SEARCH FIELD IS THE EXISTING ONE. Section 22 allows Explore a search entry
  point and forbids a second search system, so this is literally the component
  /search uses: the same debounced, aborted, ordered autocomplete against the
  same /api/search/suggest, submitting to the same /search?q=. Nothing here
  knows how search works.

  It is NOT autofocused. Explore is a page you look at, and focusing a field on
  arrival would open the keyboard over the content on a phone and move the
  screen reader's cursor past the heading. /search autofocuses because there is
  nothing to read there until you type; here there is.
*/
export function ExploreHeader() {
  return (
    <div className="pt-1">
      {/* id="top" is the target the end marker's Back to top links at. A
          hash link is handled by the browser against the right scroller, which
          matters here because the page scrolls inside <main> and not the
          window, so window.scrollTo would do nothing. */}
      <h1 id="top" className="font-display text-[clamp(1.6rem,4vw,2.1rem)] font-bold leading-tight">
        Explore
      </h1>
      <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-muted sm:text-[15px]">
        Discover tools, models, people, ideas and what is happening across AI.
      </p>

      <div className="mt-4">
        <SearchInput
          initialQuery=""
          placeholder="Search tools, models and people"
        />
      </div>
    </div>
  );
}
