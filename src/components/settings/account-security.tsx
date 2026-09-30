"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  changeEmail,
  sendPasswordChangeLink,
  type AccountState,
} from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Field, FormAlert } from "@/components/ui/field";

const initial: AccountState = { status: "idle", message: "" };

function Pending({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

/*
  Password and email (D193). Neither changes here directly: both send a link
  from noreplyaccount@celpare.com, and the change happens when it is opened.
  That is what makes a stolen session unable to lock the owner out.
*/
export function AccountSecurity({ email }: { email: string | null }) {
  const [pwState, pwAction] = useActionState(sendPasswordChangeLink, initial);
  const [emState, emAction] = useActionState(changeEmail, initial);
  const [next, setNext] = useState("");
  const emailId = useId();

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-border p-4">
        <p className="text-[15px] font-medium">Password</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          We email you a link. It opens a form to choose a new password, and every device is logged
          out when it is saved.
        </p>
        {pwState.status !== "idle" && (
          <div className="mt-3">
            <FormAlert tone={pwState.status === "success" ? "success" : "error"}>{pwState.message}</FormAlert>
          </div>
        )}
        <form action={pwAction} className="mt-3">
          <Pending idle="Email me to change it" busy="Sending..." />
        </form>
      </div>

      <div className="rounded-2xl border border-border p-4">
        <p className="text-[15px] font-medium">Email address</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Now {email ?? "not set"}. We send a link to the current and the new address, and the change
          happens once both are opened.
        </p>
        {emState.status !== "idle" && (
          <div className="mt-3">
            <FormAlert tone={emState.status === "success" ? "success" : "error"}>{emState.message}</FormAlert>
          </div>
        )}
        {emState.status !== "success" && (
          <form action={emAction} noValidate className="mt-3 space-y-3">
            <Field
              id={emailId}
              name="email"
              type="email"
              label="New email address"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              invalid={emState.field === "email"}
            />
            <Pending idle="Send confirmation links" busy="Sending..." />
          </form>
        )}
      </div>
    </div>
  );
}
