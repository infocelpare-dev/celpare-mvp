"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  savePrivacySettings,
  type PrivacyValues,
  type SettingsState,
} from "@/app/actions/settings";

/*
  Who can see what. Founder instruction 2026-09-18.

  Two levels, and the form says so rather than presenting six equal switches.
  Making the account private overrides every section below it, so those
  controls are DISABLED while it is on instead of silently doing nothing. A
  control that is still tappable while having no effect is the kind of thing
  people file as a bug six months later.

  The disabling is cosmetic honesty, not enforcement: profile_shares() checks
  is_private first and returns false whatever the section flags say, so the
  answer is the same whether or not the browser cooperated.

  Uncontrolled inputs with a keyed remount, which is what works in React 19:
  the form resets once the action completes, and a reset restores a checkbox to
  its HTML default rather than to what was just saved. The key is bumped on
  every successful save so the boxes mount again carrying the new defaults.
*/

const initial: SettingsState = { status: "idle", message: "" };

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    /* htmlFor and siblings rather than a wrapping label: a label that contains
       its own input double fires the change event, which cost an afternoon
       once already and is written down in docs/RESUME.md. */
    <div className="flex items-start gap-3 rounded-xl border border-border px-4 py-3 has-[:disabled]:opacity-55">
      {/*
        A DISABLED INPUT IS NOT SUBMITTED. Without the hidden twin below,
        switching the account to private would post nothing for these four, the
        action would read each one as false, and it would quietly overwrite the
        choices somebody had made. They would then find everything switched off
        when they made the account public again, with nothing to explain it.

        So the checkbox carries the name only while it is live, and a hidden
        field carries the stored value while it is not. Exactly one input has
        this name at any moment, so there is never an ambiguous FormData.
      */}
      {disabled ? (
        <input type="hidden" name={name} value={defaultChecked ? "on" : ""} />
      ) : null}
      <input
        id={`privacy-${name}`}
        type="checkbox"
        name={disabled ? undefined : name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.currentTarget.checked)}
        className="mt-1 size-4 shrink-0 accent-[var(--celpare-lime)] disabled:cursor-not-allowed"
      />
      <label htmlFor={`privacy-${name}`} className="cursor-pointer">
        <span className="block text-[15px] font-medium">{label}</span>
        <span className="block text-[13px] leading-relaxed text-muted">{hint}</span>
      </label>
    </div>
  );
}

export function PrivacyForm({ values }: { values: PrivacyValues }) {
  const [state, action, pending] = useActionState(savePrivacySettings, initial);
  const [isPrivate, setIsPrivate] = useState(values.isPrivate);
  const [attempt, setAttempt] = useState(0);

  return (
    <form
      key={`${attempt}-${state.status}`}
      action={action}
      onSubmit={() => setAttempt((n) => n + 1)}
      className="mt-6 space-y-8"
    >
      <fieldset>
        <legend className="text-[14px] font-medium text-foreground">Your account</legend>
        <div className="mt-3">
          <Toggle
            name="isPrivate"
            label="Make my account private"
            hint="People who are not you see your picture, your name, your counts and a Follow button, and are told the account is private. Nothing else. Following you is still allowed and still shows them nothing, because there is no approval step yet."
            defaultChecked={values.isPrivate}
            onChange={setIsPrivate}
          />
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-[14px] font-medium text-foreground">
          Sections on your public profile
        </legend>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          {isPrivate
            ? "These do nothing while your account is private, because a private account shows no sections at all."
            : "Your posts are always public. These four are yours to choose."}
        </p>

        <div className="mt-3 space-y-2">
          <Toggle
            name="showSavedTools"
            label="Show the tools I have saved"
            hint="The tools only, never the private notes you attached to them."
            defaultChecked={values.showSavedTools}
            disabled={isPrivate}
          />
          <Toggle
            name="showSavedModels"
            label="Show the models I have saved"
            hint="The same rule as tools. The model directory arrives in Phase 5."
            defaultChecked={values.showSavedModels}
            disabled={isPrivate}
          />
          <Toggle
            name="showReplies"
            label="Show my replies"
            hint="Replies you leave on other people's posts. Turning this off hides the Replies section from visitors, and the replies themselves stay where you left them."
            defaultChecked={values.showReplies}
            disabled={isPrivate}
          />
          <Toggle
            name="showFollows"
            label="Show who I follow and who follows me"
            hint="Hides the follower and following counts from visitors, and stops anybody listing your connections."
            defaultChecked={values.showFollows}
            disabled={isPrivate}
          />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save privacy settings"}
        </Button>

        {state.status !== "idle" ? (
          <p
            role="status"
            aria-atomic="true"
            className={
              state.status === "error"
                ? "text-[14px] text-foreground"
                : "text-[14px] text-muted"
            }
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
