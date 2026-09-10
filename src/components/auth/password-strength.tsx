"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  Requirements shown as a live checklist rather than an error after submit.
  Telling someone the rules only once they have failed is the worst version of
  this. Mirrors the server side schema in app/actions/auth.ts exactly, so the
  form never says a password is fine when the server will reject it.
*/
export const passwordRules = [
  { label: "At least 10 characters", test: (v: string) => v.length >= 10 },
  { label: "A lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "An uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "A number", test: (v: string) => /[0-9]/.test(v) },
];

const bonus = [
  { test: (v: string) => v.length >= 14 },
  { test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

export function scorePassword(value: string) {
  const met = passwordRules.filter((r) => r.test(value)).length;
  const extra = bonus.filter((b) => b.test(value)).length;
  if (!value) return { level: 0, label: "" };
  if (met < passwordRules.length) return { level: 1, label: "Too weak" };
  if (extra === 0) return { level: 2, label: "Okay" };
  if (extra === 1) return { level: 3, label: "Strong" };
  return { level: 4, label: "Very strong" };
}

export function PasswordStrength({ value }: { value: string }) {
  const { level, label } = scorePassword(value);

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <div
          className="flex h-1 flex-1 gap-1"
          role="img"
          aria-label={
            label ? `Password strength: ${label}` : "Password strength"
          }
        >
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                "h-full flex-1 rounded-full transition-colors duration-200",
                i <= level ? "bg-accent" : "bg-border",
              )}
            />
          ))}
        </div>
        {label ? (
          <span className="w-[84px] shrink-0 text-right text-[12px] text-muted">
            {label}
          </span>
        ) : null}
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {passwordRules.map((r) => {
          const ok = r.test(value);
          return (
            <li
              key={r.label}
              className={cn(
                "flex items-center gap-1.5 text-[12.5px]",
                ok ? "text-foreground" : "text-muted",
              )}
            >
              {ok ? (
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <X className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
              )}
              {r.label}
            </li>
          );
        })}
      </ul>

      <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted">
        Longer beats complicated. Four random words are harder to crack than one
        word with symbols swapped in. Never reuse a password from another site.
      </p>
    </div>
  );
}
