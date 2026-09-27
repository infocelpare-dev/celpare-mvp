import type { ExploreDebugView } from "@/lib/explore/intelligence/server/debug";

/*
  explore_v1 debug, for admins only. The page renders it only when the URL asks
  (?debug=1) AND getAdminSession() confirms an admin, both on the server; for
  anybody else the data is never computed, let alone sent. The same reading
  idiom as the feed debug: mono, muted, rounded numbers.

  &why=<type:id> (tool:<uuid>, category:<slug>...) answers why one item is
  where it is, or why it is not on a shelf.
*/

export function ExploreDebugPanel({ view }: { view: ExploreDebugView }) {
  return (
    <details className="mt-4 rounded-2xl border border-border px-4 py-3 font-mono text-[12px] leading-relaxed text-muted" open={Boolean(view.why)}>
      <summary className="cursor-pointer text-foreground">
        Explore ranking debug (admins only) · {view.algorithm} · {view.variant}
      </summary>
      <p className="mt-2">
        timings{" "}
        {Object.entries(view.timings)
          .map(([k, v]) => `${k} ${v}ms`)
          .join(", ")}
        {view.failed.length ? ` · failed: ${view.failed.join(", ")}` : ""}
      </p>
      <p>
        pool{" "}
        {Object.entries(view.pool)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ")}
      </p>
      <p>
        profile {view.profile.cold ? "cold" : "warm"} · evidence {view.profile.evidence}
      </p>
      {view.profile.long.length ? <p className="break-words">long {view.profile.long.join(", ")}</p> : null}
      {view.profile.session.length ? <p className="break-words">session {view.profile.session.join(", ")}</p> : null}
      {view.profile.seeds.length ? <p className="break-words">seeds {view.profile.seeds.join(", ")}</p> : null}

      {view.why ? (
        <div className="mt-2 rounded-xl border border-border p-2 text-foreground">
          <p>why {view.why.key}</p>
          {view.why.shown.map((s) => (
            <p key={s.section}>
              shown in {s.section} at {s.position}
            </p>
          ))}
          {view.why.notShown.map((s) => (
            <p key={`${s.section}-${s.reason}`}>
              not in {s.section}: {s.reason}
              {s.detail ? ` (${s.detail})` : ""}
            </p>
          ))}
        </div>
      ) : null}

      {view.sections.map((s) => (
        <div key={s.id} className="mt-3">
          <p className="text-foreground">
            {s.id}
            {s.note ? ` · ${s.note}` : ""}
          </p>
          {Object.keys(s.drops).length ? (
            <p>
              held back{" "}
              {Object.entries(s.drops)
                .map(([k, v]) => `${k} ${v}`)
                .join(", ")}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full whitespace-nowrap">
              <thead>
                <tr className="text-left">
                  <th className="pe-3">#</th>
                  <th className="pe-3">item</th>
                  <th className="pe-3">final</th>
                  <th className="pe-3">band</th>
                  <th className="pe-3">source</th>
                  <th className="pe-3">reason</th>
                  <th className="pe-3">rel</th>
                  <th className="pe-3">nov</th>
                  <th className="pe-3">qual</th>
                  <th className="pe-3">fresh</th>
                  <th className="pe-3">pop</th>
                  <th className="pe-3">mom</th>
                  <th className="pe-3">parts</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((i) => (
                  <tr key={i.key}>
                    <td className="pe-3">{i.position}</td>
                    <td className="pe-3" title={i.key}>
                      {i.title}
                    </td>
                    <td className="pe-3">{i.final}</td>
                    <td className="pe-3">
                      {i.band}
                      {i.exploration ? " (explore)" : ""}
                    </td>
                    <td className="pe-3">{i.source ?? "none"}</td>
                    <td className="pe-3">{i.reason ?? "none"}</td>
                    <td className="pe-3">{i.features.personalRelevance}</td>
                    <td className="pe-3">{i.features.novelty}</td>
                    <td className="pe-3">{i.features.quality}</td>
                    <td className="pe-3">{i.features.freshness}</td>
                    <td className="pe-3">{i.features.popularity}</td>
                    <td className="pe-3">{i.features.momentum}</td>
                    <td className="pe-3">
                      {Object.entries(i.parts)
                        .filter(([, v]) => v > 0)
                        .map(([k, v]) => `${k} ${v}`)
                        .join(" ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </details>
  );
}
