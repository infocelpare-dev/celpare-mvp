import Link from "next/link";
import { compareHref } from "@/lib/compare/params";
import { explainReason } from "@/lib/recommend/reasons";
import { getRecommendations, type CardEntity, type RecommendationView } from "@/lib/recommend/server/engine";
import type { RecItem, RecommendationRequest } from "@/lib/recommend/types";
import { RecSlot } from "./recommendation-tracker";

/*
  A tool and model recommendation section (4BK, guide 17).

  One server component every surface uses. It asks the engine, renders a grid
  (never a horizontal page scroll: two columns from sm, one on a phone), a reason
  line only when the engine gave one, and an optional "Compare" link that adds
  the pair to /compare. Three honest states besides a list:

    failed   the catalogue could not be read: says so (D109)
    empty    nothing close enough: the section is left out, or a stated line
    debug    admins with ?debug=1 see sources, parts and rejections

  Placed inside <Suspense> by the page, so a slow engine never holds the page.
*/

type Props = {
  request: Omit<RecommendationRequest, "userId">;
  viewerId: string | null;
  signedIn: boolean;
  title: string;
  /* One line under the title saying what the list is. */
  blurb?: string;
  /* When set, each card gets "Compare" pairing it with this entry. */
  compareWith?: { type: "tool" | "model"; slug: string } | null;
  /* Compare's own list: each card links to this comparison with the card added. */
  addToComparison?: ((e: CardEntity) => string | null) | null;
  /* A line to show when the list is empty; null hides the section instead. */
  emptyText?: string | null;
  debug?: boolean;
  headingLevel?: "h2" | "h3";
};

export async function ToolModelRecommendations(props: Props) {
  const view = await getRecommendations(props.request, props.viewerId);
  return <RecommendationList view={view} {...props} />;
}

export function RecommendationList({
  view,
  request,
  signedIn,
  title,
  blurb,
  compareWith,
  addToComparison,
  emptyText = null,
  debug,
  headingLevel = "h2",
}: Props & { view: RecommendationView }) {
  const Heading = headingLevel;
  const headingClass = headingLevel === "h2" ? "font-display text-[20px] font-semibold" : "font-display text-[17px] font-semibold";

  if (!view.ok) {
    return (
      <section className="mt-10" aria-label={title}>
        <Heading className={headingClass}>{title}</Heading>
        <p className="mt-3 text-[14px] text-muted" role="status">
          These could not be loaded just now. {view.reason}
        </p>
      </section>
    );
  }

  const { result, entities } = view;
  if (result.items.length === 0 && emptyText === null && !debug) return null;

  return (
    <section className="mt-10" aria-label={title}>
      <Heading className={headingClass}>{title}</Heading>
      {blurb ? <p className="mt-1 text-[13px] text-muted">{blurb}</p> : null}
      {result.items.length === 0 ? (
        <p className="mt-3 text-[14px] text-muted">{emptyText ?? result.note ?? "Nothing close enough yet."}</p>
      ) : (
        <ul
          className="mt-4 grid gap-3 sm:grid-cols-2"
          data-rec-request={result.requestId}
          data-rec-surface={result.surface}
          data-rec-strategy={result.strategy}
          data-rec-variant={result.variant}
          data-rec-section={request.section ?? ""}
        >
          {result.items.map((item) => {
            const e = entities[item.key];
            if (!e) return null;
            return (
              <RecSlot
                key={item.key}
                entityType={e.type}
                entityId={e.id}
                entityKey={item.key}
                position={item.rank}
                reasonCode={item.reason?.code ?? null}
                source={item.source}
                surface={result.surface}
                strategy={result.strategy}
                requestId={result.requestId}
                section={request.section ?? null}
                title={e.name}
                signedIn={signedIn}
              >
                <RecCard entity={e} item={item} compareLink={linkFor(e, compareWith ?? null, addToComparison ?? null)} />
              </RecSlot>
            );
          })}
        </ul>
      )}
      {debug ? <RecDebug view={view} /> : null}
    </section>
  );
}

function linkFor(
  e: CardEntity,
  pair: { type: "tool" | "model"; slug: string } | null,
  add: ((e: CardEntity) => string | null) | null,
): { href: string; label: string } | null {
  if (add) {
    const href = add(e);
    return href ? { href, label: "Add to this comparison" } : null;
  }
  if (pair && pair.type === e.type) return { href: compareHref([pair, { type: e.type, slug: e.slug }]), label: "Compare side by side" };
  return null;
}

