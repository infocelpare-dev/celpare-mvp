"use client";

import { useActionState, useId, useState } from "react";
import { upsertTaxonomy, deleteTaxonomy } from "@/app/actions/admin";
import { IDLE } from "@/lib/admin/action-state";
import { ActionMessage } from "./action-form";
import { cn } from "@/lib/utils";

/*
  One category or topic.

  Two modes from one component: `entry` absent is the create form, `entry`
  present is the row editor. They validate the same fields against the same
  routine, so splitting them would mean keeping two copies of the slug rules in
  step.

  The slug is the field that matters. It ends up in a URL, which is why it is
  the only one that carries a warning once anything is using it, and why
  admin_upsert_taxonomy checks the pattern again in SQL rather than trusting
  what this posts.
*/

type Entry = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  uses: number;
};

const input =
  "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none transition-colors duration-200 ease-out focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[12px] font-medium text-muted">
      {children}
    </label>
  );
}

export function TaxonomyForm({
  kind,
  entry,
}: {
  kind: "category" | "topic";
  entry?: Entry;
}) {
  const [state, formAction, pending] = useActionState(upsertTaxonomy, IDLE);
  const id = useId();
  const editing = Boolean(entry);

  /*
    Uncontrolled, with a key that changes when the server's copy does. React 19
    resets a form after its action completes, which would otherwise put every
    field back to its HTML default rather than to what was just saved. See
    docs/RESUME.md section 9.
  */
  const seed = `${entry?.id ?? "new"}-${state.status}`;

  return (
    <form action={formAction} key={seed} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_88px]">
        <div className="space-y-1">
          <Label htmlFor={`${id}-name`}>Name</Label>
          <input
            id={`${id}-name`}
            name="name"
            defaultValue={entry?.name ?? ""}
            required
            maxLength={80}
            className={input}
            placeholder={kind === "topic" ? "Prompt engineering" : "Writing"}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${id}-slug`}>Slug</Label>
          <input
            id={`${id}-slug`}
            name="slug"
            defaultValue={entry?.slug ?? ""}
            required
            maxLength={60}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className={cn(input, "font-mono")}
            placeholder="prompt-engineering"
            aria-describedby={`${id}-slug-hint`}
          />
          <p id={`${id}-slug-hint`} className="text-[11px] leading-snug text-muted">
            {entry && entry.uses > 0
              ? `In a URL already. Renaming it breaks links to ${entry.uses} item${entry.uses === 1 ? "" : "s"}.`
              : "Lowercase, digits and single hyphens."}
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor={`${id}-sort`}>Order</Label>
          <input
            id={`${id}-sort`}
            name="sortOrder"
            type="number"
            min={0}
            max={9999}
            defaultValue={entry?.sort_order ?? 0}
            className={cn(input, "tnum")}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <input
          id={`${id}-description`}
          name="description"
          defaultValue={entry?.description ?? ""}
          maxLength={500}
          className={input}
          placeholder="Optional. Shown wherever the list is explained."
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-reason`}>Reason</Label>
        <input
          id={`${id}-reason`}
          name="reason"
          maxLength={1000}
          className={input}
          placeholder="Optional. Goes in the audit log."
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-transparent bg-accent px-3 text-[13px] font-medium text-on-accent transition-opacity duration-200 ease-out hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Saving..." : editing ? "Save" : `Add ${kind}`}
        </button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

/*
  Delete, separated from the editor so a stray Enter in the name field cannot
  reach it. Refused by the database while anything still points at the entry,
  which is the check that matters: this button only asks.
*/
export function TaxonomyDelete({
  kind,
  entry,
}: {
  kind: "category" | "topic";
  entry: Entry;
}) {
  const [state, formAction, pending] = useActionState(deleteTaxonomy, IDLE);
  const [open, setOpen] = useState(false);

  if (entry.uses > 0) {
    return (
      <span className="text-[11px] leading-snug text-muted">
        Used by {entry.uses} item{entry.uses === 1 ? "" : "s"}, so it cannot be deleted.
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-border px-2.5 text-[12px] text-muted transition-colors duration-200 ease-out hover:border-danger hover:text-danger"
      >
        Delete
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={entry.id} />
      <input
        name="reason"
        placeholder="Reason, for the audit log"
        maxLength={1000}
        className="h-8 w-56 rounded-lg border border-border bg-background px-2.5 text-[12px] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-danger bg-danger-surface px-2.5 text-[12px] font-medium text-danger-text transition-opacity duration-200 ease-out hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? "Deleting..." : `Delete ${entry.name}`}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="inline-flex h-8 cursor-pointer items-center rounded-lg px-2 text-[12px] text-muted hover:text-foreground"
      >
        Cancel
      </button>
      <ActionMessage state={state} />
    </form>
  );
}
