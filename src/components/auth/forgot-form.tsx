"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
import { requestPasswordReset, type AccountState } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Field, FormAlert } from "@/components/ui/field";
import { Turnstile } from "./turnstile";

const initial: AccountState = { status: "idle", message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-6 w-full">
      {pending ? "Sending..." : "Email me a link"}
      {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
    </Button>
  );
}

/* The address stays in the field after an error, like the login form. */
export function ForgotForm() {
  const [state, formAction] = useActionState(requestPasswordReset, initial);
  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const emailId = useId();

  if (state.status === "success") {
    return <FormAlert tone="success">{state.message}</FormAlert>;
  }

  return (
    <form action={formAction} noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      <Field
        id={emailId}
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        invalid={state.field === "email"}
      />
      <div className="mt-5">
        <Turnstile
          onToken={setCaptchaToken}
          invalid={state.field === "captcha"}
          action="reset"
          resetKey={state.attempt}
        />
        <input type="hidden" name="captchaToken" value={captchaToken} />
      </div>
      <Submit />
    </form>
  );
}
