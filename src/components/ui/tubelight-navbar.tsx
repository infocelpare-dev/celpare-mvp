"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TubelightNavItem {
  name: string;
  url: string;
  icon?: LucideIcon;
}

interface TubelightNavProps {
  items: TubelightNavItem[];
  /** Name of the active item. When left out, the nav tracks clicks itself. */
  active?: string;
  onSelect?: (name: string) => void;
  /** Show the icon instead of the name below this breakpoint. Off by default. */
  iconsOnSmall?: boolean;
  className?: string;
}

/*
  A pill of links with a lime "tube light" that glides to the active item.
  Lime is an accent here, never a text background (brand: white on lime fails).
  The glide is the only motion, and it snaps when the visitor prefers reduced motion.
*/
export function TubelightNav({
  items,
  active,
  onSelect,
  iconsOnSmall = false,
  className,
}: TubelightNavProps) {
  const [clicked, setClicked] = useState(items[0]?.name ?? "");
  const current = active ?? clicked;
  const reduceMotion = useReducedMotion();

  return (
    <nav aria-label="Main" className={className}>
      <div className="flex items-center gap-1 rounded-full border border-border bg-background/60 p-1 shadow-sm backdrop-blur-lg">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = current === item.name;

          return (
            <Link
              key={item.name}
              href={item.url}
              aria-current={isActive ? "true" : undefined}
              onClick={() => {
                setClicked(item.name);
                onSelect?.(item.name);
              }}
              className={cn(
                "relative rounded-full px-4 py-1.5 text-[14px] font-medium whitespace-nowrap transition-colors duration-200 ease-out",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
                isActive ? "text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              <span className={cn(iconsOnSmall && Icon && "hidden md:inline")}>{item.name}</span>
              {iconsOnSmall && Icon && (
                <span className="md:hidden">
                  <Icon size={18} strokeWidth={2.25} aria-hidden />
                  <span className="sr-only">{item.name}</span>
                </span>
              )}
              {isActive && (
                <motion.span
                  layoutId="tubelight"
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-full bg-surface"
                  initial={false}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 380, damping: 32 }
                  }
                >
                  <span className="absolute -top-1 left-1/2 h-[3px] w-7 -translate-x-1/2 rounded-full bg-accent">
                    <span className="absolute -top-2 -left-2 h-5 w-11 rounded-full bg-accent/25 blur-md" />
                    <span className="absolute -top-1 left-0 h-4 w-7 rounded-full bg-accent/25 blur-md" />
                  </span>
                </motion.span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
