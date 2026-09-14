"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/*
  The bio editor. Field wraps an input, and a 280 character bio needs a
  textarea and a visible count.

  The counter is a live region only once it matters. Announcing every keystroke
  would be unusable, so it stays silent until the remaining count is low, which
  is the point at which a person actually needs to be told.

  maxLength is deliberately NOT set. A hard stop silently swallows a paste and
  the person cannot tell what was lost. Going over shows the overage and the
  server refuses it, which is honest. The database CHECK is the real control
  either way: profiles_bio_len.
*/
export function TextareaField({
  id,
  label,
  hint,
  invalid,
  limit,
  defaultValue,
  className,
  ...props
}: Omit<React.ComponentProps<"textarea">, "maxLength"> & {
  id: string;
  label: string;
  hint?: string;
  invalid?: boolean;
  limit?: number;
}) {
  const [value, setValue] = useState(String(defaultValue ?? ""));
  const used = value.length;
  const over = limit !== undefined && used > limit;
  const near = limit !== undefined && !over && used > limit * 0.9;

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="block text-[14px] font-medium text-foreground">
          {label}
        </label>
        {limit !== undefined ? (
          <span
            /* Silent until it matters, then it speaks once. */
            role={over || near ? "status" : undefined}
            aria-atomic="true"
            className={cn(
              "shrink-0 text-[13px] tabular-nums",
              over ? "font-medium text-foreground" : "text-muted",
            )}
          >
            {over
              ? `${used - limit} over the ${limit} limit`
              : `${used} of ${limit}`}
          </span>
        ) : null}
      </div>

      <textarea
        id={id}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={invalid || over || undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(
          "min-h-[104px] w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-[15px] text-foreground placeholder:text-muted disabled:opacity-50",
          (invalid || over) && "border-foreground",
        )}
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
