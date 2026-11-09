"use client";

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { Avatar } from "@/components/ui/avatar";
import { VerifiedTick } from "@/components/ui/verified-tick";
import { cn } from "@/lib/utils";
import { insertMention, mentionAtCaret } from "@/lib/community/mentions";
import type { Suggestion } from "@/lib/search/types";

/*
  Type @ and pick a person (founder, 2026-11-09: mentions in posts, comments
  and messages). One hook for every text field that takes a mention: the
  comment box, the post composer and the message box.

  People come from the search suggestions (/api/search/suggest), so who can be
  found is exactly who search shows this viewer; nothing new is exposed. Two
  letters after the @ before it asks, as search does. Choosing a person writes
  @username into the text; the database turns that into the mention and the
  notification when the post or comment is saved.

  Keyboard: Up and Down move, Enter or Tab picks, Escape closes. While the list
  is open, Enter picks rather than sends.
*/

export type MentionCandidate = { username: string; name: string; imageUrl: string | null; verified: boolean };

const DEBOUNCE_MS = 150;
const SHOW = 6;

export function useMentionPicker({
  setValue,
  fieldRef,
}: {
  /* Writes the new text. The current text is always read from the field
     itself, so this works for controlled and uncontrolled fields alike. */
  setValue: (next: string) => void;
  fieldRef: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
}) {
  const [at, setAt] = useState<{ start: number; query: string } | null>(null);
  const [people, setPeople] = useState<MentionCandidate[]>([]);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const seq = useRef(0);
  const listId = useId();

  /* Where the caret is decides whether a mention is being typed. Read after
     every edit and every caret move. */
  const sync = useCallback(() => {
    const el = fieldRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const found = mentionAtCaret(el.value, caret);
    setAt(found);
    if (!found || found.start !== dismissed) setDismissed(null);
  }, [fieldRef, dismissed]);

  useEffect(() => {
    const query = at?.query ?? "";
    if (!at || query.length < 2) return;
    const mine = ++seq.current;
    const timer = window.setTimeout(() => {
      fetch(`/api/search/suggest?q=${encodeURIComponent(query)}&limit=20`)
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((data: { suggestions?: Suggestion[] }) => {
          if (mine !== seq.current) return;
          const found = (data.suggestions ?? [])
            .filter((s) => s.kind === "person" && s.href.startsWith("/u/"))
            .slice(0, SHOW)
            .map((s) => ({
              username: s.href.slice(3),
              name: s.label,
              imageUrl: s.imageUrl ?? null,
              verified: Boolean(s.verified),
            }));
          setPeople(found);
          setActive(0);
        })
        .catch(() => {
          /* No suggestions is what the field already shows. */
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [at]);

  const open = Boolean(at && at.query.length >= 2 && people.length > 0 && dismissed !== at.start);

  function choose(person: MentionCandidate) {
    const el = fieldRef.current;
    if (!el || !at) return;
    const caret = el.selectionStart ?? el.value.length;
    const next = insertMention(el.value, at.start, caret, person.username);
    setValue(next.text);
    setAt(null);
    setPeople([]);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }

  /* Returns true when the key was the picker's, so the field does nothing else
     with it (above all, Enter does not send). */
  function onKeyDown(e: React.KeyboardEvent): boolean {
    if (!open) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % people.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + people.length) % people.length);
      return true;
    }
    if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
      e.preventDefault();
      choose(people[active]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setDismissed(at?.start ?? null);
      return true;
    }
    return false;
  }

  /* Spread onto the field: the combobox half of the pattern. */
  const fieldProps = {
    onSelect: sync,
    onKeyUp: sync,
    onClick: sync,
    onBlur: () => window.setTimeout(() => setAt(null), 150),
    "aria-autocomplete": "list" as const,
    "aria-expanded": open,
    "aria-controls": open ? listId : undefined,
    "aria-activedescendant": open ? `${listId}-${active}` : undefined,
  };

  /* Above the field by default, because the comment and message boxes sit at
     the bottom of the screen; below for a box at the top of a page. */
  function list(tone: "light" | "dark" = "light", place: "above" | "below" = "above") {
    if (!open) return null;
    const dark = tone === "dark";
    return (
      <ul
        id={listId}
        role="listbox"
        aria-label="People to mention"
        className={cn(
          "absolute inset-x-0 z-30 max-h-[min(50vh,320px)] overflow-y-auto overscroll-contain rounded-2xl border py-1",
          place === "above" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
          dark ? "border-white/20 bg-neutral-900 text-white" : "border-border bg-background text-foreground",
        )}
      >
        {people.map((p, i) => (
          <li
            key={p.username}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            /* mousedown, before the field's blur closes the list. */
            onMouseDown={(e) => {
              e.preventDefault();
              choose(p);
            }}
            onMouseEnter={() => setActive(i)}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 px-3.5 py-2",
              i === active ? (dark ? "bg-white/10" : "bg-surface") : "bg-transparent",
            )}
          >
            <Avatar fullName={p.name} username={p.username} avatarUrl={p.imageUrl} size="sm" className="size-7 text-[12px]" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[14px] font-medium">{p.name}</span>
                {p.verified ? <VerifiedTick label="Verified developer" className="shrink-0" /> : null}
              </span>
              <span className={cn("block truncate text-[13px]", dark ? "text-white/60" : "text-muted")}>@{p.username}</span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return { onKeyDown, fieldProps, list, sync };
}
