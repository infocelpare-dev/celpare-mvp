"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Clock, X } from "lucide-react";
import { requestToolVerification, type DeveloperState } from "@/app/actions/developer";
import { Button, ButtonLink } from "@/components/ui/button";
import { TextareaField } from "@/components/ui/textarea-field";
import { VerifiedTick } from "@/components/ui/verified-tick";
import type { VerificationRequestState } from "@/lib/tools/queries";

/*
  Request verification, beside Launch a new feature on the owner's tool page
  (D201, founder instruction 2026-10-05).

  Only Elite can ask. Anyone else who presses it is told to get Elite first and
  sent to the developer plans; the button is not disabled, because a disabled
  button cannot say why. The plan read here only chooses the message: the real
  check is request_tool_verification, and an admin checks the plan again when
  accepting.

  The tool page only renders published tools, so there is no unpublished case
  here; the server still refuses one (tool_not_live).

  A native <dialog>, as sign-in-prompt.tsx explains: showModal() gives the focus
  trap, Escape and the inert page behind it.
*/

const initial: DeveloperState = { status: "idle", message: "" };

export function VerificationRequest({
  toolId,
  slug,
  toolName,
  verified,
  state,
}: {
  toolId: string;
  slug: string;
  toolName: string;
  verified: boolean;
  state: VerificationRequestState;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [result, action, pending] = useActionState(requestToolVerification, initial);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (verified) return null;

  if (state.latest?.status === "pending") {
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-sm text-muted">
        <Clock className="size-4" aria-hidden />
        Verification requested
      </span>
    );
  }

  /* A known plan that is not Elite, or the server saying so. A failed plan
     read (null) gets the form, and the server answers. */
  const needsElite =
    (state.plan !== null && state.plan !== "elite") ||
    (result.status === "error" && result.field === "elite");
  const close = () => setOpen(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <VerifiedTick label="" className="size-4" />
        Request verification
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby="verify-request-title"
        onClose={close}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="m-auto w-[min(440px,calc(100vw-2rem))] rounded-2xl border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="relative px-6 pb-6 pt-5 text-start">
          <button
            type="button"
            onClick={close}
            className="absolute end-2 top-2 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Cancel</span>
          </button>

          {needsElite ? (
            <>
              <h2 id="verify-request-title" className="pe-10 pt-2 text-[20px] font-medium tracking-[-0.02em]">
                Get Elite plan first
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                The blue tick is part of the Elite developer plan. Move to Elite, then send your
                request and an admin will review it.
              </p>
              <div className="mt-6 space-y-3">
                <ButtonLink href="/pricing?for=developers" className="w-full" onClick={close}>
                  See the Elite plan
                </ButtonLink>
                <Button variant="outline" className="w-full" onClick={close}>
                  Not now
                </Button>
              </div>
            </>
          ) : (
            <form action={action}>
              <h2 id="verify-request-title" className="pe-10 pt-2 text-[20px] font-medium tracking-[-0.02em]">
                Request verification
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                An admin checks that you run {toolName}, then adds the blue tick to it everywhere on
                Celpare.
              </p>
              {state.latest?.status === "rejected" && state.latest.decision_reason ? (
                <p className="mt-3 rounded-xl border border-border px-3 py-2 text-[14px] leading-relaxed">
                  <span className="font-medium">Your last request was declined:</span>{" "}
                  {state.latest.decision_reason}
                </p>
              ) : null}

              <input type="hidden" name="toolId" value={toolId} />
              <input type="hidden" name="slug" value={slug} />
              <TextareaField
                id="verify-request-message"
                name="message"
                label="Anything that helps us confirm it (optional)"
                limit={1000}
                rows={3}
                className="mt-5"
              />

              {result.status === "error" ? (
                <p role="alert" className="mt-3 text-[14px] text-foreground">
                  {result.message}
                </p>
              ) : null}

              <Button type="submit" className="mt-5 w-full" disabled={pending}>
                {pending ? "Sending" : "Send request"}
              </Button>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
