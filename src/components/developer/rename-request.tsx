"use client";

import { useActionState } from "react";
import { Clock } from "lucide-react";
import { requestToolRename, type DeveloperState } from "@/app/actions/developer";
import { Button } from "@/components/ui/button";
import { Field, FormAlert } from "@/components/ui/field";
import { TextareaField } from "@/components/ui/textarea-field";

/*
  Asking for a new name for a live tool (D274, founder 2026-11-25). The name in
  the form above is locked; this is the only way to change it. An admin decides
  in /admin/verifications and the tool stays live under its current name
  meanwhile, keeping its address, ratings and history.

  Its own form under the edit form, never inside it: nested forms are invalid
  HTML and the browser would drop the inner one.
*/

export type RenameRequestLatest = {
  status: "pending" | "approved" | "rejected" | "cancelled";
  requested_name: string;
  decision_reason: string | null;
} | null;

const initial: DeveloperState = { status: "idle", message: "" };

export function RenameRequest({
  toolId,
  currentName,
  latest,
}: {
  toolId: string;
  currentName: string;
  latest: RenameRequestLatest;
}) {
  const [result, action, pending] = useActionState(requestToolRename, initial);
  const waiting = latest?.status === "pending" || result.status === "success";

  return (
    <section aria-labelledby="rename-heading" className="mt-12 border-t border-border pt-8">
      <h2 id="rename-heading" className="font-display text-[17px] font-semibold">
        Change the tool&apos;s name
      </h2>
      <p className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-muted">
        A live tool&apos;s name is locked so people can trust what they found. Ask for a new one here.
        {" "}{currentName} stays live under its current name until an admin decides, and keeps its address,
        ratings and history.
      </p>

      {waiting ? (
        <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[14px] text-muted">
          <Clock className="size-4" aria-hidden />
          {result.status === "success"
            ? result.message
            : `New name requested: ${latest?.requested_name}. Waiting on an admin.`}
        </p>
      ) : (
        <form action={action} className="mt-5 max-w-[520px] space-y-5">
          {latest?.status === "rejected" && latest.decision_reason ? (
            <p className="rounded-xl border border-border px-3 py-2 text-[14px] leading-relaxed">
              <span className="font-medium">Your last request ({latest.requested_name}) was declined:</span>{" "}
              {latest.decision_reason}
            </p>
          ) : null}
          {result.status === "error" ? <FormAlert>{result.message}</FormAlert> : null}

          <input type="hidden" name="toolId" value={toolId} />
          <Field
            id="rename-name"
            name="name"
            label="New name"
            required
            maxLength={120}
            invalid={result.status === "error" && result.field === "name"}
          />
          <TextareaField
            id="rename-message"
            name="message"
            label="Why the new name (optional)"
            limit={1000}
            rows={3}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Sending" : "Ask for the new name"}
          </Button>
        </form>
      )}
    </section>
  );
}
