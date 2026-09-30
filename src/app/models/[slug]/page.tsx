import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Container } from "@/components/ui/container";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { CompareLink } from "@/components/compare/compare-link";
import { SaveToCollection } from "@/components/collections/save-to-collection";
import { ProfileRecommendations } from "@/components/recommend/profile-recommendations";
import { RecommendationsSkeleton } from "@/components/recommend/recommendations";
import { RecommendationTracker } from "@/components/recommend/recommendation-tracker";
import { getAdminSession } from "@/lib/admin/guard";
import { loadComparison } from "@/lib/compare/queries";
import { money, shortDate, tokens } from "@/lib/compare/present";
import type { Attribute, Evaluation, ModelItem } from "@/lib/compare/types";
import { getCurrentUser } from "@/lib/supabase/server";
import { recordModelView } from "@/lib/telemetry";

/*
  The lean model page (4BK, founder decision 2026-09-28).

  NOT the Phase 5 model product. It exists so a model recommendation has a
  canonical place to land: what the model is, what it costs with the source and
  the date, what it can do as far as the catalogue records, what was measured,
  and then the engine's similar and alternative models.

  Read through Compare's own loader (loadComparison), the one description of a
  model the rest of Celpare already uses, so this page cannot drift from the
  Compare table. Anon client, so RLS limits it to approved models; anything else
  is a 404.

  Missing values say "Not recorded". Nothing here is a rating of the model, and
  benchmarks are listed with who measured them, never averaged (D166).
*/

export const dynamic = "force-dynamic";

async function loadModel(slug: string): Promise<{ model: ModelItem; attributes: Attribute[] } | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const c = await loadComparison([{ type: "model", slug }]);
  const slot = c.slots[0];
  if (!slot || slot.status !== "ok" || slot.item.type !== "model") return null;
  return { model: slot.item, attributes: c.attributes };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadModel(slug);
  if (!data) return { title: "Model not found" };
  const m = data.model;
  return {
    /* The root layout's template adds "| Celpare". */
    title: `${m.name}${m.provider ? ` by ${m.provider}` : ""}`,
    description: m.description?.slice(0, 160) ?? `${m.name} on Celpare: pricing, context, capabilities and similar models.`,
  };
}

const LIFECYCLE: Record<NonNullable<ModelItem["lifecycle"]>, string> = {
  preview: "Preview",
  generally_available: "Generally available",
  deprecated: "Deprecated",
  retired: "Retired",
};

function Section({ title, children, id }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10">
      <h2 className="font-display text-[20px] font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="shrink-0 text-[13px] text-muted sm:w-44">{label}</dt>
      <dd className="min-w-0 text-[15px]">{children}</dd>
    </div>
  );
}

const NotRecorded = () => <span className="text-muted">Not recorded</span>;

function perMillion(v: number | null) {
  return v === null ? <NotRecorded /> : <span className="font-mono">{money(v, "USD")} per 1M tokens</span>;
}

function score(e: Evaluation): string {
  if (e.unit === "percent") return `${Number(e.score.toFixed(1))}%`;
  return String(Number(e.score.toFixed(2)));
}

const REPORTER: Record<string, string> = {
  provider: "reported by the provider",
  competitor: "reported by a competitor",
  independent: "independent",
  third_party_cited: "provider figure, cited by a third party",
};

