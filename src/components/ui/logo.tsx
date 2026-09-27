import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  The mark is the founder's orca, lime on a dark tile, as a rounded square, in
  both themes (founder, 2026-09-25). It replaced the ink orca on a lime tile,
  which is kept in design/brand-previous and no longer served. The orca is the
  same drawing in the same place in the frame, so nothing moved. The dark tile
  reads on the light canvas and blends into the dark one, and the lime orca
  never changes colour. Generated sizes live in public/brand; the favicon in
  src/app/favicon.ico is the same mark.
*/
export function LogoMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/brand/celpare-mark-dark-256.png"
      alt=""
      width={size}
      height={size}
      priority
      className={cn("shrink-0 rounded-[9px]", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function Logo({
  className,
  size = 32,
  showWordmark = true,
  wordmarkClassName,
}: {
  className?: string;
  size?: number;
  showWordmark?: boolean;
  /* Lets a caller hide the wordmark at one breakpoint and keep it at another,
     which the product nav needs: at 390 the two destinations matter more than
     the name, and the mark still says Celpare on its own. */
  wordmarkClassName?: string;
}) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2.5 text-foreground",
        className,
      )}
      aria-label="Celpare home"
    >
      <LogoMark size={size} />
      {showWordmark && (
        <span
          className={cn(
            "font-display text-[18px] font-bold tracking-tight",
            wordmarkClassName,
          )}
        >
          Celpare
        </span>
      )}
    </Link>
  );
}
