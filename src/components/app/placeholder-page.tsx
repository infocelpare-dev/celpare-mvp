import { Container } from "@/components/ui/container";

/*
  A section that exists in the navigation but is not built yet.

  It says what it is and what will be here, and it invents nothing: no sample
  rows, no counts, no screenshots of a product that does not exist (D13, D30).
  The alternative, leaving the nav item out until the page is finished, hides
  the shape of the product from the person using it and makes every launch a
  surprise.
*/
export function PlaceholderPage({
  name,
  what,
  when,
}: {
  /* The page name, used verbatim in the heading. */
  name: string;
  /* One line on what will live here. */
  what: string;
  /* Which phase builds it, so the honesty is specific rather than "soon". */
  when: string;
}) {
  return (
    <Container className="py-12 sm:py-16">
      <h1 className="font-display text-[clamp(1.9rem,4vw,2.6rem)] font-bold leading-tight">
        Welcome to {name}
      </h1>
      <p className="mt-4 max-w-[560px] text-[16px] leading-relaxed text-muted">
        {what}
      </p>
      <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[13px] text-muted">
        <span className="size-1.5 rounded-full bg-accent" aria-hidden />
        Not built yet. {when}
      </p>
    </Container>
  );
}
