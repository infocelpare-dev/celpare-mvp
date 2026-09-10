"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
import {
  verifyCode,
  resendCode,
  type AuthState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormAlert } from "@/components/ui/field";

const initial: AuthState = { status: "idle", message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-6 w-full">
      {pending ? "Checking..." : "Confirm email"}
      {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
    </Button>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cursor-pointer text-foreground underline underline-offset-4 transition-colors duration-200 ease-out hover:text-muted disabled:opacity-50"
    >
      {pending ? "Sending..." : "Send a new code"}
    </button>
  );
}

export function VerifyForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(verifyCode, initial);
  const [resendState, resendAction] = useActionState(resendCode, initial);
  const codeId = useId();

  return (
    <div>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      {resendState.status !== "idle" && (
        <FormAlert tone={resendState.status === "success" ? "success" : "error"}>
          {resendState.message}
        </FormAlert>
      )}

      <form action={formAction} noValidate>
        <input type="hidden" name="email" value={email} />
        <Field
          id={codeId}
          name="code"
          label="6 digit code"
          /* inputMode numeric brings up the number pad without the spinner
             arrows and odd validation of type="number". */
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
          placeholder="123456"
          className="[&_input]:text-center [&_input]:font-mono [&_input]:text-[20px] [&_input]:tracking-[0.4em]"
          invalid={state.field === "code"}
        />
        <Submit />
      </form>

      <div className="mt-6 border-t border-border pt-5 text-center text-[14px] text-muted">
        <p>Did not get it? Check spam, then</p>
        <form action={resendAction} className="mt-1">
          <input type="hidden" name="email" value={email} />
          <ResendButton />
        </form>
      </div>
    </div>
  );
}
