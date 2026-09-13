import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";

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

export function ToolCards({ tools }: { tools: ToolCitation[] }) {
  return (
    <section className="mt-5" aria-label="Tools referenced in this answer">
      <h2 className="mb-2 text-[13px] font-medium text-muted">
        From the Celpare catalogue
      </h2>

      <ul className="grid gap-2">
        {tools.map((tool) => {
          const capabilities = tool.features.slice(0, 3);
          const price = tool.pricing ?? "Pricing not recorded";

          return (
            <li
              key={tool.slug}
              className="rounded-xl border border-border px-4 py-3 transition-colors duration-200 hover:bg-surface"
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
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Key capabilities">
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
                    {tool.rating === null
                      ? "Not rated yet"
                      : `${tool.rating} out of 5`}
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
                      href={`/compare?a=${tool.slug}`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-muted transition-colors duration-200 hover:bg-background hover:text-foreground"
                    >
                      <Scale className="size-3.5" aria-hidden />
                      Compare
                    </Link>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
