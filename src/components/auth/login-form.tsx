"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
import { signIn, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, PasswordField, FormAlert } from "@/components/ui/field";

const initial: AuthState = { status: "idle", message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-6 w-full">
      {pending ? "Logging in..." : "Log in"}
      {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
    </Button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(signIn, initial);
  const emailId = useId();
  const passwordId = useId();

  return (
    <form action={formAction} noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}

      <div className="space-y-4">
        <Field
          id={emailId}
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          placeholder="ameag@gmail.com"
          invalid={state.field === "email"}
        />
        <PasswordField
          id={passwordId}
          name="password"
          label="Password"
          autoComplete="current-password"
          required
          placeholder="Your password"
          invalid={state.field === "password"}
        />
      </div>

      <Submit />
    </form>
  );
}
