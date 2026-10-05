import { Cpu, Wrench } from "lucide-react";
import { VerifiedTick } from "@/components/ui/verified-tick";
import type { PostIdentity } from "@/lib/community/identity";
import { cn } from "@/lib/utils";

/*
  What sits right after a byline name (D203, founder 2026-10-05):

  - the blue tick, when a tool is verified (D201);
  - a small "Tool" or "Model" label with its icon, so a reader knows at once
    the post is from a tool or a model and not from a person. Words and an
    icon, never the icon alone, and it never wraps.

  A person gets nothing here: a person is the default and needs no label.
  `onMedia` is the white version for the video viewer, over the picture.
*/
export function IdentityMarks({
  identity,
  onMedia = false,
  className,
}: {
  identity: PostIdentity;
  onMedia?: boolean;
  className?: string;
}) {
  if (identity.kind === "person") return null;
  const Icon = identity.kind === "tool" ? Wrench : Cpu;

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 self-center", className)}>
      {identity.verified ? (
        <VerifiedTick label={`Verified ${identity.kind}`} className="size-4" />
      ) : null}
      <span
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[11px] font-medium leading-4",
          onMedia ? "border-white/60 text-white" : "border-border text-muted",
        )}
      >
        <Icon className="size-3" aria-hidden />
        {identity.kind === "tool" ? "Tool" : "Model"}
      </span>
    </span>
  );
}
