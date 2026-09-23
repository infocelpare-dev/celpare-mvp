import { Check, ExternalLink, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ageInDays, shortDate, STALE_AFTER_DAYS } from "@/lib/compare/present";
import type { CompareItem, Fact, Provenance } from "@/lib/compare/types";

/*
  The comparison table, and the four kinds of cell it can hold.

  FOUR STATES, NEVER THREE. A cell is one of:
    Yes            the record says it has this
    No             the record says it does NOT, which is information
    Not recorded   nobody has recorded either way, which is NOT a No
    Does not apply the attribute is not about this kind of item
  Collapsing "not recorded" into "no" is the quiet way a comparison lies: it
  turns missing data into a negative claim about somebody's product. So the two
  never share a glyph, and the legend above every matrix says which is which.

  THE TABLE SCROLLS, THE PAGE DOES NOT. ui-ux-pro-max rates a page wider than the
  viewport High and says to scroll the table inside its own wrapper. The label
  column is sticky, so on a phone the row names stay put while the values move
  under them, and nothing is shrunk to an unreadable size to make it fit.

  IT IS A REAL <table>. Column headers are th scope="col", row labels th
  scope="row", and a caption names it, so a screen reader announces "Web search,
  Cursor, Yes" rather than a stream of ticks.
*/

export type MatrixRow = {
  key: string;
  label: React.ReactNode;
  cells: React.ReactNode[];
  /* Marks a row as relevant to the chosen goal. Presentation only. */
  highlight?: boolean;
};

export function Matrix({
  caption,
  columns,
  rows,
  className,
}: {
  caption: string;
  columns: CompareItem[];
  rows: MatrixRow[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-2xl border border-border",
        /* Momentum scrolling and no page bounce when the table hits its end. */
        "overscroll-x-contain",
        className,
      )}
      /* A scroll region has to be reachable by keyboard, or its right hand
         columns are mouse only. */
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      {/* Fixed layout: the label column is fixed and the item columns share
          the rest evenly, so three items fill the width and six still fit a
          desktop. Below 170px a column would be unreadable, so the minimum
          width is set from the column count and the region scrolls past it. */}
      <table
        className="w-full table-fixed border-collapse text-left text-[14px]"
        style={{ minWidth: 176 + columns.length * 170 }}
      >
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="sticky left-0 z-[1] w-44 bg-background px-4 py-3 text-[12px] font-medium text-muted"
            >
              <span className="sr-only">Attribute</span>
            </th>
            {columns.map((c) => (
              <th
                key={`${c.type}:${c.id}`}
                scope="col"
                className="px-4 py-3 align-bottom text-[13px] font-semibold"
              >
                <span className="line-clamp-2">{c.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border last:border-b-0">
              <th
                scope="row"
                className={cn(
                  "sticky left-0 z-[1] bg-background px-4 py-3 align-top text-[13px] font-medium",
                  /* A goal marks rows, it does not reorder or score them. The
                     marker is a hairline in the accent, which the brand allows
                     as an active state, plus words for anyone who cannot see it. */
                  row.highlight && "border-l-[3px] border-l-accent",
                )}
              >
                {row.label}
                {row.highlight ? (
                  <span className="mt-0.5 block text-[11px] font-normal text-muted">
                    Relevant to your goal
                  </span>
                ) : null}
              </th>
              {row.cells.map((cell, i) => (
                <td key={i} className="px-4 py-3 align-top">
                  <div className="break-words">{cell}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Cells
   --------------------------------------------------------------------------- */

export function Yes() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Check className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">Yes</span>
    </span>
  );
}

export function No() {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      <Minus className="size-4 shrink-0" aria-hidden />
      <span className="text-[12px]">No</span>
    </span>
  );
}

export function NotRecorded({ label = "Not recorded" }: { label?: string }) {
  return <span className="text-[12px] italic text-muted">{label}</span>;
}

export function NotApplicable() {
  return <span className="text-[12px] text-muted">Does not apply</span>;
}

/* The key above every matrix, so the four states are never guessed. */
export function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
      <span className="inline-flex items-center gap-1">
        <Check className="size-3.5 text-foreground" aria-hidden /> Recorded as yes
      </span>
      <span className="inline-flex items-center gap-1">
        <Minus className="size-3.5" aria-hidden /> Recorded as no
      </span>
      <span className="italic">Not recorded</span>
      <span>means nobody has recorded it either way. It is not a no.</span>
    </p>
  );
}

/* ---------------------------------------------------------------------------
   Provenance
   --------------------------------------------------------------------------- */

/*
  One line under a value saying where it came from and when it was checked.

  VERIFIED IS ONLY SAID WHEN verified_at IS SET. A source link with no
  verification date says "Source", not "Verified", because the two are
  different claims. A verified value older than STALE_AFTER_DAYS keeps its date
  and gains "may be out of date" rather than being shown as current.
*/
export function ProvenanceLine({
  provenance,
  now,
  compact = false,
}: {
  provenance: Provenance;
  now: number;
  compact?: boolean;
}) {
  const verified = shortDate(provenance.verifiedAt);
  const age = ageInDays(provenance.verifiedAt, now);
  const stale = age !== null && age > STALE_AFTER_DAYS;

  if (!verified && !provenance.url) return null;

  const text = verified
    ? `Verified ${verified}${stale ? ", may be out of date" : ""}`
    : "Source";

  return (
    <span className={cn("mt-1 block text-[11px] leading-snug text-muted", compact && "mt-0.5")}>
      {provenance.url ? (
        <a
          href={provenance.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          data-compare-event="source_opened"
          className="relative inline-flex items-center gap-1 underline underline-offset-2 transition-colors duration-200 ease-out hover:text-foreground"
        >
          {text}
          <ExternalLink className="size-3 shrink-0" aria-hidden />
          <span className="sr-only">
            {provenance.label ? `, ${provenance.label}` : ""}, opens in a new tab
          </span>
        </a>
      ) : (
        text
      )}
    </span>
  );
}

/* A fact rendered by its type, with its provenance under it. */
export function FactCell({ fact, now }: { fact: Fact; now: number }) {
  let value: React.ReactNode;
  if (fact.flag === true) value = <Yes />;
  else if (fact.flag === false) value = <No />;
  else if (fact.number !== null) value = <span className="tabular-nums">{fact.number}</span>;
  else value = <span>{fact.text}</span>;

  return (
    <span className="block">
      {value}
      {fact.note ? <span className="mt-1 block text-[12px] text-muted">{fact.note}</span> : null}
      <ProvenanceLine provenance={fact.provenance} now={now} compact />
    </span>
  );
}

/* Several facts for one list attribute, one line each. */
export function FactList({ facts, now }: { facts: Fact[]; now: number }) {
  return (
    <ul className="space-y-1.5">
      {facts.map((f) => (
        <li key={f.id}>
          <span>{f.text}</span>
          <ProvenanceLine provenance={f.provenance} now={now} compact />
        </li>
      ))}
    </ul>
  );
}
