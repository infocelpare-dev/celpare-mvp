"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  Toggle chips for the onboarding questions. Buttons with aria-pressed, so a
  screen reader hears each as on or off; the list wraps rather than scrolls so
  no choice is ever hidden (ui-ux-pro-max: chip collection reflow).

  Selected is the ink pill with a lime check (D122: lime is the accent on an
  active state and never carries white text; ink on lime is 14.52:1).
*/
export function Chip({
  selected,
  onToggle,
  children,
  disabled,
}: {
  selected: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled && !selected}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[15px] font-medium tracking-[-0.01em] transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-40",
        selected
          ? "border-transparent bg-primary text-on-primary hover:bg-primary-hover"
          : "border-border bg-elevated text-foreground hover:bg-surface",
      )}
    >
      {selected ? (
        <span aria-hidden className="flex size-4 items-center justify-center rounded-full bg-accent text-on-accent">
          <Check className="size-3" strokeWidth={3} />
        </span>
      ) : null}
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
}

export function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2.5">
      {children}
    </div>
  );
}
