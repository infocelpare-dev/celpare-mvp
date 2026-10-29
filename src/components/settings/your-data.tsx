"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { Download } from "lucide-react";
import Link from "next/link";
import { deleteAccount, sendDeletionCode, type DeleteState } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Field, FormAlert } from "@/components/ui/field";

const initial: DeleteState = { status: "idle", message: "" };
const PHRASE = "delete my account";

function Submit({ idle, busy, danger, disabled }: { idle: string; busy: string; danger?: boolean; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending || disabled}
      className={danger ? "border-danger text-danger-text hover:bg-danger-surface" : undefined}
    >
      {pending ? busy : idle}
    </Button>
  );
}

/*
  Your data (phase LEGAL, 2026-10-07): the two rights the Privacy Policy says a
  person can use themselves. Download is a plain link to a route that answers
  with a file. Delete takes an emailed code and a typed phrase, and nothing is
  removed until both are right (see deleteAccount).
*/
export function YourData({ email }: { email: string | null }) {
  const [sent, sendAction] = useActionState(sendDeletionCode, initial);
  const [state, deleteAction] = useActionState(deleteAccount, initial);
  const [phrase, setPhrase] = useState("");
  const [code, setCode] = useState("");
  const phraseId = useId();
  const codeId = useId();
  const ready = phrase.trim().toLowerCase() === PHRASE && /^\d{6}$/.test(code.trim());

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-border p-4">
        <p className="text-[15px] font-medium">Download my data</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          One JSON file with everything tied to your account: profile, posts, comments, messages,
          Ask Celpare chats, saved items, searches, devices and more.
        </p>
        <a
          href="/api/account/export"
          download
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-full border border-border bg-elevated px-6 text-[15px] font-medium transition-colors duration-200 hover:bg-surface"
        >
          <Download className="size-4" aria-hidden />
          Download my data
        </a>
      </div>

      <div className="rounded-2xl border border-danger/40 p-4">
        <p className="text-[15px] font-medium">Delete account</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          This cannot be undone. Your profile, posts, comments, messages, chats, saved items and
          uploaded files are deleted. Search and view records stay only without your account
          attached, and tools you listed stay in the catalogue without an owner.{" "}
          <Link href="/legal/privacy#retention" className="underline underline-offset-4 hover:text-foreground">
            What is kept and why
          </Link>
        </p>

        {sent.status !== "idle" && (
          <div className="mt-3">
            <FormAlert tone={sent.status === "sent" ? "success" : "error"}>{sent.message}</FormAlert>
          </div>
        )}
        <form action={sendAction} className="mt-3">
          <Submit
            idle={sent.status === "sent" ? "Send a new code" : `Email a code to ${email ?? "my address"}`}
            busy="Sending..."
          />
        </form>

        {sent.status === "sent" && (
          <form action={deleteAction} noValidate className="mt-5 space-y-3">
            {state.status === "error" && <FormAlert tone="error">{state.message}</FormAlert>}
            <Field
              id={codeId}
              name="code"
              label="Code from the email"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              invalid={state.field === "code"}
            />
            <Field
              id={phraseId}
              name="phrase"
              label={`Type "${PHRASE}" to confirm`}
              autoComplete="off"
              required
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              invalid={state.field === "phrase"}
            />
            <Submit idle="Delete my account forever" busy="Deleting..." danger disabled={!ready} />
          </form>
        )}
      </div>
    </div>
  );
}
