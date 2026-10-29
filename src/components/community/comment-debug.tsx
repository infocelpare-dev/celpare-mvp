import type { DebugRow } from "@/lib/comments/intelligence/explain";

/*
  Why each comment on the first page sits where it does (guide 20, D217).
  Server rendered, admins only: the page builds the rows only when the debug
  gate allows it, so for anybody else this component never receives data.
*/
export function CommentDebug({ rows, algorithm }: { rows: DebugRow[]; algorithm: string }) {
  return (
    <details className="mt-8 rounded-xl border border-border p-4 text-[13px]">
      <summary className="cursor-pointer font-medium">
        Comment ranking debug, {algorithm}, {rows.length} rows (admin only)
      </summary>
      <ol className="mt-3 space-y-3">
        {rows.map((r, i) => (
          <li key={r.id} className="rounded-lg bg-surface p-3">
            <p className="font-medium">
              {i + 1}. @{r.author} <span className="text-muted">({r.depth}, {r.reason})</span>
            </p>
            <p className="text-muted">
              score {r.score} = positive {r.positive} x (1 - penalty {r.penalty})
              {r.severe ? `, severe: ${r.severe}` : ""}
            </p>
            <p className="mt-1">
              {r.contributions.map((c) => `${c.name} ${c.value}`).join(", ") || "no positive features"}
            </p>
            {r.penalties.length > 0 ? (
              <p className="mt-1 text-muted">penalties: {r.penalties.map((p) => `${p.name} ${p.value}`).join(", ")}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}
