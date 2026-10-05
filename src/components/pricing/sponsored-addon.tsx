import { Check, Megaphone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { SponsoredLabel } from "@/components/ui/sponsored-label";
import { formatUsd } from "@/lib/pricing/plans";
import { MAX_SPONSORED_TOOLS as SPONSORED_MAX, SPONSORSHIP_PRICE_CENTS } from "@/lib/sponsored/config";

/*
  The Sponsored tool add-on, under the developer plans (D204). Not a fourth
  plan: it works with any of them and is bought per tool, so it sits apart, as
  one wide card. Monthly whatever the billing switch says, because that is how
  it is sold.

  Sponsor opens the Sponsored page inside Pricing, with the details and the
  price; the same page Sponsor this tool on a tool page opens.
*/

const FEATURES = [
  `One of up to ${SPONSORED_MAX} Sponsored slots above the results in Search`,
  `One of up to ${SPONSORED_MAX} Sponsored cards in Ask Celpare answers`,
  "Shown only when someone searches for what your tool does",
  "Always labelled Sponsored, and your normal ranking is unchanged",
];

export function SponsoredAddon() {
  return (
    <section
      aria-labelledby="sponsored-addon-title"
      className="mx-auto mt-4 grid max-w-[1040px] gap-6 rounded-3xl border border-border bg-elevated p-6 sm:p-8 md:grid-cols-[1fr_1.2fr]"
    >
      <div>
        <div className="flex items-center gap-3">
          <Megaphone className="size-7 text-foreground" strokeWidth={1.5} aria-hidden />
          <SponsoredLabel />
        </div>
        <h2
          id="sponsored-addon-title"
          className="mt-5 text-[28px] font-medium leading-tight tracking-[-0.03em]"
        >
          Sponsored tool
        </h2>
        <p className="mt-1 text-[15px] leading-snug text-muted">
          An add-on for any developer plan, per tool
        </p>
        <p className="mt-6 flex items-baseline gap-2">
          <span className="text-[44px] font-medium leading-none tracking-[-0.04em]">
            {formatUsd(SPONSORSHIP_PRICE_CENTS)}
          </span>
          <span className="text-[13px] leading-tight text-muted">USD per month, per tool</span>
        </p>
        <div className="mt-6">
          <ButtonLink href="/pricing/sponsored" className="w-full sm:w-auto">
            Sponsor
          </ButtonLink>
        </div>
      </div>

      <ul className="space-y-3 md:pt-1">
        {FEATURES.map((feature) => (
          <li key={feature} className="flex gap-3 text-[15px] leading-snug">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
