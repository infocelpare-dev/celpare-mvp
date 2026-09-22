"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bookmark, Check, Library, Lock, Globe, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  createCollectionWith,
  loadSaveTargets,
  toggleInCollection,
} from "@/app/actions/collections";
import { NO_TARGETS, type SaveEntity, type SaveTargets } from "@/lib/collections/types";

/*
  Save to a collection.

  THE PICKER DECIDES, AND NOTHING IS WRITTEN WHEN IT OPENS. Founder decision
  2026-09-21: tapping Save shows this and the item is saved only when a row is
  toggled, so closing it without touching anything leaves the world as it was.
  That is why the trigger button below never writes: it opens.

  COLLECTIONS ONLY. THERE IS NO SEPARATE SAVED LIST. Founder instruction, later
  the same day: a tool, a model or a post is saved BY being put in a collection,
  so the Saved row that used to sit at the top of this list is gone and saving is
  one idea rather than two. The button still reads Saved, because it is, and what
  it now means is "in at least one of your collections".

  That is not only a change of wording. posts.save_count, the profile tabs and the
  per plan save caps are all built on the plain saved tables, so the database
  mirrors collection membership into them: tg_mirror_collection_save keeps them
  true, and leaving one collection while still in another does not unsave. One
  source of truth, which is the collection.

  ONE POOL, NOT ONE PER SECTION. The same collection holds tools, models and
  posts. A person's "AI Video" is about the subject, not about which table the
  thing came out of.

  IT IS A NATIVE <dialog>, NOT A DIV. showModal() gives the focus trap, the
  Escape key, the inert background and the top layer for free, all of which are
  easy to get wrong by hand and are the difference between a modal and a box that
  looks like one. The ux guidance rates a keyboard trap and an illogical tab order
  High, and this is the one pattern where the platform already solves both.

  EVERY ROW IS A BUTTON WITH aria-pressed, not a checkbox inside a label. The
  guidance rates a clickable div Critical and a compact control should expose a
  pressed state that matches its visible label. A tick that is drawn but not
  announced is the same defect in a nicer font.

  OPTIMISTIC, WITH A ROLLBACK. The tick moves on the tap and goes back if the
  server disagrees, which is the rule 10-community.md already set for like and
  save. Deliberately not useOptimistic: nothing revalidates this list underneath
  the person while the modal is open, so plain state plus a rollback is both
  simpler and more honest about what is being shown.
*/

