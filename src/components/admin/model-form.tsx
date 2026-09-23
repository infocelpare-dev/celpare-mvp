"use client";

import { useActionState, useId } from "react";
import { updateModel } from "@/app/actions/admin";
import { IDLE } from "@/lib/admin/action-state";
import { ActionMessage } from "./action-form";
import { cn } from "@/lib/utils";

/*
  Model metadata, brief section 6.

  Two fields are deliberately absent.

  The slug, because it is the model's public URL and renaming it breaks every
  link that points at it. If one is genuinely wrong, it is a migration and a
  redirect, not a text field.

  The status, because approving, rejecting and suspending a model goes through
  admin_review_submission with the rest of the catalogue decisions. Two paths to
  the same state would mean two audit shapes for one decision.

  Nothing here touches a credential. `provider` is a label like 'openai', not a
  key: the keys are environment variables the database has never seen.
*/

type Model = {
  id: string;
  name: string;
  provider: string;
  description: string | null;
  context_window: number | null;
  input_price_per_m: number | null;
  output_price_per_m: number | null;
  modalities: string[];
  website_url: string | null;
};

const input =
  "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none transition-colors duration-200 ease-out focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-ring";

function Row({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[12px] font-medium text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

export function ModelForm({ model }: { model: Model }) {
  const [state, formAction, pending] = useActionState(updateModel, IDLE);
  const id = useId();

  /* Re-seeded on every completed action, because React 19 resets a form after
     its action runs and would otherwise show the HTML defaults rather than what
     the server now holds. See docs/RESUME.md section 9. */
  return (
    <form action={formAction} key={`${model.id}-${state.status}`} className="space-y-3">
      <input type="hidden" name="id" value={model.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Row id={`${id}-name`} label="Name">
          <input id={`${id}-name`} name="name" defaultValue={model.name} required maxLength={120} className={input} />
        </Row>
        <Row id={`${id}-provider`} label="Provider" hint="A label, not a credential.">
          <input
            id={`${id}-provider`}
            name="provider"
            defaultValue={model.provider}
            required
            maxLength={60}
            className={input}
          />
        </Row>
      </div>

      <Row id={`${id}-description`} label="Description">
        <input
          id={`${id}-description`}
          name="description"
          defaultValue={model.description ?? ""}
          maxLength={2000}
          className={input}
        />
      </Row>

      <div className="grid gap-3 sm:grid-cols-3">
        <Row id={`${id}-context`} label="Context window" hint="Tokens.">
          <input
            id={`${id}-context`}
            name="contextWindow"
            type="number"
            min={0}
            defaultValue={model.context_window ?? ""}
            className={cn(input, "tnum")}
          />
        </Row>
        <Row id={`${id}-in`} label="Input price" hint="USD per million tokens.">
          <input
            id={`${id}-in`}
            name="inputPrice"
            type="number"
            min={0}
            step="0.0001"
            defaultValue={model.input_price_per_m ?? ""}
            className={cn(input, "tnum")}
          />
        </Row>
        <Row id={`${id}-out`} label="Output price" hint="USD per million tokens.">
          <input
            id={`${id}-out`}
            name="outputPrice"
            type="number"
            min={0}
            step="0.0001"
            defaultValue={model.output_price_per_m ?? ""}
            className={cn(input, "tnum")}
          />
        </Row>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Row id={`${id}-modalities`} label="Modalities" hint="Comma separated. text, image, audio.">
          <input
            id={`${id}-modalities`}
            name="modalities"
            defaultValue={model.modalities.join(", ")}
            maxLength={200}
            className={input}
          />
        </Row>
        <Row id={`${id}-website`} label="Website">
          <input
            id={`${id}-website`}
            name="websiteUrl"
            type="url"
            defaultValue={model.website_url ?? ""}
            maxLength={500}
            className={input}
          />
        </Row>
      </div>

      <Row id={`${id}-reason`} label="Reason" hint="Optional, and it goes in the audit log with the before and after state.">
        <input id={`${id}-reason`} name="reason" maxLength={1000} className={input} />
      </Row>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 cursor-pointer items-center rounded-full border border-transparent bg-primary px-3 text-[13px] font-medium text-on-primary transition-opacity duration-200 ease-out hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save metadata"}
        </button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
