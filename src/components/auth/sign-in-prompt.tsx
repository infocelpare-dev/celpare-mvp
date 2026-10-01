"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
  The sign in prompt. Founder instruction 2026-10-01: a signed out visitor who
  taps something that needs an account (like, comment, save, follow, post) sees
  Sign up, Log in and an X to cancel, and stays where they are. They used to be
  sent straight to /get-started, which threw away the page they were reading.

  ONE DIALOG, MOUNTED ONCE in the root layout, opened by a window event rather
  than through context. Two reasons. Some triggers live inside menus and drawers
  that unmount the moment they are tapped, which would take a dialog rendered
  beside the trigger down with them. And a server component can place a
  SignInButton without any provider having to wrap it.

  A NATIVE <dialog>, for the reasons save-to-collection.tsx gives: showModal()
  supplies the focus trap, Escape, the inert page behind it and the top layer.

  Sign up and Log in go to the forms directly, not through /get-started. Both
  forms run their own Turnstile check, which is the real boundary; the gate page
  is UI (see entry-gate.tsx).
*/

const OPEN_EVENT = "celpare:sign-in-prompt";

export function openSignInPrompt() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function SignInPromptHost() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => setOpen(false);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="sign-in-prompt-title"
      /* Escape and a backdrop dismissal both arrive here, so state cannot drift
         out of step with the element. */
      onClose={close}
      onClick={(e) => {
        if (e.target === dialogRef.current) close();
      }}
      className="m-auto w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="relative px-6 pb-6 pt-5">
        <button
          type="button"
          onClick={close}
          className="absolute end-2 top-2 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
        >
          <X className="size-5" aria-hidden />
          <span className="sr-only">Cancel</span>
        </button>

        <h2
          id="sign-in-prompt-title"
          className="pe-10 pt-2 text-[20px] font-medium tracking-[-0.02em]"
        >
          Join Celpare to continue
        </h2>

        <div className="mt-6 space-y-3">
          {/* Closed on tap: the dialog lives in the root layout, which a client
              navigation keeps, so it would still be open on the form page. */}
          <ButtonLink href="/signup" className="w-full" onClick={close}>
            Sign up
          </ButtonLink>
          <ButtonLink href="/login" variant="outline" className="w-full" onClick={close}>
            Log in
          </ButtonLink>
        </div>
      </div>
    </dialog>
  );
}

/*
  A button that opens the prompt. Callers style it exactly as the control it
  stands in for, so a signed out like still looks like a like.
*/
export function SignInButton({
  onClick,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "type">) {
  return (
    <button
      type="button"
      {...props}
      /* Tailwind's preflight gives a button the default cursor; the links these
         replace showed a pointer. */
      className={cn("cursor-pointer", className)}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) openSignInPrompt();
      }}
    >
      {children}
    </button>
  );
}
