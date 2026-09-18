"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  16px ON A PHONE, 15px FROM sm UP.

  iOS Safari zooms the whole page whenever a focused input computes to less
  than 16px, and it does not zoom back out afterwards. At 15px that fired on
  every field of every form on the site: sign in, sign up, profile edit, the
  fifteen field tool submission. The page ends up wider than the screen and
  stays there, which is the "blocked on mobile" the founder asked about on
  2026-09-18.

  The desktop design is untouched: the bump applies below sm only.
*/
const inputBase =
  "h-11 w-full rounded-xl border border-border bg-background px-4 text-[16px] sm:text-[15px] text-foreground placeholder:text-muted disabled:opacity-50";

export function Field({
  id,
  label,
  hint,
  invalid,
  className,
  ...props
}: React.ComponentProps<"input"> & {
  id: string;
  label: string;
  hint?: string;
  invalid?: boolean;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[14px] font-medium text-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(inputBase, invalid && "border-foreground")}
        {...props}
      />
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/* Password visibility toggle, per the ux guideline that users must be able to
   see what they are typing. The button is excluded from the tab order of the
   field itself but remains keyboard reachable. */
export function PasswordField({
  id,
  label,
  hint,
  invalid,
  className,
  ...props
}: React.ComponentProps<"input"> & {
  id: string;
  label: string;
  hint?: string;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[14px] font-medium text-foreground"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={cn(inputBase, "pr-11", invalid && "border-foreground")}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute right-1 top-1 grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-muted transition-colors duration-200 ease-out hover:text-foreground"
        >
          {shown ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/*
  Error summary. The ux guidance rates a visual-only error as a High severity
  issue, so this is role="alert", focusable, and sits at the top of the form
  alongside the inline aria-invalid state on the field itself.
*/
export function FormAlert({
  id,
  tone = "error",
  children,
}: {
  /* Optional, and only needed by a form long enough that focus has to be moved
     here after a failed submit. tabIndex is already -1 for exactly that. */
  id?: string;
  tone?: "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      role="alert"
      tabIndex={-1}
      className={cn(
        "mb-5 rounded-xl border px-4 py-3 text-[14px] leading-relaxed",
        tone === "error"
          ? "border-border bg-surface text-foreground"
          : "border-transparent bg-accent text-on-accent",
      )}
    >
      {children}
    </div>
  );
}
