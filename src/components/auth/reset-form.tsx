"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";
import { resetPassword, type AccountState } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { FormAlert, PasswordField } from "@/components/ui/field";
import { PasswordStrength } from "./password-strength";

const initial: AccountState = { status: "idle", message: "" };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-6 w-full">
      {pending ? "Saving..." : "Save new password"}
      {!pending && <ArrowRight className="h-4 w-4" aria-hidden />}
    </Button>
  );
}

/*
  New password and Confirm password (D193). Both are kept after an error, so a
  mismatch costs one retype, not two, and the checklist is live, the same one
  signup shows, so the rules are never a surprise after submit.
*/
export function ResetForm() {
  const [state, formAction] = useActionState(resetPassword, initial);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const passwordId = useId();
  const confirmId = useId();
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <form action={formAction} noValidate>
      {state.status === "error" && <FormAlert>{state.message}</FormAlert>}
      <div className="space-y-4">
        <div>
          <PasswordField
            id={passwordId}
            name="password"
            label="New password"
            autoComplete="new-password"
            required
            autoFocus
            placeholder="At least 10 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={state.field === "password"}
          />
          <PasswordStrength value={password} />
        </div>
        <PasswordField
          id={confirmId}
          name="confirm"
          label="Confirm password"
          autoComplete="new-password"
          required
          placeholder="Type it again"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          invalid={state.field === "confirm" || mismatch}
          hint={mismatch ? "The two passwords do not match yet." : undefined}
        />
      </div>
      <Submit />
    </form>
  );
}
