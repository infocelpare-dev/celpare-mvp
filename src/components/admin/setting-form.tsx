"use client";

import { useActionState, useState } from "react";
import { setSetting } from "@/app/actions/admin";
import { IDLE } from "@/lib/admin/action-state";
import { ActionMessage } from "./action-form";
import { cn } from "@/lib/utils";

/*
  One platform setting.

  The value is jsonb, and the control is chosen from the shape of what is
  already stored rather than from a type column: a boolean gets a switch, a
  number gets a number field, everything else gets a text box. That keeps the
  form honest about what the database holds without adding a schema for schemas.

  The reason field is required by admin_set_setting for the same reason it is
  required on a suspension: a configuration change nobody explained is one
  nobody can safely undo.
*/
export function SettingForm({
  scope,
  settingKey,
  value,
  description,
  updatedAt,
}: {
  scope: "platform" | "community";
  settingKey: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
}) {
  const [state, formAction, pending] = useActionState(setSetting, IDLE);

  const kind =
    typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "text";

  const initial =
    kind === "text" && typeof value === "string" ? value : JSON.stringify(value);

  const [draft, setDraft] = useState(initial);

  /*
    React 19 resets a form after its action completes, which would put an
    uncontrolled field back to its HTML default and disagree with what the
    server now holds. Re-seeding from the prop keeps the two in step. See
    docs/RESUME.md section 9.

    Adjusted during render rather than from an effect: setting state in an
    effect that watches state paints the stale value first and corrects it on a
    second pass.
  */
  const [seen, setSeen] = useState({ initial, status: state.status });
  if (seen.initial !== initial || seen.status !== state.status) {
    setSeen({ initial, status: state.status });
    setDraft(initial);
  }

  const dirty = draft !== initial;

  return (
    <form action={formAction} className="border-b border-border px-4 py-4 last:border-b-0">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="key" value={settingKey} />

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`setting-${settingKey}`} className="font-mono text-[13px] font-medium">
            {settingKey}
          </label>
          {description ? (
            <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-muted">
              {description}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
          {scope}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {kind === "boolean" ? (
          <select
            id={`setting-${settingKey}`}
            name="value"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-[13px]"
          >
            <option value="true">On</option>
            <option value="false">Off</option>
          </select>
        ) : kind === "number" ? (
          <input
            id={`setting-${settingKey}`}
            name="value"
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-9 w-32 rounded-lg border border-border bg-background px-2.5 text-[13px]"
          />
        ) : (
          <input
            id={`setting-${settingKey}`}
            name="value"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-9 min-w-[240px] flex-1 rounded-lg border border-border bg-background px-2.5 font-mono text-[13px]"
          />
        )}

        <input
          name="reason"
          type="text"
          required
          maxLength={1000}
          placeholder="Why, for the audit log"
          className="h-9 min-w-[200px] flex-1 rounded-lg border border-border bg-background px-2.5 text-[13px]"
        />

        <button
          type="submit"
          disabled={!dirty || pending}
          className={cn(
            "inline-flex h-9 cursor-pointer items-center rounded-lg border border-transparent bg-accent px-4 text-[13px] font-medium text-on-accent transition-colors duration-200 ease-out hover:bg-[var(--celpare-lime-dim)]",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          {pending ? "Saving" : "Save"}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-muted">
        Last changed {new Date(updatedAt).toLocaleString("en-GB")}
      </p>
      <ActionMessage state={state} />
    </form>
  );
}
