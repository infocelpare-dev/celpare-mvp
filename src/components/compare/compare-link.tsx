import Link from "next/link";
import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { compareHref } from "@/lib/compare/params";
import type { CompareItemType } from "@/lib/compare/types";

/*
  The way into Compare from a card or a profile.

  It opens /compare with this one item already selected, and the page asks for
  the second. No tray and no client store that follows somebody around the site:
  the comparison is the URL, and a link is the whole entry point.

  A plain link, so it works in the server rendered cards without making them
  client components. `icon` is the compact shape for a card footer, which sits
  beside the 44px Save control and matches its footprint.
*/
export function CompareLink({
  type,
  slug,
  name,
  variant = "icon",
  className,
}: {
  type: CompareItemType;
  slug: string;
  name: string;
  variant?: "icon" | "button";
  className?: string;
}) {
  const href = compareHref([{ type, slug }]);

  if (variant === "button") {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[14px] text-foreground transition-colors duration-200 ease-out hover:bg-surface",
          className,
        )}
      >
        <Scale className="size-4" aria-hidden />
        Compare
      </Link>
    );
  }

  return (
    <Link
      href={href}
      title="Compare"
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground",
        className,
      )}
    >
      <Scale className="size-[18px]" aria-hidden />
      <span className="sr-only">Compare {name}</span>
    </Link>
  );
}
