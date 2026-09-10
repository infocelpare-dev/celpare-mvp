"use client";

import { useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  Deliberate honesty about what this is.

  A checkbox is not bot protection. Any script can post `human=on`. It stops
  the laziest form spam and nothing more. Real protection is Cloudflare
  Turnstile, which Supabase supports natively under Auth, Attack Protection,
  and which fits since Celpare deploys to Cloudflare (D15). Tracked as G16.

  Keeping it means signup has the slot ready, so swapping in Turnstile later is
  a component change rather than a form redesign.
*/
export function HumanCheck({ invalid }: { invalid?: boolean }) {
  const [checked, setChecked] = useState(false);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3.5",
        invalid ? "border-foreground" : "border-border",
      )}
    >
      {/* The real form value. Visually hidden, not display:none, so it still
          participates in the form and stays reachable by keyboard. */}
      <input
        type="checkbox"
        id="human"
        name="human"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="peer sr-only"
        aria-invalid={invalid || undefined}
      />
      <label
        htmlFor="human"
        className={cn(
          "grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded border transition-colors duration-200 ease-out",
          checked
            ? "border-transparent bg-accent text-on-accent"
            : "border-border bg-background",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]",
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" aria-hidden />}
      </label>
      <label
        htmlFor="human"
        className="cursor-pointer select-none text-[14px] text-foreground"
      >
        I am not a robot
      </label>
      <ShieldCheck className="ml-auto h-4 w-4 shrink-0 text-muted" aria-hidden />
    </div>
  );
}
