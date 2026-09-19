"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MessageCircle } from "lucide-react";
import { startThread } from "@/app/actions/messages";
import { cn } from "@/lib/utils";

/*
  Message this person, from their profile. Founder instruction 2026-09-19:
  next to Follow, and touching it opens the conversation with that person.

  It reuses startThread rather than linking to /messages, because the inbox
  cannot know who you meant. dm_start_thread is find-or-create and idempotent,
  so pressing this on somebody you have messaged before opens the existing
  thread rather than a second empty one, and the action redirects to it.

  An icon with a real accessible name, never an icon alone. It is a 40px
  square, which clears the 24px WCAG 2.2 target minimum with room to spare and
  matches the height of the sm buttons it sits beside, so the pair reads as one
  control group rather than two sizes.

  Signed out, it is absent rather than disabled: the action would refuse and a
  control guaranteed to fail is defect F4. The Follow button beside it already
  sends a signed out visitor to the gate, so nothing here is a dead end.
*/
export function MessageButton({
  targetId,
  name,
}: {
  targetId: string;
  /* Named, so the button says "Message Dana" rather than "Message". */
  name: string;
}) {
  const [state, action] = useActionState(startThread, {
    status: "idle" as const,
    message: "",
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action}>
        <input type="hidden" name="userId" value={targetId} />
        <Submit name={name} />
      </form>

      {state.status === "error" ? (
        <p role="alert" className="text-[13px] text-muted">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function Submit({ name }: { name: string }) {
  /* useFormStatus reads the form it is rendered INSIDE, which is why this is
     a child component rather than a hook call in the parent. */
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Message ${name}`}
      className={cn(
        /* No focus-visible classes: globals.css puts one ring on every
           button and control, and a second here would fight it. */
        "flex size-10 items-center justify-center rounded-full border border-border",
        "transition-colors duration-200 ease-out hover:bg-surface disabled:opacity-60",
      )}
    >
      <MessageCircle className="size-4" aria-hidden />
    </button>
  );
}
