"use client";

import { ArrowUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
  Back to top, for the end of the feed, Explore and Compare.

  WHY NOT `href="#top"` ANY MORE. The app scrolls inside <main>, not the
  window, and on the feed the #top target is an sr-only heading: absolutely
  positioned, so its containing block is <body> and it sits OUTSIDE main's
  scrolling box. The browser jumped to it by scrolling nothing (main stayed at
  6650px, reproduced 2026-10-31). A hash link also does nothing on the second
  click, because the URL already ends in #top.

  So this scrolls every scrolling ancestor of the button, and the window when
  it is scrolled, to the top, then moves focus to #top (when there is one) for
  keyboard and screen reader users without scrolling again.

  INSTANT, NOT SMOOTH. Measured on the feed: a smooth scroll of main from
  6650px was cut off at about 300px, and with the focus call after it it did
  not move at all. An instant jump lands every time.
*/
export function BackToTop({
  variant = "outline",
  size,
  className,
}: {
  variant?: "primary" | "outline" | "ghost";
  size?: "md" | "sm";
  className?: string;
}) {
  function toTop(e: React.MouseEvent<HTMLButtonElement>) {
    for (let el = e.currentTarget.parentElement; el; el = el.parentElement) {
      if (el.scrollTop > 0) el.scrollTop = 0;
    }
    if (window.scrollY > 0) window.scrollTo(0, 0);

    const target = document.getElementById("top");
    if (target) {
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  }

  return (
    <button type="button" onClick={toTop} className={cn(buttonVariants({ variant, size }), className)}>
      <ArrowUp className="size-4" aria-hidden />
      Back to top
    </button>
  );
}
