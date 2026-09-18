"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormAlert } from "@/components/ui/field";
import { MediaUpload } from "./media-upload";
import { postToolUpdate, type DeveloperState } from "@/app/actions/developer";

/*
  "Launch a new feature".

  A video, an image, or a link on its own, plus one line saying what shipped.
  Founder, 2026-09-17: those three and nothing else, never an arbitrary file.

  It is NOT the edit form and must never grow into one. Nothing here changes
  what the tool claims about itself, which is exactly why posting one does not
  send a live tool back for review: it adds news beside the listing rather than
  altering the listing.

  Both uploaders are rendered at once rather than behind a picker, because a
  picker would be a decision to make before seeing the two things you can
  choose between, and the action refuses both together with a sentence saying
  so.
*/

const ERROR_ID = "feature-update-error";

export function FeatureUpdateForm({
  toolId,
  slug,
  toolName,
}: {
  toolId: string;
  slug: string;
  toolName: string;
}) {
  const [state, action, pending] = useActionState<DeveloperState, FormData>(
    postToolUpdate,
    { status: "idle", message: "" },
  );

  const was = (field: string) => {
    const v = state.values?.[field];
    return typeof v === "string" ? v : "";
  };
  const invalid = (field: string) => state.status === "error" && state.field === field;

  useEffect(() => {
    if (state.status !== "error") return;
    document.getElementById(ERROR_ID)?.focus();
  }, [state]);

  return (
    <form key={state.attempt ?? 0} action={action} className="mt-8 space-y-8">
      <input type="hidden" name="toolId" value={toolId} />
      <input type="hidden" name="slug" value={slug} />

      {state.message ? (
        <FormAlert id={ERROR_ID} tone="error">
          {state.message}
        </FormAlert>
      ) : null}

      <Field
        id="caption"
        name="caption"
        label="What did you ship?"
        required
        maxLength={200}
        defaultValue={was("caption")}
        invalid={invalid("caption")}
        placeholder="Dark mode is here."
        hint={`One line. It is the headline of the update on ${toolName}.`}
      />

      <fieldset>
        <legend className="font-display text-[17px] font-semibold">
          Show it
        </legend>
        <p className="mt-1.5 text-[13px] text-muted">
          A video or an image, not both. Or neither, if the link below is the
          whole story.
        </p>

        <div className="mt-5 space-y-5">
          <div id="updateVideoUrl">
            <MediaUpload
              name="updateVideoUrl"
              kind="video"
              label="Video"
              defaultValue={was("updateVideoUrl")}
              invalid={invalid("updateVideoUrl")}
            />
          </div>
          <div id="updateImageUrl">
            <MediaUpload
              name="updateImageUrl"
              kind="image"
              label="Image"
              defaultValue={was("updateImageUrl")}
              invalid={invalid("updateImageUrl")}
            />
          </div>
        </div>
      </fieldset>

      <Field
        id="linkUrl"
        name="linkUrl"
        type="url"
        label="Link"
        inputMode="url"
        maxLength={2048}
        placeholder="https://example.com/changelog"
        defaultValue={was("linkUrl")}
        invalid={invalid("linkUrl")}
        hint="Optional alongside a video or an image. On its own, it is the update."
      />

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? "Posting..." : "Post update"}
        </Button>
        <p className="text-[13px] text-muted">
          Goes live straight away. It does not need review and does not change
          your listing.
        </p>
      </div>
    </form>
  );
}
