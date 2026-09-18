"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
import { signIn, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, PasswordField, FormAlert } from "@/components/ui/field";
import { Turnstile } from "./turnstile";

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

/*
  React resets a form once its action resolves. Left alone that clears the email
  on every failed attempt, so a mistyped password costs you the address as well.
  The email is controlled and kept; the password is left uncontrolled so it
  clears, which is the usual convention and the right one here, since a wrong
  password is the likely reason we are back on this screen.
*/
export function LoginForm() {
  const [state, formAction] = useActionState(signIn, initial);
  const [email, setEmail] = useState("");
  /*
    Sign in carries a captcha token for the same reason signup does: Supabase
    enforces captcha protection at the project level, so signInWithPassword is
    rejected without one. A token is single use, so this widget runs its own
    challenge rather than sharing signup's.

    Single use is also why resetKey is passed below. A wrong password spends
    the token, and without a re-arm the retry would be refused by the captcha
    rather than by the password, which is the one screen where that is most
    likely to happen.
  */
  const [captchaToken, setCaptchaToken] = useState("");
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
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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

      <div className="mt-5">
        <Turnstile
          onToken={setCaptchaToken}
          invalid={state.field === "captcha"}
          action="login"
          resetKey={state.attempt}
        />
        <input type="hidden" name="captchaToken" value={captchaToken} />
      </div>

      <Submit />
    </form>
  );
}