function RecCard({ entity: e, item, compareLink }: { entity: CardEntity; item: RecItem; compareLink: { href: string; label: string } | null }) {
  const reason = item.reason ? explainReason(item.reason) : null;
  const fit = item.fit;
  return (
    <div className="flex h-full flex-col rounded-xl border border-border transition-colors duration-200 ease-out hover:bg-surface">
      <Link href={e.href} className="flex min-h-11 flex-1 items-start gap-3 p-4">
        {e.logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={e.logoUrl} alt="" loading="lazy" className="size-9 shrink-0 rounded-lg border border-border object-contain" />
        ) : (
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface font-display text-[14px] font-semibold text-muted"
          >
            {e.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{e.name}</span>
          {e.type === "model" && e.provider ? <span className="block text-[13px] text-muted">{e.provider}</span> : null}
          {e.type === "tool" && e.tagline ? <span className="mt-0.5 line-clamp-2 block text-[13px] leading-relaxed text-muted">{e.tagline}</span> : null}
          {reason ? (
            <span className="mt-1.5 block text-[12px] text-muted">
              {item.exploration ? <span className="mr-1.5 inline-block size-1.5 rounded-full bg-accent align-middle" aria-hidden /> : null}
              {reason}
            </span>
          ) : null}
          {fit && (fit.missing.length > 0 || fit.tradeoffs.length > 0) ? (
            <span className="mt-1 block text-[12px] text-muted">
              {fit.tradeoffs.length ? `Tradeoff: ${fit.tradeoffs[0]}. ` : ""}
              {fit.missing.length ? `Not recorded: ${fit.missing.map((m) => m.split(":")[0]).join(", ")}.` : ""}
            </span>
          ) : null}
        </span>
      </Link>
      {compareLink ? (
        <div className="flex border-t border-border px-4 py-1.5">
          <Link
            href={compareLink.href}
            data-rec-compare=""
            className="inline-flex min-h-9 items-center text-[13px] text-muted underline-offset-2 transition-colors duration-200 ease-out hover:text-foreground hover:underline"
          >
            {compareLink.label}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* Admin only (the page decides): how this list was made, and why others were not. */
function RecDebug({ view }: { view: Extract<RecommendationView, { ok: true }> }) {
  const { result, entities, timings, failed } = view;
  const name = (k: string) => entities[k]?.name ?? k;
  const counts = new Map<string, number>();
  for (const r of result.rejected) counts.set(r.code, (counts.get(r.code) ?? 0) + 1);
  return (
    <details className="mt-4 rounded-xl border border-dashed border-border p-4 text-[12px]">
      <summary className="cursor-pointer font-medium">
        Debug: {result.algorithm}, {result.strategy} on {result.surface}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="font-mono text-muted">
          request {result.requestId} · variant {result.variant} · index {timings.cachedIndex ? "cached" : `${timings.index} ms read, ${timings.build} ms build`} · user {timings.user} ms ·
          pipeline {timings.pipeline} ms{failed.length ? ` · failed reads: ${failed.join(", ")}` : ""}
        </p>
        <p className="text-muted">
          Rejected: {[...counts].map(([c, n]) => `${c} ${n}`).join(", ") || "none"}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="py-1 pr-3 font-medium">#</th>
                <th className="py-1 pr-3 font-medium">Entry</th>
                <th className="py-1 pr-3 font-medium">Sources</th>
                <th className="py-1 pr-3 font-medium">Parts</th>
                <th className="py-1 pr-3 font-medium">Novelty</th>
              </tr>
            </thead>
            <tbody>
              {(result.debug ?? []).slice(0, 30).map((d) => (
                <tr key={d.key} className="border-b border-border align-top">
                  <td className="py-1 pr-3 font-mono">{d.position === null ? "·" : d.position + 1}</td>
                  <td className="py-1 pr-3">{name(d.key)}{d.exploration ? " (exploration)" : ""}</td>
                  <td className="py-1 pr-3 font-mono">{d.sources.join(" ")}</td>
                  <td className="py-1 pr-3 font-mono">
                    {Object.entries(d.parts)
                      .map(([k, v]) => `${k} ${v.toFixed(2)}`)
                      .join(" · ")}
                  </td>
                  <td className="py-1 pr-3 font-mono">{d.novelty.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="space-y-0.5 text-muted">
          {result.rejected.slice(0, 40).map((r, i) => (
            <li key={`${r.key}-${i}`}>
              <span className="font-mono">{r.code}</span> {name(r.key)}
              {r.detail ? `: ${r.detail}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export function RecommendationsSkeleton({ title }: { title: string }) {
  return (
    <section className="mt-10" aria-busy="true" aria-label={`${title}, loading`}>
      <h2 className="font-display text-[20px] font-semibold">{title}</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="h-[92px] animate-pulse rounded-xl border border-border bg-surface motion-reduce:animate-none" />
        ))}
      </ul>
    </section>
  );
}
