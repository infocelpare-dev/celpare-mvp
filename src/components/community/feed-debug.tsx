import type { FeedDebug } from "@/lib/community/intelligence/server/engine";
import type { Evaluation } from "@/lib/community/intelligence/evaluation";

/*
  The ranking debug view, for admins only. The page renders it only when the
  URL asks (?debug=1) AND getAdminSession() confirms an admin, both on the
  server; for anybody else the data is never computed, let alone sent.

  It shows what decided the order: the tier (unseen or recently seen), when and
  how deeply the post was seen, the primary and supporting reasons, the score,
  the penalties and every feature. Numbers are rounded; this is for reading.
*/

export function FeedDebugSummary({
  debug,
  algorithm,
  variant,
  evaluation,
  why = null,
}: {
  debug: FeedDebug;
  algorithm: string;
  variant: string;
  evaluation?: { algorithm: string; variant: string; impressions: number; evaluation: Evaluation }[] | null;
  /* feed_v3: ?why=<post id>, to explain where one post went. */
  why?: string | null;
}) {
  const dropped = Object.entries(debug.dropped ?? {});
  const byReason = new Map<string, number>();
  for (const [, r] of dropped) byReason.set(r, (byReason.get(r) ?? 0) + 1);
  const whyEntry = why ? debug.items[why] : undefined;
  const whyDrop = why ? debug.dropped?.[why] : undefined;
  return (
    <div className="mb-3 rounded-2xl border border-border px-4 py-3 font-mono text-[12px] leading-relaxed text-muted">
      <p className="text-foreground">Ranking debug (admins only)</p>
      <p>
        {algorithm} · {variant} · intent {debug.intent} ({debug.intentConfidence}) · session actions {debug.sessionActions}
      </p>
      {debug.sources ? (
        <p>
          sources{" "}
          {Object.entries(debug.sources)
            .map(([k, v]) => `${k} ${v}`)
            .join(", ")}
        </p>
      ) : null}
      {byReason.size ? (
        <p>
          not on the page or held back{" "}
          {[...byReason.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}
        </p>
      ) : null}
      {why ? (
        <p className="text-foreground">
          why {why.slice(0, 8)}:{" "}
          {whyEntry
            ? `on the page at #${whyEntry.position}${whyDrop ? `, held back as ${whyDrop}` : ""}`
            : whyDrop
              ? `not on the page: ${whyDrop}`
              : "not a candidate: no source retrieved it, or it is not visible to this account"}
        </p>
      ) : null}
      <p>
        candidates {debug.candidates} · seen {debug.seenCount} · served, unseen {debug.served ?? 0} · timings{" "}
        {Object.entries(debug.timings)
          .map(([k, v]) => `${k} ${v}ms`)
          .join(", ")}
      </p>
      {evaluation?.length ? (
        <div className="mt-2">
          <p className="text-foreground">Last 7 days, by version</p>
          {evaluation.map((e) => (
            <p key={`${e.algorithm}-${e.variant}`}>
              {e.algorithm}/{e.variant}: {e.impressions} impressions · position adjusted opens{" "}
              {e.evaluation.relevance.positionAdjustedOpens.toFixed(2)} · long reads{" "}
              {(e.evaluation.relevance.meaningfulRate * 100).toFixed(1)}% · fresh{" "}
              {(e.evaluation.freshness.freshShare * 100).toFixed(0)}% · small creators{" "}
              {(e.evaluation.creators.smallCreatorShare * 100).toFixed(0)}%
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FeedDebugItem({ entry, now }: { entry: FeedDebug["items"][string] | undefined; now: number }) {
  if (!entry) return null;
  const d = entry.debug;
  return (
    <details className="border-b border-border px-4 pb-3 font-mono text-[12px] text-muted sm:px-5">
      <summary className="cursor-pointer py-2 text-foreground">
        #{entry.position} · {d?.tier ?? "?"} · score {entry.score} · {entry.primaryReason ?? "no reason"}
      </summary>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5 break-words">
        <dt>supporting</dt>
        <dd>{entry.supporting.join(", ") || "none"}</dd>
        <dt>sources</dt>
        <dd>{entry.sources.join(", ")}</dd>
        <dt>seen</dt>
        <dd>
          {d?.seenAt
            ? `${d.seenDepth}, ${d.seenSource}, ${Math.round((now - d.seenAt) / 60000)} min ago, penalty ${d.seenPenalty.toFixed(2)}`
            : "never"}
        </dd>
        <dt>first stage</dt>
        <dd>{d ? d.firstStage.toFixed(3) : "?"}</dd>
        <dt>penalties</dt>
        <dd>
          {d
            ? Object.entries(d.penalties)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => `${k} ${v.toFixed(2)}`)
                .join(", ") || "none"
            : "?"}
        </dd>
        <dt>features</dt>
        <dd>
          {entry.features
            ? Object.entries(entry.features)
                .map(([k, v]) => `${k} ${v}`)
                .join(", ")
            : "?"}
        </dd>
      </dl>
    </details>
  );
}
