"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, CircleAlert, CircleCheck } from "lucide-react";
import { joinWaitlist, type WaitlistState } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initial: WaitlistState = { status: "idle", message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="sm:w-auto">
      {pending ? "Sending..." : "Get early access"}
      {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
    </Button>
  );
}

export function WaitlistForm() {
  const [state, formAction] = useActionState(joinWaitlist, initial);
  const [audience, setAudience] = useState<"user" | "founder">("user");
  const emailId = useId();
  const companyId = useId();
  const statusId = useId();

  return (
    <form action={formAction} className="mx-auto w-full max-w-[520px]">
      <fieldset className="mb-4">
        <legend className="sr-only">I am joining as</legend>
        <div
          role="radiogroup"
          aria-label="I am joining as"
          className="inline-flex rounded-xl border border-border p-1"
        >
          {(
            [
              ["user", "I use AI tools"],
              ["founder", "I build AI tools"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={audience === value}
              onClick={() => setAudience(value)}
              className={cn(
                "cursor-pointer rounded-lg px-3.5 py-2 text-[14px] transition-colors duration-200 ease-out",
                audience === value
                  ? "bg-accent font-medium text-on-accent"
                  : "text-muted hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <input type="hidden" name="audience" value={audience} />

      <label htmlFor={emailId} className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          aria-describedby={state.status !== "idle" ? statusId : undefined}
          aria-invalid={state.status === "error" || undefined}
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-4 text-[15px] text-foreground placeholder:text-muted"
        />
        <SubmitButton />
      </div>

      {audience === "founder" && (
        <div className="mt-3">
          <label htmlFor={companyId} className="sr-only">
            Company or product name
          </label>
          <input
            id={companyId}
            name="company"
            type="text"
            maxLength={120}
            placeholder="Company or product name (optional)"
            className="h-11 w-full rounded-xl border border-border bg-background px-4 text-[15px] text-foreground placeholder:text-muted"
          />
        </div>
      )}

      {/* Honeypot. Hidden from people and from screen readers, visible to bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={cn(
          "mt-3 flex items-center justify-center gap-2 text-[14px] sm:justify-start",
          state.status === "idle" && "sr-only",
          state.status === "success" && "text-foreground",
          state.status === "error" && "text-foreground",
        )}
      >
        {state.status === "success" && (
          <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
        )}
        {state.status === "error" && (
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
        )}
        {state.message}
      </p>
    </form>
  );
}
