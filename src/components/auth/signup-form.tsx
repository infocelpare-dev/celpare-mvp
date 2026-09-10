"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
import { signUp, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, PasswordField, FormAlert } from "@/components/ui/field";

const initial: AuthState = { status: "idle", message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-6 w-full">
      {pending ? "Creating account..." : "Create account"}
      {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
    </Button>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState(signUp, initial);
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();

  return (
    <form action={formAction} noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}

      <div className="space-y-4">
        <Field
          id={nameId}
          name="fullName"
          label="Full name"
          autoComplete="name"
          required
          maxLength={120}
          placeholder="Ada Lovelace"
          invalid={state.field === "fullName"}
        />
        <Field
          id={emailId}
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          placeholder="you@company.com"
          invalid={state.field === "email"}
        />
        <PasswordField
          id={passwordId}
          name="password"
          label="Password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          hint="At least 8 characters."
          invalid={state.field === "password"}
        />
      </div>

      <Submit />

      <p className="mt-4 text-center text-[13px] leading-relaxed text-muted">
        We will email you a 6 digit code to confirm your address.
      </p>
    </form>
  );
}
