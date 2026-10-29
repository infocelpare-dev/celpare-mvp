import { Megaphone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SponsoredLabel } from "@/components/ui/sponsored-label";
import type { SponsorshipState } from "@/lib/tools/queries";

/*
  Sponsor this tool, on the owner's tool page beside Request verification
  (D204). It goes to the Sponsored page inside Pricing, which has the details
  and the price; there is nothing to request here.

  A tool with a sponsorship running says so instead, with its end date. The
  date arrives formatted from the server.
*/
export function SponsorLink({
  state,
  endsLabel,
  slug,
}: {
  state: SponsorshipState;
  endsLabel: string | null;
  /* Opens the Sponsored page with this tool already chosen (2026-10-09). */
  slug?: string;
}) {
  if (state?.status === "active") {
    return (
      <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3 text-sm text-muted">
        <SponsoredLabel className="border-0 px-0" />
        {endsLabel ? `until ${endsLabel}` : null}
      </span>
    );
  }

  return (
    <ButtonLink href={slug ? `/pricing/sponsored?tool=${encodeURIComponent(slug)}` : "/pricing/sponsored"} variant="outline" size="sm">
      <Megaphone className="size-4" aria-hidden />
      Sponsor this tool
    </ButtonLink>
  );
}
