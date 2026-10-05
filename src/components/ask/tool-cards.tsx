import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";
import { SponsoredLabel } from "@/components/ui/sponsored-label";
import { SponsoredSlot } from "@/components/sponsored/sponsored-slot";
import { MAX_SPONSORED_TOOLS } from "@/lib/sponsored/config";

/*
  The recommendation cards under an answer.

  These are what make this Celpare's assistant rather than a chat box: the
  answer is traceable back to real catalogue records, so a person can open the
  row and check it.

  Two sources, deliberately separate. The model was given seven allowlisted
  columns through search_tools; the card is rendered from a second read of the
  public record (loadToolCards), which may show more, because the allowlist
  limits what the MODEL sees and not what a person is entitled to. Widening the
  card does not widen the prompt.

  Nothing here is invented. A missing logo becomes a monogram rather than a
  stock image, a missing rating says it is not rated rather than showing zero,
  and a missing price says it is not recorded rather than guessing (D13, D40).
*/

export type ToolCitation = {
  slug: string;
  name: string;
  tagline?: string | null;
  description: string;
  logoUrl?: string | null;
  pricing: string | null;
  pricingModel?: string | null;
  tags: string[];
  rating: number | null;
  ratingCount?: number | null;
  features: string[];
  platforms?: string[];
  /* Sponsored cards only (D205): the tool id their events are recorded on. */
  toolId?: string;
};

function Monogram({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  if (logoUrl) {
    /* A plain img, not next/image: next/image would need every logo host
       allowlisted in next.config, and these are third party URLs on a catalogue
       anyone can submit to. Lazy loading is the honest trade until the logos
       are hosted by us. */
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        className="size-9 shrink-0 rounded-lg border border-border object-contain"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface font-display text-[15px] font-semibold text-muted"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/*
  Sponsored cards come first (D204, D205): at most MAX_SPONSORED_TOOLS tools
  that match the question, under "Sponsored options that match your request",
  each labelled. They are not what the answer was written from and the model
  never saw them, so nothing in the answer calls them the best; the heading
  says what they are. The catalogue section is left exactly as the answer used
  it (D205): a sponsored tool that the answer also cites keeps its organic
  card, as it keeps its organic row in Search, so an organic recommendation is
  never made to look paid.
*/
export function ToolCards({
  tools,
  sponsored = [],
  sponsoredRequestId = null,
}: {
  tools: ToolCitation[];
  sponsored?: ToolCitation[];
  sponsoredRequestId?: string | null;
}) {
  const ads = sponsored.filter((t) => t.toolId).slice(0, MAX_SPONSORED_TOOLS);
  const organic = tools;

  return (
    <>
      {ads.length > 0 ? (
        <section className="mt-5" aria-labelledby="ask-sponsored-heading">
          <h2 id="ask-sponsored-heading" className="mb-2 text-[13px] font-medium text-muted">
            Sponsored options that match your request
          </h2>
          <ul className="grid gap-2">
            {ads.map((tool, i) => (
              <SponsoredSlot
                key={tool.slug}
                surface="ask"
                toolId={tool.toolId!}
                name={tool.name}
                position={i}
                requestId={sponsoredRequestId}
                className="rounded-xl border border-border transition-colors duration-200 hover:bg-surface"
              >
                <Card tool={tool} sponsored as="div" />
              </SponsoredSlot>
            ))}
          </ul>
        </section>
      ) : null}

      {organic.length > 0 ? (
        <section className="mt-5" aria-label="Tools referenced in this answer">
          <h2 className="mb-2 text-[13px] font-medium text-muted">
            From the Celpare catalogue
          </h2>
          <ul className="grid gap-2">
            {organic.map((tool) => (
              <Card key={tool.slug} tool={tool} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Card({
  tool,
  sponsored = false,
  as: Tag = "li",
}: {
  tool: ToolCitation;
  sponsored?: boolean;
  /* "div" inside a SponsoredSlot, which is the list item and the frame. */
  as?: "li" | "div";
}) {
  const capabilities = tool.features.slice(0, 3);
  const price = tool.pricing ?? "Pricing not recorded";

  return (
    <Tag
      className={
        Tag === "li"
          ? "rounded-xl border border-border px-4 py-3 transition-colors duration-200 hover:bg-surface"
          : "px-4 pt-3"
      }
    >
      <div className="flex items-start gap-3">
        <Monogram name={tool.name} logoUrl={tool.logoUrl} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/tools/${tool.slug}`}
              className="font-display text-[15px] font-semibold hover:underline"
            >
              {tool.name}
            </Link>
            {sponsored ? <SponsoredLabel /> : null}
            {tool.tags[0] ? (
              /* A static badge, not a chip: it states what this row is,
                         it is not an action. */
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                {tool.tags[0].replace(/-/g, " ")}
              </span>
            ) : null}
          </div>

          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">
            {tool.tagline || tool.description}
          </p>

          {capabilities.length > 0 ? (
            <ul
              className="mt-2 flex flex-wrap gap-1.5"
              aria-label="Key capabilities"
            >
              {capabilities.map((feature) => (
                <li
                  key={feature}
                  className="rounded-md bg-surface px-2 py-0.5 text-[11px] text-muted"
                >
                  {feature}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-2 text-[12px] text-muted">
            {price}
            {tool.platforms && tool.platforms.length > 0
              ? ` · ${tool.platforms.slice(0, 3).join(", ")}`
              : ""}
            {" · "}
            {/* Never an invented number. D40: rating is null until there
                        are real reviews, and it says so rather than showing 0. */}
            {tool.rating === null ? "Not rated yet" : `${tool.rating} out of 5`}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-1">
            <Link
              href={`/tools/${tool.slug}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-foreground transition-colors duration-200 hover:bg-background"
            >
              View tool
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
            <Link
              href={`/compare?items=tool:${tool.slug}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-muted transition-colors duration-200 hover:bg-background hover:text-foreground"
            >
              <Scale className="size-3.5" aria-hidden />
              Compare
            </Link>
          </div>
        </div>
      </div>
    </Tag>
  );
}
