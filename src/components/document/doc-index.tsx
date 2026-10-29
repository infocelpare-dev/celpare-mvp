import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/container";
import type { Doc } from "@/content/types";
import { Rich } from "./doc-page";

/* The /legal and /help landing pages: a heading and the documents in groups. */
export function DocIndex({
  title,
  intro,
  base,
  groups,
}: {
  title: string;
  intro: string;
  base: string;
  groups: { title: string; docs: Doc[] }[];
}) {
  return (
    <Container className="max-w-[880px] py-12 sm:py-16">
      <h1 className="font-display text-[clamp(1.9rem,4vw,2.6rem)] font-medium leading-tight tracking-[-0.02em]">
        {title}
      </h1>
      <p className="mt-3 max-w-[60ch] text-[16px] leading-relaxed text-muted">
        <Rich text={intro} />
      </p>

      {groups.map((g) => (
        <section key={g.title} className="mt-12">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted">{g.title}</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {g.docs.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`${base}/${d.slug}`}
                  className="group flex h-full flex-col rounded-2xl border border-border bg-elevated p-5 transition-colors duration-200 hover:bg-surface"
                >
                  <span className="flex items-center justify-between gap-3 font-display text-[16px] font-medium">
                    {d.title}
                    <ArrowRight className="size-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                  <span className="mt-2 text-[14px] leading-relaxed text-muted">{d.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Container>
  );
}
