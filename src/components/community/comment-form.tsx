"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { TextareaField } from "@/components/ui/textarea-field";
import { createComment, type CommentState } from "@/app/actions/community";

/*
  One level deep. No nested replies in v1, per 10-community.md section 4, and
  `comments` has no parent_id to hang them on: adding one later is an additive
  migration rather than a rewrite.

  Keyed on `attempt` for the same reason the composer is. A refused comment
  keeps its text, and a successful one clears, because the action returns an
  empty body in that case and the remount picks it up either way.
*/
export function CommentForm({ postId }: { postId: string }) {
  /* Built here rather than imported: see the note in app/actions/community.ts
     about what a "use server" module is allowed to export. */
  const [state, action] = useActionState<CommentState, FormData>(createComment, {
    status: "idle",
    message: "",
    body: "",
    attempt: 0,
  });

  return (
    <form action={action} key={state.attempt}>
      <input type="hidden" name="postId" value={postId} />

      {state.status === "error" && state.message ? (
        <FormAlert>{state.message}</FormAlert>
      ) : null}

      <TextareaField
        id="comment-body"
        label="Add a comment"
        limit={1000}
        defaultValue={state.body}
        name="body"
        rows={3}
        required
        placeholder="Reply"
        invalid={state.status === "error"}
        className="mb-3"
      />

      <div aria-hidden className="hidden">
        <label htmlFor="comment-website">Website</label>
        <input
          id="comment-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Sending" : "Comment"}
    </Button>
  );
}
