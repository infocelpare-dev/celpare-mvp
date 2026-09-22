import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

/*
  Paging over the ranked list.

  PAGE NUMBERS, NOT AN INFINITE SCROLL. A result list is something people leave
  and come back to, so a page has to be a URL: linkable, reloadable, and a back
  button that returns to where they were rather than to the top of an endlessly
  regrown list. It also keeps the whole surface server rendered.

  THE POOL IS THE CEILING, AND THE PAGE SAYS SO WHEN IT MATTERS. Retrieval caps
  at TOOL_POOL candidates and ranking orders those, so paging walks a ranked pool
  rather than the whole catalogue. At 53 approved tools the pool IS the whole
  catalogue. When it stops being, the honest fix is a deeper second retrieval
  pass keyed on the page, not a bigger number here, and the same note the feed's
  candidate generator carries applies: the threshold where a windowed candidate
  set starts hiding genuinely good results is written down before it is reached.
*/
export function Pagination({
  page,
  pageCount,
  hrefFor,
  capped,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  /* True when retrieval filled its pool, so there may be more behind the cap
     than the page count admits. */
  capped: boolean;
}) {
  if (pageCount <= 1) return null;

  const prev = page > 1 ? hrefFor(page - 1) : null;
  const next = page < pageCount ? hrefFor(page + 1) : null;

  return (
    <nav
      aria-label="Result pages"
      className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-5"
    >
      {prev ? (
        <Link
          href={prev}
          rel="prev"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-[14px] transition-colors duration-200 ease-out hover:bg-surface"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Previous
        </Link>
      ) : (
        /* A placeholder rather than nothing, so Next does not jump across the
           row between page one and page two. */
        <span aria-hidden />
      )}

      <p className="text-[13px] text-muted" aria-live="polite">
        Page {page} of {pageCount}
        {capped ? " so far" : ""}
      </p>

      {next ? (
        <Link
          href={next}
          rel="next"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-[14px] transition-colors duration-200 ease-out hover:bg-surface"
        >
          Next
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span aria-hidden />
      )}
    </nav>
  );
}
