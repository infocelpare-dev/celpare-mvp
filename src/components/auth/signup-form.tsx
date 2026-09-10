"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
import { signUp, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, PasswordField, FormAlert } from "@/components/ui/field";
import { PasswordStrength } from "./password-strength";
import { Turnstile } from "./turnstile";

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

/*
  React resets a form once its action resolves, which clears every uncontrolled
  input. On a failed signup that meant retyping everything, including a password
  that had just been composed to satisfy four rules, so every field is now
  controlled and survives the round trip.

  Signup keeps the password too, unlike login. The thing that fails here is
  almost always the email or the bot check, and the password rules are shown
  live next to the field, so wiping it punishes the wrong mistake.
*/
export function SignupForm() {
  const [state, formAction] = useActionState(signUp, initial);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
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
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          invalid={state.field === "fullName"}
        />
        <Field
          id={emailId}
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          placeholder="ameag@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={state.field === "email"}
        />
        <div>
          <PasswordField
            id={passwordId}
            name="password"
            label="Password"
            autoComplete="new-password"
            required
            minLength={10}
            placeholder="Use something long and unique"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={state.field === "password"}
          />
          <PasswordStrength value={password} />
        </div>

        <Turnstile onToken={setCaptchaToken} invalid={state.field === "captcha"} />
        <input type="hidden" name="captchaToken" value={captchaToken} />
      </div>

      <Submit />

      <p className="mt-4 text-center text-[13px] leading-relaxed text-muted">
        We will email you a 6 digit code to confirm your address.
      </p>
    </form>
  );
}
