"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setDeveloperMode, type DeveloperState } from "@/app/actions/settings";

/*
  Developer Mode, as a switch.

  Turning it ON is not one behaviour, it is two, and conflating them was a bug:

    never agreed    going on is a DECISION. It routes to the terms and writes
                    nothing on the way. Nothing is recorded until you have read
                    to the end and agreed.

    already agreed  going on is just a SETTING. You made the decision once
                    already, so it writes directly.

  Sending an existing developer back to the terms looked harmless and was not.
  The terms page redirects anyone who has already accepted to /developer,
  /developer sees the mode is off and renders "Developer Mode is off", and that
  page pointed at settings, where the switch no longer lives. Turn it on, turn
  it off, try to turn it on again, and you were stuck in a loop with no way
  back. Reported from the running app.

  Turning it OFF is always a direct write, and is refused once you have
  submitted anything. That rule lives in tg_developer_mode_guard, so the
  message here explains a refusal rather than being the rule.
*/
export function DeveloperModeToggle({
  initial,
  hasAgreed = false,
  submissionCount = 0,
}: {
  initial: boolean;
  /* Whether this person already accepted the developer terms. A
     developer_profiles row is created only at the moment of agreement, so its
     existence is the same fact. */
  hasAgreed?: boolean;
  /* Explains the lock before somebody tries it, rather than only after being
     refused. Presentational: the trigger is the control. */
  submissionCount?: number;
}) {
  const router = useRouter();
  const [state, action] = useActionState<DeveloperState, FormData>(
    setDeveloperMode,
    { status: "idle", isDeveloper: initial, message: "" },
  );

  /*
    useActionState's dispatch has to be called inside a transition. Calling it
    bare threw "An async function with useActionState was called outside of a
    transition" and left isPending permanently wrong. Passing it to a form
    action does this implicitly; calling it from an onChange does not, so it is
    explicit here.
  */
  const [isPending, startTransition] = useTransition();
  const [routing, setRouting] = useState(false);

  const serverValue = state.status === "idle" ? initial : state.isDeveloper;
  const locked = serverValue && submissionCount > 0;

  function write(next: boolean) {
    const data = new FormData();
    // An unchecked box is absent from form data, so "off" is the absence of
    // the field rather than a false value.
    if (next) data.set("isDeveloper", "on");
    startTransition(() => action(data));
  }

  function onChange(next: boolean) {
    if (next) {
      if (hasAgreed) {
        write(true);
        return;
      }
      setRouting(true);
      router.push("/developer/terms");
      return;
    }
    if (locked) return;
    write(false);
  }

  const message = locked
    ? submissionCount === 1
      ? "You have 1 submission in the catalogue, so this stays on."
      : `You have ${submissionCount} submissions in the catalogue, so this stays on.`
    : state.message;

  return (
    <div className="rounded-xl border border-border px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium">Developer Mode</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            {serverValue
              ? "On. Submit and manage tools and models from your developer profile."
              : hasAgreed
                ? "Off. Turn it back on to reopen your developer workspace."
                : "Off. Turn it on to submit AI tools and models to the catalogue."}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          {/* The switch announces its own state, so the word is decorative and
              is not read out a second time. */}
          <span
            aria-hidden
            className={
              serverValue
                ? "text-[12px] font-semibold tracking-wide text-foreground"
                : "text-[12px] font-semibold tracking-wide text-muted"
            }
          >
            {serverValue ? "ON" : "OFF"}
          </span>
          <Switch
            isSelected={serverValue}
            onChange={onChange}
            isDisabled={isPending || routing || locked}
            aria-label="Developer Mode"
          />
        </div>
      </div>

      {message ? (
        <p
          role="status"
          aria-atomic="true"
          className="mt-2.5 text-[13px] leading-relaxed text-muted"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
