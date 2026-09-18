"use client";

import { useActionState, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import {
  setPrivacyFlag,
  type PrivacyFlag,
  type PrivacyState,
  type PrivacyValues,
} from "@/app/actions/settings";

/*
  Who can see what. Founder instruction 2026-09-18.

  SWITCHES THAT SAVE THEMSELVES, NOT CHECKBOXES AND A SAVE BUTTON. Same shape as
  Developer Mode, which was already doing this. The first version was five
  checkboxes in one form, and it carried a bug that this design cannot have: a
  disabled input is not submitted, so saving the form overwrote every flag that
  happened to be inert at the time. One flag per call has nothing to overwrite.

  WHICH SWITCHES EXIST DEPENDS ON THE ACCOUNT, and they are not the same set:

    public   saved tools, saved models, replies. Follows are NOT offered,
             because a public account may not hide them.
    private  follows only. Everything else is already hidden, so a control for
             it would be a control that does nothing.

  That is the founder's rule, not an interface convenience: hiding your
  followers is something you get by going private. `profile_shares()` enforces
  it, and a public account's follows are shared without the flag being consulted
  at all. Verified against all four combinations as a stranger.

  So nothing here is ever disabled. The earlier version greyed four switches out
  while the account was private, which is how the overwrite bug arrived. A
  control that does not apply is absent and the reason is written where it was.
*/

function Toggle({
  flag,
  label,
  on,
  off,
  initial,
}: {
  flag: PrivacyFlag;
  label: string;
  /* What is true when it is on, and when it is off. Said in full both ways,
     because "Show my replies: OFF" makes somebody work out the consequence and
     a privacy control is the wrong place to make people infer. */
  on: string;
  off: string;
  initial: boolean;
}) {
  const [state, action] = useActionState<PrivacyState, FormData>(setPrivacyFlag, {
    status: "idle",
    value: initial,
    message: "",
  });

  /*
    useActionState's dispatch has to be called inside a transition. A form
    `action` does that implicitly; calling it from an onChange does not, and
    calling it bare throws and leaves isPending permanently wrong. Same note as
    developer-mode-toggle.tsx, which hit this first.
  */
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  /* Before any call, the prop. After one, whatever the server says it stored,
     which is how a refusal snaps the switch back instead of leaving it showing
     a state the database never took. While in flight, the optimistic value. */
  const settled = state.status === "idle" ? initial : state.value;
  const shown = isPending && optimistic !== null ? optimistic : settled;

  function onChange(next: boolean) {
    setOptimistic(next);
    const data = new FormData();
    data.set("flag", flag);
    if (next) data.set("value", "on");
    startTransition(() => action(data));
  }

  return (
    <div className="rounded-xl border border-border px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">{label}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            {shown ? on : off}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          {/* The switch announces its own state, so this word is decorative and
              is not read out a second time. */}
          <span
            aria-hidden
            className={
              shown
                ? "text-[12px] font-semibold tracking-wide text-foreground"
                : "text-[12px] font-semibold tracking-wide text-muted"
            }
          >
            {shown ? "ON" : "OFF"}
          </span>
          <Switch
            isSelected={shown}
            onChange={onChange}
            isDisabled={isPending}
            aria-label={label}
          />
        </div>
      </div>

      {state.status === "error" ? (
        <p role="status" aria-atomic="true" className="mt-2.5 text-[13px] text-foreground">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

export function PrivacyForm({ values }: { values: PrivacyValues }) {
  /*
    Local, because the set of switches below depends on it and waiting for a
    round trip to redraw them would leave somebody looking at controls that no
    longer apply. The server is still the record: the account switch reports
    what it stored, and a refusal puts this back.
  */
  const [isPrivate, setIsPrivate] = useState(values.isPrivate);

  return (
    <div className="mt-6 space-y-8">
      <section>
        <h3 className="text-[14px] font-medium text-foreground">Your account</h3>
        <div className="mt-3">
          <PrivateToggle initial={values.isPrivate} onSettled={setIsPrivate} />
        </div>
      </section>

      <section>
        <h3 className="text-[14px] font-medium text-foreground">
          {isPrivate ? "What is still visible" : "Sections on your public profile"}
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          {isPrivate
            ? "A private profile shows your picture, your name, your username and a Follow button. Your followers are the one thing you can also hide."
            : "Your posts are always public, and so are your followers: hiding those is something you get by making the account private."}
        </p>

        <div className="mt-3 space-y-2">
          {isPrivate ? (
            <Toggle
              flag="showFollows"
              label="Show who I follow and who follows me"
              initial={values.showFollows}
              on="Visitors can see your follower and following counts."
              off="Hidden. Nobody can see your counts or list your connections."
            />
          ) : (
            <>
              <Toggle
                flag="showSavedTools"
                label="Show the tools I have saved"
                initial={values.showSavedTools}
                on="Visitors see the tools you saved. Never the private notes on them."
                off="Only you can see the tools you saved."
              />
              <Toggle
                flag="showSavedModels"
                label="Show the models I have saved"
                initial={values.showSavedModels}
                on="Visitors see the models you saved. The model directory arrives in Phase 5."
                off="Only you can see the models you saved."
              />
              <Toggle
                flag="showReplies"
                label="Show my replies"
                initial={values.showReplies}
                on="Visitors see the replies you leave on other people's posts."
                off="Your replies stay where you left them and are hidden from your profile."
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

/* The account switch, split out so it can report what the server stored back up
   to the parent. Everything else below it depends on this one value. */
function PrivateToggle({
  initial,
  onSettled,
}: {
  initial: boolean;
  onSettled: (value: boolean) => void;
}) {
  const [state, action] = useActionState<PrivacyState, FormData>(setPrivacyFlag, {
    status: "idle",
    value: initial,
    message: "",
  });
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  const settled = state.status === "idle" ? initial : state.value;
  const shown = isPending && optimistic !== null ? optimistic : settled;

  function onChange(next: boolean) {
    setOptimistic(next);
    onSettled(next);
    const data = new FormData();
    data.set("flag", "isPrivate");
    if (next) data.set("value", "on");
    startTransition(() => action(data));
  }

  return (
    <div className="rounded-xl border border-border px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium">Private account</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
            {shown
              ? "On. People who are not you see your picture, your name, your username and a Follow button, and are told the account is private."
              : "Off. Your profile, posts and replies can be read by anyone, including people without an account."}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <span
            aria-hidden
            className={
              shown
                ? "text-[12px] font-semibold tracking-wide text-foreground"
                : "text-[12px] font-semibold tracking-wide text-muted"
            }
          >
            {shown ? "ON" : "OFF"}
          </span>
          <Switch
            isSelected={shown}
            onChange={onChange}
            isDisabled={isPending}
            aria-label="Private account"
          />
        </div>
      </div>

      {/* Following a private account is allowed and shows the follower nothing.
          Said here rather than discovered, because it is the one thing people
          assume works differently. */}
      {shown ? (
        <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
          People can still follow you, and following you still shows them
          nothing. There is no approval step yet.
        </p>
      ) : null}

      {state.status === "error" ? (
        <p role="status" aria-atomic="true" className="mt-2.5 text-[13px] text-foreground">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
