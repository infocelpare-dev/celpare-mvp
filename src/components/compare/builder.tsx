"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SaveToCollection } from "@/components/collections/save-to-collection";
import { AddDialog } from "@/components/compare/add-dialog";
import { useCompare } from "@/components/compare/compare-provider";
import { refKey } from "@/lib/compare/params";
import { GOALS, MAX_ITEMS, MIN_ITEMS, type CompareItemType, type OptionRow } from "@/lib/compare/types";

/*
  The selected items, and the controls that change them.

  COLUMN ORDER IS THE PERSON'S. Items stay where they were put. Moving one is a
  pair of buttons, Move left and Move right, never drag alone: ui-ux-pro-max
  rates drag without a single pointer alternative High (WCAG 2.2 dragging
  movements), and a pair of buttons works with a thumb, a mouse and a keyboard.

  EVERY CHANGE IS A URL CHANGE through CompareProvider.navigate, so the back
  button undoes it and a shared link reproduces it exactly.

  AN UNAVAILABLE ITEM KEEPS ITS PLACE and says so, with its own Remove, rather
  than vanishing or taking the comparison down with it (brief section 44).
*/

export type BuilderSlot =
  | {
      status: "ok";
      type: CompareItemType;
      slug: string;
      id: string;
      name: string;
      sublabel: string | null;
      description: string | null;
      logoUrl: string | null;
      href: string | null;
      saved: boolean;
    }
  | {
      status: "unavailable";
      type: CompareItemType;
      slug: string;
      reason: "not_found" | "failed";
    };