export default async function ModelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ debug?: string }>;
}) {
  const { slug } = await params;
  const [data, user] = await Promise.all([loadModel(slug), getCurrentUser()]);
  if (!data) notFound();
  const { model: m, attributes } = data;
  const signedIn = Boolean(user);

  const debugRequested = (await searchParams)?.debug === "1";
  const debug = debugRequested && signedIn ? (await getAdminSession()) !== null : false;

  /* Not awaited: a telemetry insert is never something a reader waits on. */
  void recordModelView({ modelId: m.id, userId: user?.id ?? null, source: "direct" });

  const labelOf = new Map(attributes.map((a) => [a.key, a]));
  const flagFacts = m.facts.filter((f) => f.flag !== null && labelOf.get(f.attribute)?.valueType === "flag");
  const supported = flagFacts.filter((f) => f.flag === true);
  const unsupported = flagFacts.filter((f) => f.flag === false);
  const limitations = m.facts.filter((f) => f.attribute === "limitation" && f.text);
  const evaluations = [...m.evaluations].sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name)).slice(0, 16);
  const p = m.prices;

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />} signedIn={signedIn}>
      <Container className="max-w-[820px] py-8 sm:py-12">
        <Link
          href="/explore?tab=models"
          className="inline-flex min-h-11 items-center gap-1.5 text-[14px] text-muted transition-colors duration-200 ease-out hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Explore
        </Link>

        {/* ------------------------------------------------------------ header */}
        <header className="mt-4">
          <h1 className="font-display text-[32px] leading-tight font-semibold tracking-[-0.022em] sm:text-[40px]">{m.name}</h1>
          <p className="mt-2 text-[15px] text-muted">
            {[m.provider, m.family, m.lifecycle ? LIFECYCLE[m.lifecycle] : null, m.releaseDate ? `Released ${shortDate(m.releaseDate)}` : null]
              .filter(Boolean)
              .join(" · ") || "Provider not recorded"}
          </p>
          {m.apiModelId ? <p className="mt-1 font-mono text-[13px] text-muted">{m.apiModelId}</p> : null}
          {m.description ? <p className="mt-4 max-w-[65ch] text-[16px] leading-relaxed">{m.description}</p> : null}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <SaveToCollection entityType="model" entityId={m.id} initialSaved={false} signedIn={signedIn} />
            <CompareLink type="model" slug={m.slug} name={m.name} variant="button" />
            {m.websiteUrl ? (
              <a
                href={m.websiteUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-[14px] transition-colors duration-200 ease-out hover:bg-surface"
              >
                Provider page
                <ExternalLink className="size-3.5 text-muted" aria-hidden />
              </a>
            ) : null}
          </div>
        </header>

        {/* -------------------------------------------------------- at a glance */}
        <Section title="At a glance">
          <dl>
            <Row label="Context window">{m.contextWindow ? <span className="font-mono">{tokens(m.contextWindow)} tokens</span> : <NotRecorded />}</Row>
            <Row label="Max output">{m.maxOutputTokens ? <span className="font-mono">{tokens(m.maxOutputTokens)} tokens</span> : <NotRecorded />}</Row>
            <Row label="Reads">{m.modalities.length ? m.modalities.join(", ") : <NotRecorded />}</Row>
            <Row label="Writes">{m.outputModalities.length ? m.outputModalities.join(", ") : <NotRecorded />}</Row>
            <Row label="Weights">{m.openWeights === null ? <NotRecorded /> : m.openWeights ? "Open weights" : "Closed weights"}</Row>
          </dl>
        </Section>

        {/* ------------------------------------------------------------ pricing */}
        <Section title="Pricing">
          <dl>
            <Row label="Input">{perMillion(p.input)}</Row>
            <Row label="Output">{perMillion(p.output)}</Row>
            {p.cachedInput !== null ? <Row label="Cached input">{perMillion(p.cachedInput)}</Row> : null}
            {p.batchInput !== null ? <Row label="Batch input">{perMillion(p.batchInput)}</Row> : null}
            {p.batchOutput !== null ? <Row label="Batch output">{perMillion(p.batchOutput)}</Row> : null}
          </dl>
          <p className="mt-3 text-[13px] text-muted">
            {p.provenance.label ? (
              p.provenance.url ? (
                <a href={p.provenance.url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
                  {p.provenance.label}
                </a>
              ) : (
                p.provenance.label
              )
            ) : (
              "Source not recorded"
            )}
            {p.provenance.verifiedAt ? `, checked ${shortDate(p.provenance.verifiedAt)}` : ", not verified"}
            {p.note ? `. ${p.note}` : ""}
          </p>
        </Section>

        {/* ------------------------------------------------------- capabilities */}
        <Section title="Capabilities">
          {supported.length === 0 && unsupported.length === 0 ? (
            <p className="text-[14px] text-muted">No capabilities are recorded for this model yet.</p>
          ) : (
            <>
              {supported.length ? (
                <ul className="flex flex-wrap gap-2">
                  {supported.map((f) => (
                    <li key={f.id} className="rounded-full border border-border px-3 py-1.5 text-[14px]" title={f.provenance.label ?? undefined}>
                      {labelOf.get(f.attribute)?.label ?? f.attribute.replace(/_/g, " ")}
                    </li>
                  ))}
                </ul>
              ) : null}
              {unsupported.length ? (
                <p className="mt-3 text-[13px] text-muted">
                  Recorded as not supported: {unsupported.map((f) => labelOf.get(f.attribute)?.label ?? f.attribute.replace(/_/g, " ")).join(", ")}.
                </p>
              ) : null}
            </>
          )}
          {limitations.length ? (
            <div className="mt-5">
              <h3 className="text-[15px] font-medium">Limitations</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">
                {limitations.map((f) => (
                  <li key={f.id}>{f.text}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>

        {/* --------------------------------------------------------- benchmarks */}
        <Section title="Benchmarks">
          {evaluations.length === 0 ? (
            <p className="text-[14px] text-muted">No benchmark results are recorded for this model yet.</p>
          ) : (
            <>
              <ul className="divide-y divide-border border-y border-border">
                {evaluations.map((e) => (
                  <li key={e.id} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                    <span className="min-w-0">
                      <span className="font-medium">{e.name}</span>
                      <span className="text-[13px] text-muted">
                        {" "}
                        · {e.metric}
                        {e.note ? ` · ${e.note}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] text-muted">
                      <span className="font-mono text-[15px] text-foreground">{score(e)}</span>
                      {` · ${e.evaluator}`}
                      {e.reporterRelation ? `, ${REPORTER[e.reporterRelation]}` : ""}
                      {` · ${shortDate(e.evaluatedAt)}`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[13px] text-muted">
                Each number is shown as its source reported it. Benchmarks are never averaged into one score. Compare this model with others to see them side
                by side.
              </p>
            </>
          )}
        </Section>

        {/* ---------------------------------------------- recommendations (4BK) */}
        <Suspense fallback={<RecommendationsSkeleton title="Alternative models" />}>
          <ProfileRecommendations type="model" id={m.id} slug={m.slug} name={m.name} viewerId={user?.id ?? null} signedIn={signedIn} debug={debug} />
        </Suspense>
        <RecommendationTracker />
      </Container>
    </AppShell>
  );
}