export function SaveToCollection({
  entityType,
  entityId,
  /* What the page already knows, so the button is not blank on first paint. The
     picker re-reads the truth when it opens. */
  initialSaved,
  signedIn,
  /* The tool page shows a wide labelled button, a feed card a compact icon, and
     the video viewer's three dot menu a full width row that matches the items
     beside it. Three shapes, one picker: the alternative was a second save
     control inside the menu, which is the duplicate system the brief rules out. */
  variant = "button",
  /* The public save count, for surfaces that carry one. Posts do; a tool does
     not, because tools have no save_count column and inventing one would be the
     metric D13 and D30 rule out. Hidden at zero, per the post card rule. */
  count,
  /* Fired when a toggle lands, so a surface that records its own analytics can
     note the save without this component knowing anything about analytics. */
  onSaved,
  className,
}: {
  entityType: SaveEntity;
  entityId: string;
  initialSaved: boolean;
  signedIn: boolean;
  variant?: "button" | "icon" | "menu";
  count?: number;
  onSaved?: () => void;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<SaveTargets>(NO_TARGETS);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  /*
    The button's own state, kept separate from `targets` so it stays correct
    while the modal is shut and while the read is in flight.

    It follows the prop when the page re-renders with a new truth, and that is a
    RENDER TIME ADJUSTMENT rather than an effect. An effect would render once
    with the stale value and again to correct it, which is the cascade
    react-hooks/set-state-in-effect exists to stop. Same pattern as the search
    field, and React documents it for exactly this case.
  */
  const [saved, setSaved] = useState(initialSaved);
  const [lastInitial, setLastInitial] = useState(initialSaved);
  if (initialSaved !== lastInitial) {
    setLastInitial(initialSaved);
    setSaved(initialSaved);
  }

  /* showModal is imperative and has no React equivalent, which is exactly the
     case an effect is for: synchronising an external system with state. */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function openPicker() {
    setMessage("");
    setCreating(false);
    setOpen(true);
    setLoading(true);
    startTransition(async () => {
      const next = await loadSaveTargets(entityType, entityId);
      setTargets(next);
      setSaved(next.collections.some((c) => c.contains));
      setLoading(false);
    });
  }

  function closePicker() {
    setOpen(false);
    /* Focus goes back where it came from. The browser does this for a dialog
       closed by Escape, and not for one closed by our own button. */
    triggerRef.current?.focus();
  }

  function onToggleCollection(id: string) {
    const before = targets.collections.find((c) => c.id === id)?.contains ?? false;
    setMessage("");
    /* Saved is now a fact ABOUT THE COLLECTIONS: in at least one of them. The
       bookmark on the page behind the modal follows this, so it is computed from
       the list rather than tracked separately. */
    setSaved(
      targets.collections.some((c) => (c.id === id ? !before : c.contains)),
    );
    setTargets((t) => ({
      ...t,
      collections: t.collections.map((c) =>
        c.id === id
          ? {
              ...c,
              contains: !before,
              /* The count on the row moves with the tick, or the row contradicts
                 itself until the modal is reopened. */
              itemCount: Math.max(0, c.itemCount + (before ? -1 : 1)),
            }
          : c,
      ),
    }));

    startTransition(async () => {
      const result = await toggleInCollection(id, entityType, entityId);
      if (result.status === "ok") {
        /* Only on the way in. Un-filing is not a save and recording it as one
           would tell a later ranker the opposite of what happened. */
        if (!before) onSaved?.();
      }
      if (result.status === "error") {
        setTargets((t) => ({
          ...t,
          collections: t.collections.map((c) =>
            c.id === id
              ? {
                  ...c,
                  contains: before,
                  itemCount: Math.max(0, c.itemCount + (before ? 1 : -1)),
                }
              : c,
          ),
        }));
        setSaved(targets.collections.some((c) => c.contains));
        setMessage(result.message);
      }
    });
  }

  const atLimit = targets.limit !== null && targets.used >= targets.limit;

  /* The count the page rendered, adjusted by what has changed since. Derived
     rather than stored, so it cannot drift from `saved`. */
  const shownCount =
    count === undefined
      ? undefined
      : Math.max(0, count + (saved === initialSaved ? 0 : saved ? 1 : -1));

  if (!signedIn) {
    /* A control that cannot work is defect F4, so a signed out visitor gets the
       way to fix that rather than a button that refuses. */
    if (variant === "menu") {
      return (
        <Link
          href="/get-started"
          role="menuitem"
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-start text-[14px]",
            "transition-colors duration-200 ease-out hover:bg-surface",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            className,
          )}
        >
          <Bookmark className="size-[18px] shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate">Save</span>
        </Link>
      );
    }
    return variant === "icon" ? (
      <ButtonLink href="/get-started" variant="ghost" size="sm" className={className}>
        <Bookmark className="size-[18px]" aria-hidden />
        <span className="sr-only">Sign in to save</span>
        {count !== undefined && count > 0 ? (
          <span className="tabular-nums text-[13px]">{count}</span>
        ) : null}
      </ButtonLink>
    ) : (
      <ButtonLink href="/get-started" variant="outline" size="sm" className={className}>
        <Bookmark className="size-4" aria-hidden />
        Save
      </ButtonLink>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        {...(variant === "menu" ? { role: "menuitem" } : null)}
        className={cn(
          "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[14px] transition-colors duration-200 ease-out",
          saved
            ? "border-foreground bg-surface text-foreground"
            : "border-border text-muted hover:bg-surface hover:text-foreground",
          /* On a feed card it lines up with the other 44px pill controls, and
             it widens only when it is carrying a count. */
          variant === "icon" &&
            "h-11 min-w-11 justify-center rounded-full border-transparent px-3 hover:bg-surface",
          /* In a menu it is a row like the rows around it: full width, start
             aligned, no border of its own. */
          variant === "menu" &&
            "h-auto min-h-11 w-full justify-start gap-3 rounded-xl border-transparent px-3 text-start text-foreground hover:bg-surface",
          className,
        )}
      >
        <Bookmark
          className={cn(
            variant === "button" ? "size-4" : "size-[18px]",
            "shrink-0",
            saved && "fill-current",
            variant === "menu" && !saved && "text-muted",
          )}
          aria-hidden
        />
        {variant === "icon" ? (
          <span className="sr-only">{saved ? "Saved. Change where" : "Save"}</span>
        ) : variant === "menu" ? (
          <span className="min-w-0 flex-1 truncate">{saved ? "Saved" : "Save"}</span>
        ) : (
          <span>{saved ? "Saved" : "Save"}</span>
        )}
        {variant !== "menu" && shownCount !== undefined && shownCount > 0 ? (
          <span className="tabular-nums text-[13px]">{shownCount}</span>
        ) : null}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="save-picker-title"
        /* The browser fires this for Escape and for a backdrop dismissal, so the
           React state cannot drift out of step with the element. */
        onClose={() => setOpen(false)}
        /* A click on the backdrop lands on the dialog itself rather than on any
           of its children, which is the standard test for "outside". */
        onClick={(e) => {
          if (e.target === dialogRef.current) closePicker();
        }}
        className={cn(
          "w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-border bg-background p-0 text-foreground",
          "backdrop:bg-black/50",
          /*
            m-auto IS LOAD BEARING. A modal dialog centres itself in the top
            layer through `margin: auto`, and Tailwind's preflight sets
            `margin: 0` on every element, which silently undoes it. Without this
            the picker renders in the top left corner of the viewport, which is
            exactly what it did in the browser on the first try.
          */
          "m-auto",
          /* Stops a long list running off a short screen. */
          "max-h-[min(560px,calc(100dvh-4rem))]",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id="save-picker-title" className="text-[16px] font-semibold">
            Save to collection
          </h2>
          <button
            type="button"
            onClick={closePicker}
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            <X className="size-[18px]" aria-hidden />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="max-h-[360px] overflow-y-auto px-2 py-2">
          {loading ? (
            <p className="px-3 py-4 text-[14px] text-muted" role="status">
              Loading your collections
            </p>
          ) : targets.collections.length > 0 ? (
            <>
              <p className="px-3 pb-1 pt-3 text-[13px] font-medium text-muted">
                Your collections
              </p>
              {targets.collections.map((c) => (
                <Row
                  key={c.id}
                  label={c.name}
                  sublabel={`${c.itemCount} ${c.itemCount === 1 ? "item" : "items"}${
                    c.isPublic ? ", public" : ""
                  }`}
                  icon={<Library className="size-[18px]" aria-hidden />}
                  trailing={
                    c.isPublic ? (
                      <Globe className="size-3.5 text-muted" aria-hidden />
                    ) : (
                      <Lock className="size-3.5 text-muted" aria-hidden />
                    )
                  }
                  on={c.contains}
                  onClick={() => onToggleCollection(c.id)}
                />
              ))}
            </>
          ) : (
            /*
              No collections at all, which is every account's first save now that
              there is no separate saved list to fall back on. It says what to do
              rather than showing an empty box, and Create is right underneath.
            */
            <p className="px-3 py-4 text-[14px] leading-relaxed text-muted">
              You have no collections yet. Make one to save this into.
            </p>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          {creating ? (
            <CreateForm
              entityType={entityType}
              entityId={entityId}
              onCancel={() => setCreating(false)}
              onCreated={(row) => {
                /* Straight into the list, already ticked, which is the last step
                   of the founder's flow: the new collection is selected and the
                   thing is in it. No refetch, because the server just told us
                   both facts. */
                setTargets((t) => ({
                  ...t,
                  used: t.used + 1,
                  collections: [row, ...t.collections],
                }));
                setSaved(true);
                setCreating(false);
                setMessage(`Saved to ${row.name}.`);
              }}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCreating(true)}
                disabled={atLimit}
                className="inline-flex h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-[15px] transition-colors duration-200 ease-out hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="size-4 shrink-0" aria-hidden />
                Create collection
              </button>

              {/*
                The limit is explained BEFORE the attempt, not reported after it.
                The database would refuse with plan_limit_reached anyway, and a
                button that is always going to fail is defect F4.
              */}
              {atLimit ? (
                <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
                  {targets.limit === 1
                    ? "Your plan includes one collection."
                    : `Your plan includes ${targets.limit} collections.`}{" "}
                  <a
                    href="/pricing"
                    className="text-foreground underline underline-offset-4"
                  >
                    See plans
                  </a>
                </p>
              ) : null}
            </>
          )}

          {/* One live region for the whole modal. The ux guidance rates a silent
              outcome a defect, and a toggle that quietly failed is the worst
              version of that: the tick says one thing and the database another. */}
          <p role="status" aria-atomic="true" className="mt-2.5 text-[13px] text-muted">
            {pending && !loading ? "Saving" : message}
          </p>
        </div>
      </dialog>
    </>
  );
}

/* A row in the picker. A button with aria-pressed, never a div. */
function Row({
  label,
  sublabel,
  icon,
  trailing,
  on,
  onClick,
  disabled,
}: {
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors duration-200 ease-out hover:bg-surface disabled:opacity-50"
    >
      <span className="shrink-0 text-muted">{icon}</span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px]">{label}</span>
          {trailing}
        </span>
        {sublabel ? (
          <span className="block truncate text-[13px] text-muted">{sublabel}</span>
        ) : null}
      </span>

      {/*
        The tick is a box that is either filled or outlined, so the state is
        carried by shape and fill rather than by colour alone. aria-pressed on
        the button is what announces it; this is the visual half.
      */}
      <span
        aria-hidden
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-md border",
          on ? "border-foreground bg-accent text-on-accent" : "border-border",
        )}
      >
        {on ? <Check className="size-3.5" /> : null}
      </span>
    </button>
  );
}

