"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, FormAlert } from "@/components/ui/field";
import { TextareaField } from "@/components/ui/textarea-field";
import { createPost, type ComposerState } from "@/app/actions/community";
import { PostMediaUpload } from "./post-media-upload";
import { CHOOSABLE_KINDS } from "@/lib/community/kinds";
import type { Topic } from "@/lib/community/queries";
import { useState } from "react";

/*
  The composer. One server action, zod on the other side of it, and the
  database CHECKs underneath that.

  KEYED ON `attempt`, AND THAT IS NOT DECORATION. React 19 resets a form once
  its action completes, so a refused post would empty every field and lose what
  somebody wrote. A mounted input ignores a changed defaultValue, so the fields
  have to MOUNT AGAIN to pick the echoed values back up, which is what the key
  forces. This is the same bug 4S.2 found on the tool submission form, where a
  taken slug wiped twelve fields.

  The body is 16px below sm. Every text input on this site was 15px until
  4AB.16, and iOS Safari zooms the page whenever a focused field is under 16px
  and never zooms back out (D91). TextareaField already does this; the link
  field below goes through Field, which does too.
*/
export function ComposerForm({
  topics,
  tools,
  models,
}: {
  topics: Topic[];
  tools: { id: string; name: string }[];
  models: { id: string; name: string }[];
}) {
  /* The initial state is built HERE, not imported. A "use server" module may
     only export async functions, so an exported constant arrives as undefined
     and the first read of state.values throws. See the note in
     app/actions/community.ts. */
  const [state, action] = useActionState<ComposerState, FormData>(createPost, {
    status: "idle",
    message: "",
    values: {
      body: "",
      linkUrl: "",
      topicId: "",
      kind: "text",
      toolId: "",
      modelId: "",
    },
    attempt: 0,
  });

  /*
    The one piece of local state in this form, and it exists only to decide
    which picker is on screen. Everything else stays uncontrolled, which is
    what lets the keyed remount restore echoed values after a refusal.
  */
  const [kind, setKind] = useState(state.values.kind || "text");

  /*
    A kind with nothing to attach is not offered. `models` is empty today, so
    "About a model" is absent rather than present and unusable, which is the
    same call FeaturedShelf makes when nothing is featured. It appears on its
    own the day a model is approved.
  */
  const kinds = CHOOSABLE_KINDS.filter((k) => {
    if (k.value === "tool") return tools.length > 0;
    if (k.value === "model") return models.length > 0;
    return true;
  });

  return (
    <form action={action} key={state.attempt}>
      {state.status === "error" && state.message ? (
        <FormAlert>{state.message}</FormAlert>
      ) : null}

      <TextareaField
        id="post-body"
        label="Your post"
        limit={2000}
        defaultValue={state.values.body}
        name="body"
        rows={6}
        required
        autoFocus
        placeholder="What did you find, ship, or get stuck on?"
        invalid={state.status === "error"}
        className="mb-5"
      />

      {/*
        type="text", NOT type="url", and that is the fix for a real defect.
        A url input refuses "celpare.com" with a native bubble that cannot be
        styled and is easy to miss, so the form just appeared not to work.
        normaliseUrl puts the scheme back on the server, and anything still
        malformed is refused with a message that says what is wrong.
      */}
      <Field
        id="post-link"
        label="Link"
        type="text"
        name="linkUrl"
        inputMode="url"
        autoComplete="url"
        spellCheck={false}
        defaultValue={state.values.linkUrl}
        placeholder="celpare.com"
        hint="Optional. The tool, the repository, or whatever you are pointing at. No need to type https."
        className="mb-5"
      />

      <div className="mb-5">
        <PostMediaUpload />
      </div>

      <div className="mb-5">
        <label
          htmlFor="post-kind"
          className="mb-1.5 block text-[14px] font-medium text-foreground"
        >
          What is this
        </label>
        <select
          id="post-kind"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[16px] text-foreground sm:text-[15px]"
        >
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[13px] text-muted">
          {kinds.find((k) => k.value === kind)?.hint ??
            "Anything you want to say."}
        </p>
      </div>

      {/*
        The attachment, shown only for the kind that needs one.

        posts_kind_matches_attachment refuses a tool post with no tool, so this
        is not the control: it is what stops somebody reaching that refusal.
        The select is rendered only when it applies, so an unused field never
        carries a stale id into the next submission.
      */}
      {kind === "tool" && tools.length > 0 ? (
        <div className="mb-5">
          <label
            htmlFor="post-tool"
            className="mb-1.5 block text-[14px] font-medium text-foreground"
          >
            Which tool
          </label>
          <select
            id="post-tool"
            name="toolId"
            required
            defaultValue={state.values.toolId}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[16px] text-foreground sm:text-[15px]"
          >
            <option value="">Pick a tool</option>
            {tools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[13px] text-muted">
            Only tools already in the Celpare directory. The post links straight
            to it.
          </p>
        </div>
      ) : null}

      {kind === "model" && models.length > 0 ? (
        <div className="mb-5">
          <label
            htmlFor="post-model"
            className="mb-1.5 block text-[14px] font-medium text-foreground"
          >
            Which model
          </label>
          <select
            id="post-model"
            name="modelId"
            required
            defaultValue={state.values.modelId}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[16px] text-foreground sm:text-[15px]"
          >
            <option value="">Pick a model</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="mb-6">
        <label
          htmlFor="post-topic"
          className="mb-1.5 block text-[14px] font-medium text-foreground"
        >
          Topic
        </label>
        {/*
          A native select. It is the control every phone already knows how to
          render as a wheel, it needs no JavaScript, and a custom listbox here
          would be a keyboard and screen reader surface to get right for no
          gain. 16px below sm for the same iOS reason as every other field.
        */}
        <select
          id="post-topic"
          name="topicId"
          defaultValue={state.values.topicId}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[16px] text-foreground sm:text-[15px]"
        >
          <option value="">No topic</option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[13px] text-muted">
          Optional. It decides where the post shows up when somebody browses by
          topic.
        </p>
      </div>

      {/*
        The honeypot. Hidden from people and from assistive technology, left in
        the tab order's way by nothing: a bot filling every field trips it, and
        the action then behaves as though the post worked rather than telling
        it that it was caught.
      */}
      <div aria-hidden className="hidden">
        <label htmlFor="post-website">Website</label>
        <input id="post-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Submit />
    </form>
  );
}

/*
  useFormStatus has to live in a child of the form, not in the component that
  renders it: it reads the status of the nearest form ABOVE it in the tree.
*/
function Submit() {
  const { pending } = useFormStatus();

  return (
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? "Posting" : "Post"}
      </Button>
      <p className="text-[13px] text-muted">
        Posts are public, and anybody can read them without an account.
      </p>
    </div>
  );
}