export function CompareBuilder({ slots, signedIn }: { slots: BuilderSlot[]; signedIn: boolean }) {
  const { refs, view, goal, navigate, track, pending } = useCompare();
  const noun = view === "models" ? "model" : "tool";
  const nouns = view === "models" ? "models" : "tools";
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState("");

  const selected = new Set(refs.map(refKey));
  const okCount = slots.filter((s) => s.status === "ok").length;
  const full = refs.length >= MAX_ITEMS;

  function add(row: OptionRow) {
    const key = `${row.type}:${row.slug}`;
    if (selected.has(key)) {
      setNote(`${row.name} is already in this comparison.`);
      return;
    }
    if (full) {
      setNote(`A comparison holds up to ${MAX_ITEMS}. Remove one to add ${row.name}.`);
      return;
    }
    setNote("");
    setAdding(false);
    track({ event: "item_added", itemType: row.type, itemId: row.id, position: refs.length });
    if (okCount + 1 === MIN_ITEMS) track({ event: "comparison_started" });
    navigate([...refs, { type: row.type, slug: row.slug }], goal);
  }

  function remove(index: number) {
    const slot = slots[index];
    if (slot.status === "ok") track({ event: "item_removed", itemType: slot.type, itemId: slot.id, position: index });
    navigate(refs.filter((_, i) => i !== index), goal);
  }

  function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= refs.length) return;
    const next = refs.slice();
    [next[index], next[to]] = [next[to], next[index]];
    const slot = slots[index];
    if (slot.status === "ok") track({ event: "item_reordered", itemType: slot.type, itemId: slot.id, position: to });
    navigate(next, goal);
  }

  function chooseGoal(key: (typeof GOALS)[number]["key"]) {
    const next = goal === key ? null : key;
    if (next) track({ event: "goal_selected", section: next });
    navigate(refs, next);
  }

  return (
    <div>
      {/* The strip. Scrolls sideways on a phone, one card per ~70% of the width
          so it is obvious there is more to the right; wraps into a grid from sm. */}
      <ol
        className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3"
        aria-label="Items in this comparison"
      >
        {slots.map((slot, i) => (
          <li
            key={`${slot.type}:${slot.slug}`}
            className="w-[72%] shrink-0 snap-start rounded-2xl border border-border p-4 sm:w-auto"
          >
            {slot.status === "ok" ? (
              <>
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border p-1">
                    {slot.logoUrl ? (
                      <Image src={slot.logoUrl} alt="" width={40} height={40} className="size-full rounded-full object-contain" unoptimized />
                    ) : (
                      <span className="font-display text-[15px] font-semibold text-muted" aria-hidden>
                        {slot.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    {slot.href ? (
                      <Link
                        href={slot.href}
                        data-compare-event="tool_opened_from_comparison"
                        data-compare-item-type={slot.type}
                        data-compare-item-id={slot.id}
                        className="block truncate font-medium underline-offset-4 hover:underline"
                      >
                        {slot.name}
                      </Link>
                    ) : (
                      <p className="truncate font-medium">{slot.name}</p>
                    )}
                    <p className="mt-0.5 truncate text-[12px] text-muted">
                      {slot.type === "tool" ? "Tool" : "Model"}
                      {slot.sublabel ? `, ${slot.sublabel}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    disabled={pending}
                    className="-mr-1.5 -mt-1.5 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
                  >
                    <X className="size-4" aria-hidden />
                    <span className="sr-only">Remove {slot.name}</span>
                  </button>
                </div>
                {slot.description ? (
                  <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted">{slot.description}</p>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1">
                    <MoveButton dir="left" name={slot.name} disabled={pending || i === 0} onClick={() => move(i, -1)} />
                    <MoveButton dir="right" name={slot.name} disabled={pending || i === slots.length - 1} onClick={() => move(i, 1)} />
                  </span>
                  <SaveToCollection
                    entityType={slot.type}
                    entityId={slot.id}
                    initialSaved={slot.saved}
                    signedIn={signedIn}
                    variant="icon"
                    onSaved={() => track({ event: "add_to_collection", itemType: slot.type, itemId: slot.id, position: i })}
                  />
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col">
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden />
                  Item unavailable
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  {slot.reason === "not_found"
                    ? `The ${slot.type} "${slot.slug}" is not in the public catalogue. It may have been renamed or removed.`
                    : `The ${slot.type} "${slot.slug}" could not be loaded just now. Reload to try again.`}
                </p>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  disabled={pending}
                  className="mt-auto inline-flex h-9 cursor-pointer items-center justify-center self-start rounded-xl border border-border px-4 pt-0 text-[14px] transition-colors duration-200 ease-out hover:bg-surface"
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}

        {!full ? (
          <li className="w-[72%] shrink-0 snap-start sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setNote("");
                setAdding(true);
              }}
              aria-haspopup="dialog"
              className={cn(
                "flex h-full min-h-[132px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-4 text-[14px] transition-colors duration-200 ease-out hover:bg-surface",
                slots.length === 0 && "min-h-[160px]",
              )}
            >
              <Plus className="size-5" aria-hidden />
              {slots.length === 0 ? `Add a ${noun}` : `Add another ${noun}`}
            </button>
          </li>
        ) : null}
      </ol>

      <p className="mt-3 text-[13px] text-muted" role="status" aria-live="polite">
        {note ||
          (okCount === 0
            ? `Select at least ${MIN_ITEMS} ${nouns} to start comparing.`
            : okCount === 1
              ? `Add one more ${noun} to compare.`
              : full
                ? `${MAX_ITEMS} is the most that fit side by side. Remove one to add another.`
                : `Comparing ${okCount}. You can add up to ${MAX_ITEMS}.`)}
      </p>

      {okCount >= MIN_ITEMS ? (
        <fieldset className="mt-6">
          <legend className="text-[14px] font-medium">What are you comparing them for?</legend>
          <p className="mt-1 text-[13px] text-muted">
            Optional. It marks the rows that matter for that job. It does not rank anything.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {GOALS.map((g) => {
              const on = goal === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => chooseGoal(g.key)}
                  disabled={pending}
                  className={cn(
                    "inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13px] transition-colors duration-200 ease-out",
                    on ? "border-transparent bg-accent text-on-accent" : "border-border hover:bg-surface",
                  )}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <AddDialog
        type={noun}
        open={adding}
        onClose={() => setAdding(false)}
        onPick={add}
        selected={selected}
        full={full}
      />
    </div>
  );
}

function MoveButton({
  dir,
  name,
  disabled,
  onClick,
}: {
  dir: "left" | "right";
  name: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">
        Move {name} {dir}
      </span>
    </button>
  );
}
