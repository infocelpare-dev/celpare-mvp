"use client";

import { useActionState, useEffect, useOptimistic, useRef } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { toggleFollow, type FollowState } from "@/app/actions/follow";

/*
  Optimistic with rollback, the same rule 10-community.md sets for like and
  save: the button changes immediately, and if the server disagrees it goes
  back to what the server says rather than to what we guessed.

  A signed out visitor gets a link to the gate rather than a button that
  cannot work. The server refuses them anyway, but offering a control that is
  guaranteed to fail is the shape of defect F4.
*/
export function FollowButton({
  targetId,
  username,
  initialFollowing,
  signedIn,
}: {
  targetId: string;
  username: string;
  initialFollowing: boolean;
  signedIn: boolean;
}) {
  const [state, action, pending] = useActionState<FollowState, FormData>(
    toggleFollow,
    { status: "idle", following: initialFollowing, message: "" },
  );

  // The server's answer is the truth. useOptimistic shows the intent while the
  // request is in flight and snaps back to this on its own if it fails.
  const [optimistic, setOptimistic] = useOptimistic(state.following);
  const liveRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (state.status === "error" && state.message && liveRef.current) {
      liveRef.current.textContent = state.message;
    }
  }, [state]);

  if (!signedIn) {
    return (
      <ButtonLink href="/get-started" variant="primary" size="sm">
        Follow
      </ButtonLink>
    );
  }

  const next = optimistic ? "unfollow" : "follow";

  return (
    <div className="flex flex-col items-end gap-1">
      {/*
        THE OPTIMISTIC UPDATE HAPPENS INSIDE THE ACTION, NOT IN onSubmit.

        This is the bug the founder saw as an error on every follow. React runs
        onSubmit BEFORE it starts the transition that wraps a form action, so
        setting optimistic state there is a state update outside a transition,
        which React 19 throws on: "An optimistic state update occurred outside
        a transition or action". It threw before the request was ever sent.

        A function passed as `action` is itself run inside that transition, so
        the update and the dispatch are in the same one. Same family as the
        note in RESUME section 9 about useActionState's dispatch.
      */}
      <form
        action={(formData: FormData) => {
          setOptimistic(!optimistic);
          action(formData);
        }}
      >
        <input type="hidden" name="targetId" value={targetId} />
        <input type="hidden" name="intent" value={next} />
        <Button
          type="submit"
          size="sm"
          variant={optimistic ? "outline" : "primary"}
          disabled={pending}
          aria-label={
            optimistic ? `Unfollow ${username}` : `Follow ${username}`
          }
        >
          {optimistic ? "Following" : "Follow"}
        </Button>
      </form>
      <span ref={liveRef} role="status" aria-atomic="true" className="text-[13px] text-muted" />
    </div>
  );
}
