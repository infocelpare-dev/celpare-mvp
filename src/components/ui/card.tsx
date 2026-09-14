import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  These three were inlined in tools/[slug], community and the ask cards. Same
  markup each time, so it is extracted once here rather than copied a fourth
  time for the profile.

  Flat per D11: one hairline border, no shadow, no gradient.

  Badge and Chip look alike and are not the same thing, per tracker 4.10:
  a badge states a fact and is not interactive, a chip is something you press.
  Keeping them as separate exports is what stops a badge quietly becoming a
  dead button.
*/

export function Card({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-2xl border border-border p-5 sm:p-6", className)}
      {...props}
    />
  );
}

/* Not interactive. States a fact: a topic, a plan, a developer flag. */
export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium",
        /*
          nowrap with a shrinkable label, per the ux guideline that a compact
          label should stay whole on one line rather than wrapping to a second.
        */
        "min-w-0 whitespace-nowrap",
        tone === "accent"
          ? "bg-accent text-on-accent"
          : "border border-border text-muted",
        className,
      )}
      {...props}
    />
  );
}

/* Interactive. Navigates or filters. */
export function ChipLink({
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "inline-flex min-w-0 items-center whitespace-nowrap rounded-full border border-border px-3 py-1 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