/*
  Create a collection, with the thing going into it in the same call.

  Name, optional description, public or private, exactly as the founder drew it.
  Not a separate page: the person is mid save, and sending them away to come back
  would lose what they were saving.
*/
function CreateForm({
  entityType,
  entityId,
  onCancel,
  onCreated,
}: {
  entityType: SaveEntity;
  entityId: string;
  onCancel: () => void;
  onCreated: (row: {
    id: string;
    name: string;
    description: string | null;
    isPublic: boolean;
    itemCount: number;
    contains: boolean;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await createCollectionWith({
        name,
        description: description.trim() || undefined,
        isPublic,
        entityType,
        entityId,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      onCreated({
        id: result.collectionId ?? "",
        name: name.trim(),
        description: description.trim() || null,
        isPublic,
        itemCount: 1,
        contains: true,
      });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label htmlFor="collection-name" className="mb-1.5 block text-[14px] font-medium">
          Collection name
        </label>
        <input
          ref={nameRef}
          id="collection-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          aria-describedby={error ? "collection-error" : undefined}
          /* 16px below sm, per D91: iOS zooms the page for anything smaller and
             never zooms back out, which inside a dialog is worse again. */
          className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-[16px] sm:text-[15px]"
        />
      </div>

      <div>
        <label
          htmlFor="collection-description"
          className="mb-1.5 block text-[14px] font-medium"
        >
          Description <span className="font-normal text-muted">optional</span>
        </label>
        <textarea
          id="collection-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={2}
          className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[16px] sm:text-[15px]"
        />
      </div>

      {/* Two radios rather than a switch, because these are two named choices
          and a switch would make one of them the unlabelled opposite of the
          other. Private is the default: publishing is a decision, not a
          side effect of not noticing a control. */}
      <fieldset>
        <legend className="mb-1.5 text-[14px] font-medium">Who can see it</legend>
        <div className="flex gap-2">
          {[
            { value: false, label: "Private", icon: Lock, hint: "Only you" },
            { value: true, label: "Public", icon: Globe, hint: "On your profile" },
          ].map((option) => (
            <label
              key={String(option.value)}
              className={cn(
                "flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[14px] transition-colors duration-200 ease-out",
                isPublic === option.value
                  ? "border-foreground bg-surface"
                  : "border-border text-muted hover:bg-surface",
              )}
            >
              <input
                type="radio"
                name="visibility"
                checked={isPublic === option.value}
                onChange={() => setIsPublic(option.value)}
                className="sr-only"
              />
              <option.icon className="size-4 shrink-0" aria-hidden />
              <span>
                {option.label}
                <span className="block text-[12px] text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error ? (
        <p id="collection-error" className="text-[13px] text-foreground">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" disabled={pending || name.trim().length === 0}>
          {pending ? "Creating" : "Create"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
