"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { PenSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startThread } from "@/app/actions/messages";
import type { DmPerson } from "@/lib/messages/queries";
import { cn } from "@/lib/utils";

/*
  Start a conversation.

  A disclosure rather than a modal, and no browser dialog anywhere: a native
  dialog blocks every later event, cannot be styled and cannot be dismissed
  with the rest of the page. Escape closes this, a press outside closes it.

  THE ACTION IS IDEMPOTENT, which is why this does not have to check whether a
  thread already exists. dm_start_thread finds the existing one to one thread
  or creates it, so picking the same person twice opens the same conversation
  rather than a second empty one.

  `DmPerson` is imported as a TYPE ONLY. lib/messages/queries.ts is marked
  server-only, and a value import from here would drag it into the client
  bundle and fail the build. A type import is erased at compile time.
*/
export function NewThread({ people }: { people: DmPerson[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(startThread, {
    status: "idle" as const,
    message: "",
  });
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.querySelector("button")?.focus();
  }, [open]);

  if (people.length === 0) {
    /* Nobody else has an account yet. A button that opens an empty list is a
       dead end, so it is absent rather than disabled, which is the same call
       FeaturedShelf makes when nothing is featured. */
    return (
      <p className="text-[13px] text-muted">
        Nobody else has joined yet.
      </p>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <PenSquare className="size-4" aria-hidden />
        New message
      </Button>

      {open ? (
        <div
          ref={panelRef}
          className="absolute end-0 top-full z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-background p-2"
        >
          <p className="px-3 pb-1 pt-2 text-[12px] font-medium uppercase tracking-wide text-muted">
            Send to
          </p>

          <ul className="max-h-[50vh] overflow-y-auto">
            {people.map((person) => (
              <li key={person.id}>
                {/*
                  One tiny form per person rather than one form with a select.
                  A select would need its own state and a second press to
                  submit; this is one press, and it degrades to a real POST
                  with no JavaScript.
                */}
                <form action={action}>
                  <input type="hidden" name="userId" value={person.id} />
                  <PersonButton person={person} />
                </form>
              </li>
            ))}
          </ul>

          {state.status === "error" ? (
            <p role="alert" className="px-3 py-2 text-[13px] text-foreground">
              {state.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PersonButton({ person }: { person: DmPerson }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "flex h-11 w-full items-center gap-2 rounded-lg px-3 text-start text-[14px]",
        "transition-colors duration-200 ease-out hover:bg-surface disabled:opacity-60",
      )}
    >
      {/* The handle alone. Nothing public shows a real name any more. */}
      <span className="min-w-0 flex-1 truncate">@{person.username}</span>
    </button>
  );
}
