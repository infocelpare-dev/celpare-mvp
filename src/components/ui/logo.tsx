import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  Wordmark fallback. The supplied logo is a JPEG with the lime background baked
  in, so the orca mark cannot sit on a white or black surface cleanly.
  Tracked as G7 / task 1.9. Swap the square for the real SVG once it exists.
*/
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2.5 text-foreground",
        className,
      )}
      aria-label="Celpare home"
    >
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-[9px] bg-accent font-display text-[15px] font-bold text-on-accent"
      >
        C
      </span>
      <span className="font-display text-[18px] font-bold tracking-tight">
        Celpare
      </span>
    </Link>
  );
}
