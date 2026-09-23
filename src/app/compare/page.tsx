import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { Container } from "@/components/ui/container";
import { EndOfList } from "@/components/ui/end-of-list";
import { ButtonLink } from "@/components/ui/button";
import { SparkIcon } from "@/components/ui/spark-icon";
import { CompareProvider } from "@/components/compare/compare-provider";
import { CompareBuilder, type BuilderSlot } from "@/components/compare/builder";
import { AskAboutComparison, CompareActions } from "@/components/compare/compare-actions";
import { ModelsView, MODEL_SECTIONS } from "@/components/compare/models-view";
import {
  CapabilitiesSection,
  DifferencesSection,
  PricingSection,
  PrivacySection,
  ReviewsSection,
  SECTION_LABELS,
  SourcesSection,
  SummarySection,
  TechnicalSection,
  TradeOffsSection,
  UseCasesSection,
  type SectionId,
  type SectionProps,
} from "@/components/compare/sections";
import { cn } from "@/lib/utils";
import { createClient, getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { loadComparison } from "@/lib/compare/queries";
import { compareHref, parseGoal, parseRefs, parseView, refKey, viewType } from "@/lib/compare/params";
import { recordCompareEvents } from "@/lib/compare/analytics";
import { MIN_ITEMS, type CompareItem, type Recommendation } from "@/lib/compare/types";

export const metadata: Metadata = {
  title: "Compare",
  description: "Put AI tools and models side by side and see what actually differs.",
};

/* Reads the session cookie, so it must never be prerendered. */
export const dynamic = "force-dynamic";

/*
  Compare.

  TWO COMPARISONS, ONE PAGE. The Tools tab compares products you subscribe to:
  plans, capabilities, platforms, integrations, privacy, reviews. The Models tab
  compares models you call through an API, laid out like OpenRouter's compare:
  context, output, price per token, modalities, parameters. They never share a
  table (D116). `?view=` picks the tab and `?items=` holds both tabs' items, so
  each tab keeps its selection while the other is showing.

  Everything below the builder is rendered on the server from the public record
  (D111), and every change the person makes is a new URL (D114).

  WHAT THIS PAGE DOES NOT DO (D115). It does not rank, score, weight or choose.
  The recommendation slot is typed and always empty; the Compare Intelligence
  phase fills it without this page changing.
*/

async function savedKeys(items: CompareItem[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (items.length === 0) return out;
  try {
    const user = await getCurrentUser();
    if (!user) return out;
    const db = await createClient();
    const toolIds = items.filter((i) => i.type === "tool").map((i) => i.id);
    const modelIds = items.filter((i) => i.type === "model").map((i) => i.id);
    const filters = [
      toolIds.length > 0 ? `tool_id.in.(${toolIds.join(",")})` : null,
      modelIds.length > 0 ? `model_id.in.(${modelIds.join(",")})` : null,
    ].filter(Boolean);
    /* The caller's own collections only, read under uci_select_auth. Ids here
       came from our own read of the catalogue, never from the URL. */
    const { data } = await db
      .from("user_collection_items")
      .select("tool_id, model_id, user_collections!inner(user_id, deleted_at)")
      .eq("user_collections.user_id", user.id)
      .is("user_collections.deleted_at", null)
      .or(filters.join(","));
    for (const r of (data as { tool_id: string | null; model_id: string | null }[] | null) ?? []) {
      if (r.tool_id) out.add(`tool:${r.tool_id}`);
      if (r.model_id) out.add(`model:${r.model_id}`);
    }
  } catch (err) {
    /* A save marker is a nicety. Its failure costs the bookmark fill, not the page. */
    console.error("[compare] saved state failed", err);
  }
  return out;
}

const TOOL_SECTIONS: SectionId[] = [
  "summary",
  "differences",
  "pricing",
  "capabilities",
  "use-cases",
  "technical",
  "reviews",
  "tradeoffs",
  "privacy",
  "sources",
];

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ items?: string; a?: string; b?: string; goal?: string; view?: string }>;
}) {
  const params = await searchParams;
  const allRefs = parseRefs(params);
  const view = parseView(params.view, allRefs);
  /* This tab loads only its own kind. */
  const refs = allRefs.filter((r) => r.type === viewType(view));
  const toolCount = allRefs.filter((r) => r.type === "tool").length;
  const modelCount = allRefs.length - toolCount;
  const goal = parseGoal(params.goal);
  const noun = view === "models" ? "model" : "tool";
  const nouns = view === "models" ? "models" : "tools";

  let signedIn = false;
  let userId: string | null = null;
  if (isSupabaseConfigured()) {
    const user = await getCurrentUser();
    signedIn = Boolean(user);
    userId = user?.id ?? null;
  }

  const comparison = await loadComparison(refs);
  const items = comparison.slots.flatMap((s) => (s.status === "ok" ? [s.item] : []));
  const saved = signedIn ? await savedKeys(items) : new Set<string>();
  const ready = items.length >= MIN_ITEMS;

  if (ready) {
    /* Not awaited: telemetry never holds up a render. */
    void recordCompareEvents({
      userId,
      itemCount: items.length,
      goal,
      signature: refs.map(refKey).join(","),
      events: items.map((i, position) => ({
        event: "comparison_viewed" as const,
        itemType: i.type,
        itemId: i.id,
        position,
      })),
    });
  }

  const slots: BuilderSlot[] = comparison.slots.map((s) =>
    s.status === "ok"
      ? {
          status: "ok",
          type: s.item.type,
          slug: s.item.slug,
          id: s.item.id,
          name: s.item.name,
          sublabel: s.item.type === "model" ? s.item.provider : (s.item.categories[0] ?? null),
          description: s.item.type === "tool" ? (s.item.tagline ?? s.item.description) : s.item.description,
          logoUrl: s.item.type === "tool" ? s.item.logoUrl : null,
          href: s.item.href,
          saved: saved.has(`${s.item.type}:${s.item.id}`),
        }
      : { status: "unavailable", type: s.ref.type, slug: s.ref.slug, reason: s.reason },
  );

  const props: SectionProps = {
    items,
    attributes: comparison.attributes,
    benchmarks: comparison.benchmarks,
    health: comparison.health,
    goal,
    now: comparison.readAt,
  };

  const nav: SectionId[] = view === "models" ? [...MODEL_SECTIONS] : TOOL_SECTIONS;

  /* Nothing produces one yet. The type is here so the slot is real. */
  const recommendation: Recommendation | null = null;

  /* A starting point for an empty tab, built from real catalogue rows. It keeps
     whatever the other tab already holds. */
  const starter =
    view === "models"
      ? compareHref(
          [
            { type: "model", slug: "claude-opus-5-5" },
            { type: "model", slug: "claude-fable-5-1" },
            { type: "model", slug: "gpt-6-astra" },
            { type: "model", slug: "gpt-5-6-sol" },
            ...allRefs.filter((r) => r.type === "tool"),
          ],
          goal,
          "models",
        )
      : compareHref(
          [
            { type: "tool", slug: "claude" },
            { type: "tool", slug: "gemini" },
            { type: "tool", slug: "cursor" },
            ...allRefs.filter((r) => r.type === "model"),
          ],
          goal,
          "tools",
        );

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />} signedIn={signedIn}>
      <CompareProvider allRefs={allRefs} view={view} goal={goal} itemCount={items.length}>
        <Container className="py-6 sm:py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 id="top" className="font-display text-[clamp(1.6rem,3vw,2.1rem)] font-semibold leading-tight">
                Compare
              </h1>
              <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-muted">
                {view === "models"
                  ? "Put AI models side by side: context, output, price per token, modalities and what the API accepts."
                  : "Put AI tools side by side: plans and prices, what each one does, platforms, integrations and privacy."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ready ? (
                <CompareActions
                  signedIn={signedIn}
                  items={items.map((i) => ({ type: i.type, id: i.id, name: i.name }))}
                />
              ) : null}
              {/* Ask Celpare is always one tap away, not only at the bottom of a
                  long page. With a comparison it jumps to the question box under
                  the items; without one it opens Ask directly. */}
              <a
                href={ready ? "#ask" : "/ask"}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-transparent bg-primary px-4 text-sm font-medium text-on-primary transition-colors duration-200 ease-out hover:bg-primary-hover"
              >
                <SparkIcon className="size-4" />
                Ask Celpare
              </a>
            </div>
          </div>

          {/* The two comparisons. Each keeps its own selection in the URL. */}
          <nav aria-label="What to compare" className="mt-6 flex gap-1 border-b border-border">
            {(["tools", "models"] as const).map((v) => {
              const on = v === view;
              const count = v === "tools" ? toolCount : modelCount;
              return (
                <Link
                  key={v}
                  href={compareHref(allRefs, goal, v)}
                  aria-current={on ? "page" : undefined}
                  scroll={false}
                  className={cn(
                    "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-[15px] font-medium transition-colors duration-200 ease-out",
                    on ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground",
                  )}
                >
                  {v === "tools" ? "Tools" : "Models"}
                  {count > 0 ? (
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[12px] tabular-nums text-muted">
                      {count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-6">
            <CompareBuilder key={view} slots={slots} signedIn={signedIn} />
          </div>

          {ready ? (
            <div id="ask" className="mt-6 scroll-mt-24">
              <AskAboutComparison names={items.map((i) => i.name)} />
            </div>
          ) : null}
        </Container>

        {ready ? (
          <>
            {/* Jump links, sticky inside the main scroller. Ask Celpare is the
                last one, so it is reachable from anywhere on the page. */}
            <nav aria-label="Comparison sections" className="sticky top-0 z-10 border-y border-border bg-background">
              <Container>
                <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 py-2 sm:mx-0 sm:px-0">
                  {nav.map((id) => (
                    <li key={id} className="shrink-0">
                      <a
                        href={`#${id}`}
                        className="inline-flex min-h-9 items-center rounded-full px-3 text-[13px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
                      >
                        {SECTION_LABELS[id]}
                      </a>
                    </li>
                  ))}
                  <li className="shrink-0">
                    <a
                      href="#ask"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors duration-200 ease-out hover:bg-surface"
                    >
                      <SparkIcon className="size-3.5" />
                      Ask Celpare
                    </a>
                  </li>
                </ul>
              </Container>
            </nav>

            <Container>
              {view === "models" ? (
                <ModelsView {...props} />
              ) : (
                <>
                  <SummarySection {...props} recommendation={recommendation} />
                  <DifferencesSection {...props} />
                  <PricingSection {...props} />
                  <CapabilitiesSection {...props} />
                  <UseCasesSection {...props} />
                  <TechnicalSection {...props} />
                  <ReviewsSection {...props} />
                  <TradeOffsSection {...props} />
                  <PrivacySection {...props} />
                  <SourcesSection {...props} />
                </>
              )}

              <div data-compare-section="end">
                <EndOfList
                  icon={<Scale className="size-5" aria-hidden />}
                  title="That is everything on record for these"
                  body="Anything marked Not recorded is a gap in Celpare's data, not a missing feature. Add another option, save this comparison, or ask Celpare to weigh them for what you need."
                >
                  <ButtonLink href="#ask" size="sm">
                    Ask Celpare
                  </ButtonLink>
                  <ButtonLink href="#top" variant="outline" size="sm">
                    Back to top
                  </ButtonLink>
                </EndOfList>
              </div>
            </Container>
          </>
        ) : (
          <Container className="pb-12">
            <div className="mt-4 rounded-2xl border border-border p-6 text-center sm:p-10">
              <Scale className="mx-auto size-6 text-muted" aria-hidden />
              <p className="mt-3 font-display text-[18px] font-semibold">
                {view === "models" ? "Compare AI models" : "Compare AI tools"}
              </p>
              <p className="mx-auto mt-2 max-w-[52ch] text-[14px] leading-relaxed text-muted">
                {items.length === 1
                  ? `Add one more ${noun} to compare with ${items[0].name}.`
                  : `Select at least two ${nouns} to start comparing. You can also start from a search result or Explore, where each one has a Compare link.`}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <ButtonLink href={starter} variant="outline" size="sm">
                  {view === "models" ? "Try Opus 5.5, Fable 5.1, GPT-6 Astra and GPT-5.6 Sol" : "Try Claude, Gemini and Cursor"}
                </ButtonLink>
                <ButtonLink href="/ask" size="sm">
                  Not sure what to compare? Ask Celpare
                </ButtonLink>
              </div>
            </div>
          </Container>
        )}
      </CompareProvider>
    </AppShell>
  );
}
