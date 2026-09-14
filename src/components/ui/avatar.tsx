import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { AvatarImage } from "@/components/ui/avatar-image";

/*
  D71: initials on lime, or the photo an OAuth provider already gave us. There
  is no upload, so D42 stands: accepting files would need a bucket, a malware
  scanner, an image moderation path and a retention decision.

  A plain img, not next/image. This follows the Monogram in ask/tool-cards.tsx
  for the same reason it does: next/image needs every remote host allowlisted
  in next.config, and a Google avatar lives on lh3.googleusercontent.com. The
  plain tag is the precedent this codebase already set for third party images.

  Ink on lime is 14.52:1. White on lime is 1.17:1 and is never used (D2).
*/

const avatar = cva(
  "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-border bg-accent font-display font-semibold text-on-accent",
  {
    variants: {
      size: {
        sm: "size-8 text-[13px]",
        md: "size-10 text-[15px]",
        lg: "size-14 text-[20px]",
        xl: "size-20 text-[28px] sm:size-24 sm:text-[32px]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

/*
  Two letters where there are two words, one otherwise. Falls back through
  display name, then username, then a neutral mark, so this never renders empty
  and never renders a guess about who somebody is.
*/
export function initialsFrom(fullName?: string | null, username?: string | null): string {
  const source = (fullName ?? "").trim() || (username ?? "").trim();
  if (!source) return "?";

  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function Avatar({
  fullName,
  username,
  avatarUrl,
  size,
  className,
}: {
  fullName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  className?: string;
} & VariantProps<typeof avatar>) {
  const initials = initialsFrom(fullName, username);

  /*
    The alt is empty on purpose. An avatar sits beside the person's name in
    every place this is used, so describing it again is noise for a screen
    reader rather than information.

    With a URL this hands off to a client component, purely so a failed load
    can fall back to the initials. Without one it stays a plain server render
    with no JavaScript involved, which is the common case.
  */
  if (avatarUrl) {
    return (
      <AvatarImage
        src={avatarUrl}
        initials={initials}
        className={cn(avatar({ size }), className)}
      />
    );
  }

  return (
    <span aria-hidden className={cn(avatar({ size }), className)}>
      {initials}
    </span>
  );
}
