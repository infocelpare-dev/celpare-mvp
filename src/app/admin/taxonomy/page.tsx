import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { listTaxonomy } from "@/lib/admin/queries";
import { TaxonomyForm, TaxonomyDelete } from "@/components/admin/taxonomy-form";
import { FilterTabs } from "@/components/admin/filters";
import { Count, EmptyState, PageHeader, Panel, Section, When } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

/*
  Categories and topics, brief section 20.

  The two tables are identical in shape and different in consequence, which is
  why they share a page and not a list. A category classifies a tool in the
  directory. A topic classifies a post, and the eleven seeded topic slugs are
  the ones G19 is still waiting on the founder to confirm, so this is the surface
  where that answer gets applied.

  Every entry shows what is using it. That number decides both available
  actions: whether renaming the slug is free or breaks live URLs, and whether
  the entry can be deleted at all.
*/

const TABS = [
  { key: "topic", label: "Community topics" },
  { key: "category", label: "Tool categories" },
];

export default async function AdminTaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const session = await requireAdmin("settings.manage");
  const sp = await searchParams;

  const kind = (sp.kind === "category" ? "category" : "topic") as "category" | "topic";
  const rows = await listTaxonomy(session.db, kind);

  const noun = kind === "topic" ? "topic" : "category";
  const href = (k: string) => (k === "topic" ? "/admin/taxonomy" : `/admin/taxonomy?kind=${k}`);

  return (
    <>
      <PageHeader
        title="Categories and topics"
        lead="The platform's two taxonomies. A slug ends up in a URL, so renaming one after content is using it breaks every link that points at it."
        action={
          <Link
            href="/admin/settings"
            className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
          >
            Settings
          </Link>
        }
      />

      <div className="mt-5">
        <FilterTabs
          label="Taxonomy"
          active={href(kind)}
          items={TABS.map((t) => ({ href: href(t.key), label: t.label }))}
        />
      </div>

      <Section title={`Add a ${noun}`}>
        <Panel className="px-4 py-4">
          <TaxonomyForm kind={kind} />
        </Panel>
      </Section>

      <Section
        title={kind === "topic" ? "Topics" : "Categories"}
        action={
          <span className="text-[12px] text-muted">
            <Count n={rows.length} /> {rows.length === 1 ? noun : `${noun}s`}
          </span>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            title={`No ${noun}s yet`}
            body={
              kind === "category"
                ? "Categories classify tools in the directory. Nothing has been created, so the directory has no structure to browse by."
                : "Topics classify community posts. The launch set is seeded by migration, so an empty list here means something removed them."
            }
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-xl border border-border p-4">
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                  <span className="font-mono text-foreground">{row.slug}</span>
                  <span>
                    <Count n={row.uses} /> {kind === "topic" ? "posts" : "tools"}
                  </span>
                  <span className="ml-auto">
                    Added <When iso={row.created_at} />
                  </span>
                </div>

                <TaxonomyForm kind={kind} entry={row} />

                <div className="mt-3 border-t border-border pt-3">
                  <TaxonomyDelete kind={kind} entry={row} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
