import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  The way back out of any sub page.

  An explicit destination, not history.back(). Browser history is where you
  came FROM, which is not always inside Celpare: land on a tool page from a
  search engine and "back" leaves the product entirely. A named parent is
  always right, and it also tells you where you are going before you tap it,
  which a back arrow on its own does not.

  Placed above the page heading on every sub page, so it is in the same spot
  every time rather than being hunted for.
*/
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  /* Name the destination: "Back to your profile", not "Back". */
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 text-[14px] text-muted transition-colors duration-200 ease-out hover:text-foreground",
        className,
      )}
    >
      <ArrowLeft className="size-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}
