import { Avatar } from "@/components/ui/avatar";
import type { PostIdentity } from "@/lib/community/identity";
import { cn } from "@/lib/utils";

/*
  The picture beside a byline (D203). A person is a circle, as everywhere. A
  tool or a model is a rounded square with its logo, the shape tool cards
  already use, so a page reads as a page and never as a person at a glance.
*/
const SQUARE = {
  sm: "size-8 rounded-lg text-[13px]",
  md: "size-10 rounded-xl text-[15px]",
} as const;

export function IdentityAvatar({
  identity,
  size = "md",
  className,
}: {
  identity: PostIdentity;
  size?: "sm" | "md";
  className?: string;
}) {
  if (identity.kind === "person") {
    return (
      <Avatar
        fullName={identity.fullName}
        username={identity.username}
        avatarUrl={identity.imageUrl}
        size={size}
        className={className}
      />
    );
  }
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden border border-border bg-elevated font-medium text-foreground",
        SQUARE[size],
        className,
      )}
    >
      {identity.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={identity.imageUrl} alt="" className="size-full object-cover" />
      ) : (
        identity.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
