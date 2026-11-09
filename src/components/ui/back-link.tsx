"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { cameFrom } from "@/components/app/use-scroll-memory";

/*
  The way back out of any sub page.

  An explicit destination, not a blind history.back(). Browser history is where
  you came FROM, which is not always inside Celpare: land on a tool page from a
  search engine and "back" leaves the product entirely. A named parent is
  always right, and it also tells you where you are going before you tap it,
  which a back arrow on its own does not.

  One exception, and it is exact: when the page this link names IS the page
  you just came from inside Celpare, it goes back through history instead. Same
  destination, but the router returns the page as you left it and the main
  column is scrolled back to where you were (use-scroll-memory.ts). Without
  this, "Back to the feed" pushed a fresh feed and dropped you at the top.

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
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (cameFrom() === new URL(href, window.location.origin).pathname) {
          e.preventDefault();
          router.back();
        }
      }}
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
