"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Check } from "lucide-react";
import { joinWaitlist, type WaitlistState } from "@/app/actions/waitlist";
import { Button } from "@/components/ui/button";

/*
  The waitlist capture (D198), from DemoForm. One pill field and an ink pill
  button (D122); the result replaces the form in place and is announced.
*/

const initial: WaitlistState = { status: "idle", message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="h-12 shrink-0 rounded-full px-6">
      {pending ? "Joining..." : "Join waitlist"}
      {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
    </Button>
  );
}

export function WaitlistForm() {
  const [state, formAction] = useActionState(joinWaitlist, initial);
  const emailId = useId();
  const errorId = useId();

  if (state.status === "success") {
    return (
      <p
        role="status"
        className="mx-auto flex h-12 w-fit items-center gap-3 rounded-full border border-border bg-background pl-2 pr-5 text-[15px] font-medium text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-on-accent">
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
        </span>
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} noValidate className="mx-auto w-full max-w-[460px]">
      <label htmlFor={emailId} className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Enter your email"
          aria-invalid={state.status === "error" || undefined}
          aria-describedby={state.status === "error" ? errorId : undefined}
          className="h-12 w-full min-w-0 shrink-0 rounded-full border border-border bg-background px-5 sm:w-auto sm:flex-1 text-[15px] text-foreground placeholder:text-muted"
        />
        <Submit />
      </div>
      {state.status === "error" && (
        <p id={errorId} role="alert" className="mt-2 text-left text-[14px] text-danger-text sm:pl-5">
          {state.message}
        </p>
      )}

      {/* Honeypot. Hidden from people and screen readers, visible to bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${emailId}-website`}>Leave this field empty</label>
        <input id={`${emailId}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
    </form>
  );
}
