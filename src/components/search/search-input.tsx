"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Hash,
  History,
  Search,
  User,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Suggestion } from "@/lib/search/types";

/*
  The search field, and the only client side part of search that matters.

  IT IS A REAL FORM WITH A REAL GET. Enter submits to /search?q=, so the field
  works with no JavaScript at all, the result page is linkable and shareable, and
  the back button does what everybody expects. The suggestion list is an
  enhancement on top of a control that already worked, never the mechanism.

  THE ARIA PATTERN IS A COMBOBOX, on purpose and in full: aria-expanded on the
  input, aria-controls pointing at the listbox, aria-activedescendant naming the
  highlighted option, role="option" on each row and aria-selected on the active
  one. Half of that pattern is worse than none, because a screen reader then
  announces a listbox whose selection it cannot follow.

  DEBOUNCED, ABORTED, AND ORDERED. A keystroke cancels the request before it, so
  a slow answer for "cla" can never overwrite a fast one for "claude": the
  previous AbortController is aborted and a sequence number is checked on arrival.
  Without both, autocomplete flickers between answers under a bad connection.

  16px BELOW sm. D91: iOS Safari zooms the page whenever a focused field computes
  under 16px and never zooms back out.
*/

const ICONS: Record<Suggestion["kind"], LucideIcon> = {
  recent: History,
  tool: Wrench,
  model: Boxes,
  person: User,
  category: Hash,
  topic: Hash,
};

const DEBOUNCE_MS = 160;
const MIN_CHARS = 2;

export function SearchInput({
  /* What the page was rendered for, so the field agrees with the results under
     it after a navigation. */
  initialQuery,
  placeholder = "Search tools, models and people",
  autoFocus = false,
}: {
  initialQuery: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);
  const listId = useId();

  /*
    THE FIELD FOLLOWS THE URL, AND THIS IS NOT AN EFFECT.

    Pressing back from a result page has to put the previous query back in the
    box, or the box and the page under it disagree. Doing that in an effect means
    a render with the stale value, then a second render to correct it, which is
    the cascading render react-hooks/set-state-in-effect exists to stop. React
    documents this instead: compare the prop against what it was last render and
    adjust during the render that noticed. It also keeps the caret and the focus,
    which a keyed remount would throw away.
  */
  const [lastQuery, setLastQuery] = useState(initialQuery);
  if (initialQuery !== lastQuery) {
    setLastQuery(initialQuery);
    setValue(initialQuery);
  }

  useEffect(() => {
    const q = value.trim();
    /*
      Too short to suggest anything. Nothing is CLEARED here on purpose: a
      setState in an effect body is the cascading render above, and it is not
      needed, because whether the list shows is derived below from the length of
      what is in the field. Stale suggestions sit in state unseen until the next
      answer replaces them.
    */
    if (q.length < MIN_CHARS) return;

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = (seqRef.current += 1);

      fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((data: { suggestions?: Suggestion[] }) => {
          /* A late answer for an earlier query is dropped rather than shown. */
          if (seq !== seqRef.current) return;
          const next = data.suggestions ?? [];
          setSuggestions(next);
          setActive(-1);
          setOpen(next.length > 0);
        })
        .catch(() => {
          /* An aborted request is the normal case here, not a failure. A real
             network error means no suggestions, which is what the field already
             shows. */
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value]);

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function choose(suggestion: Suggestion) {
    close();
    /* A suggestion either runs a search or opens a thing. Both are real URLs, so
       both are a navigation rather than a state change. */
    router.push(suggestion.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      /* Escape closes the list. It does NOT clear the field: losing what was
         typed is the one thing Escape must not do here. */
      if (open) {
        e.preventDefault();
        close();
      }
      return;
    }

    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && active >= 0) {
      /* Only when something is highlighted. With nothing highlighted, Enter has
         to submit the form with what was typed, which is what somebody who
         ignored the list means by pressing it. */
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === "Tab") {
      close();
    }
  }

  const activeId = active >= 0 ? `${listId}-option-${active}` : undefined;

  /* Derived, not stored. `open` is the person's intent (focused, not escaped) and
     this is whether there is anything to show for it. */
  const showList =
    open && suggestions.length > 0 && value.trim().length >= MIN_CHARS;

  return (
    <div className="relative flex-1">
      <form action="/search" method="get" role="search" onSubmit={close}>
        {/*
          A visible label would be a second heading on a page whose whole subject
          is this field, so the name is sr-only text rather than an aria-label:
          it is in the DOM, it survives translation, and the magnifier beside it
          carries the same meaning visually. The ux guidance rates a placeholder
          used AS a label High severity, which is why the placeholder is an
          example rather than the name of the field.
        */}
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search Celpare
        </label>

        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted"
          aria-hidden
        />

        <input
          ref={inputRef}
          id={`${listId}-input`}
          name="q"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={() => {
            /* Deferred, or a click on a suggestion is cancelled by the blur that
               precedes it. */
            setTimeout(close, 120);
          }}
          placeholder={placeholder}
          autoComplete="off"
          /* The browser's own suggestion list would sit on top of ours. */
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          className={cn(
            "h-12 w-full rounded-xl border border-border bg-background",
            "ps-11 pe-11 text-[16px] text-foreground placeholder:text-muted sm:text-[15px]",
            /* Safari draws its own clear button on type=search and ours is
               already there, so it is removed rather than doubled. */
            "[&::-webkit-search-cancel-button]:hidden",
          )}
        />

        {value.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              setSuggestions([]);
              close();
              inputRef.current?.focus();
            }}
            /* 40px, which clears the 24px WCAG 2.2 target minimum inside a 48px
               field. */
            className="absolute end-1 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            <X className="size-[18px]" aria-hidden />
            <span className="sr-only">Clear the search field</span>
          </button>
        ) : null}
      </form>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border border-border bg-background py-1"
        >
          {suggestions.map((s, i) => {
            const Icon = ICONS[s.kind] ?? Search;
            return (
              <li
                key={`${s.kind}-${s.href}-${i}`}
                id={`${listId}-option-${i}`}
                role="option"
                aria-selected={i === active}
                /* onMouseDown, not onClick: mousedown fires before the input's
                   blur, so the choice is made before the list can close. */
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-3.5 py-2.5",
                  i === active ? "bg-surface" : "bg-transparent",
                )}
              >
                <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{s.label}</span>
                  {s.sublabel ? (
                    <span className="block truncate text-[13px] text-muted">
                      {s.sublabel}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
