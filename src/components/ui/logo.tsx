import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/*
  The mark is the founder's orca on lime, used as a rounded square. The source
  is a square JPEG with the lime baked in, which is exactly right for an app
  icon shape and needs no transparency. Generated sizes live in public/brand.
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
      src="/brand/celpare-mark-256.png"
      alt=""
      width={size}
      height={size}
      priority
      className={cn("rounded-[9px]", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function Logo({
  className,
  size = 32,
  showWordmark = true,
}: {
  className?: string;
  size?: number;
  showWordmark?: boolean;
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
        <span className="font-display text-[18px] font-bold tracking-tight">
          Celpare
        </span>
      )}
    </Link>
  );
}
