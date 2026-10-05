import { cn } from "@/lib/utils";

/*
  The Sponsored label (D204). Plain text, like Google's: the word itself is the
  disclosure, so it never relies on colour or an icon, and it stays whole on
  one line. Every sponsored placement on Celpare draws this one component.
*/
export function SponsoredLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[12px] font-semibold leading-none text-foreground",
        className,
      )}
    >
      Sponsored
    </span>
  );
}
