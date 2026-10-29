import Link from "next/link";
import { Fragment } from "react";
import { ChevronDown } from "lucide-react";
import { Container } from "@/components/ui/container";
import type { Block, Doc } from "@/content/types";

/*
  The page for every legal and help document (phase LEGAL, 2026-10-07): title,
  effective date and version, a plain summary, the contents (a sticky list from
  lg, a collapsed one below it), anchored sections, and the change log.

  Tables scroll inside their own box on phones, never the page. Text is held to
  about 70 characters a line. Nothing here is a client component.
*/

/* [label](href) or **bold**, nothing else. */
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

export function Rich({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    last = m.index! + m[0].length;
    if (m[3]) {
      out.push(
        <strong key={m.index} className="font-medium text-foreground">
          {m[3]}
        </strong>,
      );
      continue;
    }
    const [, label, href] = m;
    const cls = "underline underline-offset-4 transition-colors duration-200 hover:text-muted";
    out.push(
      href.startsWith("/") ? (
        <Link key={m.index} href={href} className={cls}>
          {label}
        </Link>
      ) : (
        <a key={m.index} href={href} className={cls} rel="noopener noreferrer" target={href.startsWith("mailto:") ? undefined : "_blank"}>
          {label}
        </a>
      ),
    );
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function BlockView({ block }: { block: Block }) {
  if (typeof block === "string") {
    return (
      <p className="text-[15px] leading-[1.7] text-foreground/90">
        <Rich text={block} />
      </p>
    );
  }
  if ("list" in block) {
    return (
      <ul className="list-disc space-y-2 ps-5 text-[15px] leading-[1.65] text-foreground/90 marker:text-muted">
        {block.list.map((item, i) => (
          <li key={i}>
            <Rich text={item} />
          </li>
        ))}
      </ul>
    );
  }
  if ("steps" in block) {
    return (
      <ol className="list-decimal space-y-2 ps-5 text-[15px] leading-[1.65] text-foreground/90 marker:text-muted">
        {block.steps.map((item, i) => (
          <li key={i}>
            <Rich text={item} />
          </li>
        ))}
      </ol>
    );
  }
  if ("note" in block) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-[14px] leading-relaxed">
        <Rich text={block.note} />
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
        <thead className="bg-surface">
          <tr>
            {block.table.head.map((h) => (
              <th key={h} scope="col" className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row, i) => (
            <tr key={i} className="border-t border-border align-top">
              {row.map((cell, j) => (
                <td key={j} className={j === 0 ? "px-4 py-2.5 font-medium" : "px-4 py-2.5 text-foreground/85"}>
                  <Rich text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function DocPage({
  doc,
  section,
  sectionHref,
}: {
  doc: Doc;
  /* "Legal" or "Help", the breadcrumb back to the index. */
  section: string;
  sectionHref: string;
}) {
  const contents = (
    <ol className="space-y-1.5 text-[14px]">
      {doc.sections.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="text-muted transition-colors duration-200 hover:text-foreground">
            {s.heading}
          </a>
        </li>
      ))}
      {doc.changes?.length ? (
        <li>
          <a href="#changes" className="text-muted transition-colors duration-200 hover:text-foreground">
            Changes to this page
          </a>
        </li>
      ) : null}
    </ol>
  );

  return (
    <Container className="py-12 sm:py-16">
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-4">

            <p className="mb-3 text-[13px] font-medium">On this page</p>
            {contents}
          </nav>
        </aside>

        <article className="min-w-0 max-w-[70ch]">
          <p className="text-[14px] text-muted">
            <Link href={sectionHref} className="transition-colors duration-200 hover:text-foreground">
              {section}
            </Link>
          </p>
          <h1 className="mt-2 font-display text-[clamp(1.9rem,4vw,2.6rem)] font-medium leading-tight tracking-[-0.02em]">
            {doc.title}
          </h1>
          <p className="mt-3 text-[14px] text-muted">
            Effective {longDate(doc.effective)}. Version {doc.version}.
          </p>

          {doc.summary?.length ? (
            <div className="mt-8 rounded-2xl border border-border bg-surface p-5">
              <p className="text-[14px] font-medium">In short</p>
              <ul className="mt-3 list-disc space-y-2 ps-5 text-[14px] leading-relaxed marker:text-muted">
                {doc.summary.map((s, i) => (
                  <li key={i}>
                    <Rich text={s} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <details className="group mt-6 rounded-2xl border border-border lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-[14px] font-medium">
              On this page
              <ChevronDown className="size-4 transition-transform duration-200 group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-border px-4 py-3">{contents}</div>
          </details>

          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} className="mt-12 scroll-mt-24">
              <h2 className="font-display text-[20px] font-medium tracking-[-0.01em]">
                <a href={`#${s.id}`} className="hover:underline hover:underline-offset-4">
                  {s.heading}
                </a>
              </h2>
              <div className="mt-4 space-y-4">
                {s.blocks.map((b, i) => (
                  <Fragment key={i}>
                    <BlockView block={b} />
                  </Fragment>
                ))}
              </div>
            </section>
          ))}

          {doc.changes?.length ? (
            <section id="changes" className="mt-14 scroll-mt-24 border-t border-border pt-8">
              <h2 className="font-display text-[17px] font-medium">Changes to this page</h2>
              <ul className="mt-3 space-y-2 text-[14px] text-muted">
                {doc.changes.map((c) => (
                  <li key={c.version}>
                    Version {c.version}, {longDate(c.date)}: {c.note}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>
      </div>
    </Container>
  );
}
