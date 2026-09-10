"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
import { requestDemo, type DemoState } from "@/app/actions/demo";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";

const initial: DemoState = { status: "idle", message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="sm:w-auto">
      {pending ? "Sending..." : "Request demo"}
      {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
    </Button>
  );
}

export function DemoForm() {
  const [state, formAction] = useActionState(requestDemo, initial);
  const emailId = useId();

  if (state.status === "success") {
    return <FormAlert tone="success">{state.message}</FormAlert>;
  }

  return (
    <form action={formAction} noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}

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
          aria-invalid={state.status === "error" || undefined}
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-4 text-[15px] text-foreground placeholder:text-muted"
        />
        <Submit />
      </div>

      {/* Honeypot. Hidden from people and screen readers, visible to bots. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
    </form>
  );
}
