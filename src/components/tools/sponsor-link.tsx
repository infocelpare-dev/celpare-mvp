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
}: {
  state: SponsorshipState;
  endsLabel: string | null;
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
    <ButtonLink href="/pricing/sponsored" variant="outline" size="sm">
      <Megaphone className="size-4" aria-hidden />
      Sponsor this tool
    </ButtonLink>
  );
}
