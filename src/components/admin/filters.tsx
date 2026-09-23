import { cn } from "@/lib/utils";

/*
  Filters, as a plain GET form.

  No client JavaScript anywhere in this file, on purpose. A filter is a place:
  it belongs in the URL so it survives a reload, can be linked to a colleague,
  and goes back where it came from. A GET form does exactly that natively, works
  before hydration, and needs no state to keep in sync with the address bar.

  The cost is one submit per change rather than filtering as you type, which on
  a server rendered table is the honest behaviour anyway: the rows come from the
  database, so something has to go and fetch them either way.
*/

export type FilterOption = { value: string; label: string };

export type FilterSelect = {
  name: string;
  label: string;
  value?: string;
  /* The empty option. Named rather than blank, because a select showing nothing
     reads as broken and a select showing "All statuses" reads as a state. */
  anyLabel: string;
  options: FilterOption[];
};

const CONTROL =
  "h-9 rounded-lg border border-border bg-background px-2.5 text-[13px] text-foreground transition-colors duration-200 ease-out hover:bg-surface";

export function FilterBar({
  action,
  search,
  selects = [],
  /* Values that must survive a filter change but are not themselves filters.
     The page number is deliberately not one of them: changing a filter should
     return to page one, or you land on page 7 of a 2 page result. */
  hidden = {},
  children,
}: {
  action: string;
  search?: { name: string; placeholder: string; value?: string };
  selects?: FilterSelect[];
  hidden?: Record<string, string | undefined>;
  children?: React.ReactNode;
}) {
  return (
    <form
      action={action}
      method="get"
      className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3"
    >
      {Object.entries(hidden).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}

      {search ? (
        <label className="flex min-w-[180px] flex-1 flex-col gap-1">
          <span className="text-[12px] font-medium uppercase tracking-wide text-muted">
            Search
          </span>
          <input
            type="search"
            name={search.name}
            defaultValue={search.value ?? ""}
            placeholder={search.placeholder}
            className={cn(CONTROL, "w-full")}
          />
        </label>
      ) : null}

      {selects.map((select) => (
        <label key={select.name} className="flex flex-col gap-1">
          <span className="text-[12px] font-medium uppercase tracking-wide text-muted">
            {select.label}
          </span>
          <select name={select.name} defaultValue={select.value ?? ""} className={CONTROL}>
            <option value="">{select.anyLabel}</option>
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      {children}

      <button
        type="submit"
        className="h-9 rounded-full border border-transparent bg-primary px-4 text-[13px] font-medium text-on-primary transition-colors duration-200 ease-out hover:bg-primary-hover"
      >
        Apply
      </button>
      {/* A link rather than a reset button: reset restores the form's defaults,
          which are the filters currently applied, so it would appear to do
          nothing. Clearing means going to the unfiltered URL. */}
      <a
        href={action}
        className="flex h-9 items-center rounded-lg border border-border px-3 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
      >
        Clear
      </a>
    </form>
  );
}

/*
  Tabs that are links, for the coarse filter a page leads with.

  Separate from FilterBar because the two do different jobs: this is the one
  choice that changes what the page is about, the bar below it narrows within
  that choice. Putting the first as a select in the second buries it.
*/
export function FilterTabs({
  items,
  active,
  label,
}: {
  items: { href: string; label: string; count?: number }[];
  active: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => {
        const isActive = item.href === active;
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] transition-colors duration-200 ease-out",
              isActive
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {item.label}
            {/* Hidden at zero, per 10-community.md. A count of nothing is not
                worth the ink and makes every tab look equally busy. */}
            {item.count ? (
              <span className="tnum rounded-full bg-surface px-1.5 py-0.5 text-[11px] text-muted">
                {item.count.toLocaleString("en-GB")}
              </span>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}
