import { cn } from "@/lib/utils";

/*
  The verified mark: a blue badge with a white tick (D201, founder instruction
  2026-10-05). One component so every surface draws the same thing.

  Lucide's BadgeCheck outline, filled. The badge is the only blue in the system
  (--verified), and the label is always present, so it never relies on colour.
  An empty label makes it decorative, for a button whose text already says it.
*/
export function VerifiedTick({
  label = "Verified",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={cn("size-4 shrink-0", className)}
    >
      {label ? <title>{label}</title> : null}
      <path
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
        fill="var(--verified)"
        stroke="var(--verified)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m9 12 2 2 4-4"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
