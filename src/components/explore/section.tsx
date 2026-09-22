import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SectionRetry } from "./retry";
import type { ExploreSectionDef } from "@/lib/explore/sections";
import type { SectionStatus } from "@/lib/explore/types";

/*
  The frame every Explore section sits in.

  ONE SHELL, EVERY SECTION. Section 19 asks that Explore not be one giant
  component and that sections be reorderable later. Both come from this: a
  section supplies a heading and some children, and every decision about
  spacing, headings, empty states, failures and the horizontal shelf is made
  once here. Restyling Explore is editing this file, not twelve.

  THE HEADING IS A REAL h2 INSIDE A REAL section. Screen reader users navigate a
  long page by heading and by landmark, and a page of a dozen shelves where the
  headings are styled divs is a page they cannot move around in. aria-labelledby
  ties each region to its own heading, so the landmark list reads as the section
  names rather than a dozen copies of the word region.

  FOUR STATES, AND THEY SAY DIFFERENT THINGS. A section that failed must not
  render as a section that is empty: "nothing is trending" is a claim about
  Celpare, and making it because a query fell over is a false negative dressed
  as an answer. That is D99, applied per section rather than per page.
*/

export function ExploreSection({
  def,
  status,
  /* Under the heading, when the provider supplied one. Section 27: the UI never
     invents a reason the backend did not give. */
  reason,
  /* One sentence explaining a pending or failed state, in words a person can
     act on. Never a digest and never a stack trace. */
  note,
  /* What an empty section says. Each one states something true about Celpare
     rather than sharing a generic line. */
  emptyText,
  children,
}: {
  def: ExploreSectionDef;
  status: SectionStatus;
  reason?: string | null;
  note?: string | null;
  emptyText: string;
  children?: React.ReactNode;
}) {
  const headingId = `explore-${def.id}`;

  return (
    <section
      aria-labelledby={headingId}
      /* scroll-mt clears the 68px app bar, so a link to a section does not land
         with its heading underneath the chrome. F1 was this bug on the marketing
         page and it is not worth repeating. */
      className="scroll-mt-[84px] border-t border-border py-7 first:border-t-0 first:pt-2 sm:py-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id={headingId}
          className="font-display text-[17px] font-semibold sm:text-[19px]"
        >
          {def.title}
        </h2>
      </div>

      <p className="mt-1 text-[13px] leading-relaxed text-muted sm:text-[14px]">
        {reason ?? def.subtitle}
      </p>

      <div className="mt-4">
        {status === "ok" ? (
          children
        ) : status === "error" ? (
          <SectionFailed label={def.title} />
        ) : (
          /* pending and empty look the same and say different things. Both are
             one line: section 29 asks that an empty section never leave a large
             empty space, and a heading with a sentence under it is the smallest
             honest thing a section can be. */
          <p className="text-[14px] leading-relaxed text-muted">
            {status === "pending" ? note : emptyText}
          </p>
        )}
      </div>
    </section>
  );
}

function SectionFailed({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="flex items-start gap-2 text-[14px] leading-relaxed text-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <span>
          This section did not load. That is a failure on our side, not a
          statement about what is here.
        </span>
      </p>
      <div className="mt-3">
        <SectionRetry label={label} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Layouts
   --------------------------------------------------------------------------- */

/*
  The horizontal shelf.

  IT SCROLLS INSIDE ITSELF AND THE PAGE DOES NOT. The ux guidance rates a
  horizontal scrollbar on the page High severity, and the two are different
  things: a bounded region that scrolls is a shelf, a document wider than the
  viewport is a defect. The negative margin bleeds the shelf to the container's
  gutters so a card can sit against the screen edge and the next one peeks in,
  which is the affordance that says the row continues, and the padding puts the
  content back where the rest of the page is.

  NO SCROLL BUTTONS, AND THE KEYBOARD STILL WORKS. Every card holds a link, so
  Tab moves through the row and the browser scrolls each one into view on focus.
  A pair of arrow buttons would be two more controls to get right for a gesture
  the platform already has, and they are useless on the device where this
  pattern is used most.

  snap-x with snap-start so a flick settles on a card rather than halfway
  through one. scroll-smooth is deliberately NOT set: focus driven scrolling
  should be instant, and globals.css neutralises motion under
  prefers-reduced-motion anyway.
*/
export function Shelf({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul
      aria-label={label}
      className={cn(
        "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5",
        /* The scrollbar is hidden because the peeking card already says the row
           continues, and a permanent bar under every one of eight shelves is
           eight bars of chrome on a page that is mostly content. */
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {children}
    </ul>
  );
}

/* A responsive grid, for topics and categories: they are a set to look over
   rather than a row to scan, so they wrap instead of scrolling. */
export function Grid({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <ul
      aria-label={label}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
    >
      {children}
    </ul>
  );
}

/* Full width rows: posts, and the recent list. */
export function Rows({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul aria-label={label} className={className}>
      {children}
    </ul>
  );
}
