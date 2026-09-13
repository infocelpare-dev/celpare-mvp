"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { saveAskSettings, type SettingsState } from "@/app/actions/settings";

export type AskSettingsValues = {
  answerLength: "short" | "balanced" | "detailed";
  webSearch: boolean;
  saveHistory: boolean;
};

const LENGTHS: { value: AskSettingsValues["answerLength"]; label: string; hint: string }[] = [
  { value: "short", label: "Short", hint: "A recommendation and one line of why." },
  { value: "balanced", label: "Balanced", hint: "A few options, each with a reason." },
  { value: "detailed", label: "Detailed", hint: "Fuller comparisons and caveats." },
];

const initial: SettingsState = { status: "idle", message: "" };

export function AskSettingsForm({
  values,
  webSearchAvailable,
  webSearchReason,
}: {
  values: AskSettingsValues;
  webSearchAvailable: boolean;
  webSearchReason: string;
}) {
  const [state, action, pending] = useActionState(saveAskSettings, initial);

  return (
    <form action={action} className="mt-8 space-y-10">
      <fieldset>
        <legend className="font-display text-[17px] font-semibold">Answer length</legend>
        <p className="mt-1 text-[14px] text-muted">
          Shorter answers are faster and use less of your daily allowance.
        </p>

        <div className="mt-4 space-y-2">
          {LENGTHS.map((l) => (
            <label
              key={l.value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3 transition-colors duration-200 hover:bg-surface has-[:checked]:border-foreground"
            >
              <input
                type="radio"
                name="answerLength"
                value={l.value}
                defaultChecked={values.answerLength === l.value}
                className="mt-1 accent-[var(--celpare-lime)]"
              />
              <span>
                <span className="block text-[15px] font-medium">{l.label}</span>
                <span className="block text-[13px] text-muted">{l.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-display text-[17px] font-semibold">Sources</legend>
        <p className="mt-1 text-[14px] text-muted">
          The Celpare tool catalogue and Celpare documentation are always used.
          Web search is optional.
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3 transition-colors duration-200 hover:bg-surface has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
          <input
            type="checkbox"
            name="webSearch"
            defaultChecked={values.webSearch}
            disabled={!webSearchAvailable}
            className="mt-1 accent-[var(--celpare-lime)]"
          />
          <span>
            <span className="block text-[15px] font-medium">Search the web</span>
            <span className="block text-[13px] text-muted">
              {webSearchAvailable
                ? "Used only when a question needs information newer than the model knows."
                : webSearchReason}
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset>
        <legend className="font-display text-[17px] font-semibold">History</legend>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3 transition-colors duration-200 hover:bg-surface">
          <input
            type="checkbox"
            name="saveHistory"
            defaultChecked={values.saveHistory}
            className="mt-1 accent-[var(--celpare-lime)]"
          />
          <span>
            <span className="block text-[15px] font-medium">Save my chats</span>
            <span className="block text-[13px] text-muted">
              Kept so you can reopen them later. Turning this off means new chats
              are not saved; chats already saved stay until you delete them.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save settings"}
        </Button>

        {state.status !== "idle" ? (
          <p
            role="status"
            className={
              state.status === "error" ? "text-[14px] text-foreground" : "text-[14px] text-muted"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
