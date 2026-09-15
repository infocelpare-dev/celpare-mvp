import Link from "next/link";
import { Container, Section, SectionHead } from "@/components/ui/container";
import { getFeatured } from "@/lib/platform/settings";
import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  The tools and models an administrator put in content.featured_tools and
  content.featured_models.

  Those two settings existed through the whole of Phase 4P and were read by
  nothing, so featuring a tool featured it nowhere. This is the surface that
  makes them mean something.

  Renders nothing when the list is empty, and nothing when none of the slugs
  resolve. D30 is the reason: an empty shelf with a heading over it implies
  there should be something on it, and inventing a filler row would be exactly
  the fake content that decision forbids. Silence is the honest empty state for
  a section that is optional by design.

  Slugs are resolved against approved rows only, so featuring something and then
  suspending it removes it from here without a second action.
*/

type Row = {
  slug: string;
  name: string;
  tagline: string | null;
  provider?: string | null;
};

async function load(kind: "tools" | "models"): Promise<Row[]> {
  if (!isSupabaseConfigured()) return [];

  const slugs = await getFeatured(kind);
  if (slugs.length === 0) return [];

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from(kind)
    .select(kind === "tools" ? "slug, name, tagline" : "slug, name, provider")
    .in("slug", slugs)
    .eq("status", "approved");

  if (error) {
    console.warn(`[featured] ${kind} failed:`, error.message);
    return [];
  }

  const rows = (data as Row[]) ?? [];

  /* Back into the order the administrator chose. `in` does not preserve it, and
     the order is the point of an ordered list. */
  const position = new Map(slugs.map((slug, i) => [slug.toLowerCase(), i]));
  return rows.sort(
    (a, b) =>
      (position.get(a.slug.toLowerCase()) ?? 0) - (position.get(b.slug.toLowerCase()) ?? 0),
  );
}

export async function FeaturedShelf() {
  const [tools, models] = await Promise.all([load("tools"), load("models")]);
  if (tools.length === 0 && models.length === 0) return null;

  return (
    <Section className="border-t border-border">
      <Container>
        <SectionHead
          title="Featured"
          subtitle="Chosen by the Celpare team, not ranked by a score."
        />

        {tools.length > 0 ? (
          <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-[16px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <li key={tool.slug}>
                <Link
                  href={`/tools/${tool.slug}`}
                  className="block h-full bg-background p-5 transition-colors duration-200 ease-out hover:bg-surface"
                >
                  <h3 className="font-display text-[15px] font-semibold">{tool.name}</h3>
                  {tool.tagline ? (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{tool.tagline}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {models.length > 0 ? (
          <ul
            className={`grid grid-cols-1 gap-px overflow-hidden rounded-[16px] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 ${tools.length > 0 ? "mt-5" : ""}`}
          >
            {models.map((model) => (
              <li key={model.slug}>
                <div className="h-full bg-background p-5">
                  <h3 className="font-display text-[15px] font-semibold">{model.name}</h3>
                  {model.provider ? (
                    <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-muted">
                      {model.provider}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </Container>
    </Section>
  );
}
